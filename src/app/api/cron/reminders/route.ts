import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { mailConfigured, sendMail } from "@/lib/mail/resend";
import { emailFor } from "@/lib/mail/notify";
import { remindersEmail } from "@/lib/mail/templates";
import { remindersDue, reminderKey, reminderText, type DueReminder, type RuleLite } from "@/lib/finance/planning";

export const runtime = "nodejs";

/** Diario (7 a. m. Colombia): envía recordatorios por push y por correo (un solo correo con todos los del día); reminder_log evita duplicados si el cron corre dos veces. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  const pushOn = !!pub && !!priv, mailOn = mailConfigured();
  if (!pushOn && !mailOn) return NextResponse.json({ ok: true, skipped: "Sin canales de aviso configurados (VAPID / Resend)" });
  if (pushOn) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:soporte@example.com", pub!, priv!);

  const db = createAdminClient();
  const today = todayISO();
  const { data: rules, error } = await db.from("recurring_rules")
    .select("id, user_id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active")
    .eq("active", true).lte("next_date", addDaysISO(today, 30)).gte("next_date", today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, DueReminder[]>();
  for (const r of rules ?? []) for (const d of remindersDue([r as RuleLite], today)) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), d]);

  let sent = 0, skipped = 0, removed = 0, mailed = 0;
  for (const [userId, reminders] of byUser) {
    const { data: subs } = pushOn ? await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId) : { data: [] };
    for (const d of subs?.length ? reminders : []) {
      // Reservar primero: si otro proceso ya lo reservó, el índice único lo rechaza.
      const key = reminderKey(d);
      const { error: dup } = await db.from("reminder_log").insert({ user_id: userId, reminder_key: key });
      if (dup) { skipped++; continue; }
      const payload = JSON.stringify({ ...reminderText(d), tag: key, url: "/calendario" });
      let delivered = 0, transient = false;
      for (const s of subs ?? []) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); delivered++; }
        catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); removed++; } else transient = true;
        }
      }
      sent += delivered;
      // Si nada se entregó por un fallo temporal, liberar la reserva para reintentar en la siguiente corrida.
      if (!delivered && transient) await db.from("reminder_log").delete().eq("user_id", userId).eq("reminder_key", key);
    }
  }

  // Correo: una reserva por recordatorio (clave con «:mail», independiente de la del push) y un solo mensaje por usuario.
  if (mailOn) for (const [userId, reminders] of byUser) {
    const email = await emailFor(db, userId);
    if (!email) continue;
    const fresh: { key: string; d: DueReminder }[] = [];
    for (const d of reminders) {
      const key = `${reminderKey(d)}:mail`;
      const { error: dup } = await db.from("reminder_log").insert({ user_id: userId, reminder_key: key });
      if (dup) skipped++; else fresh.push({ key, d });
    }
    if (!fresh.length) continue;
    const r = await sendMail({ to: email, ...remindersEmail(fresh.map((f) => reminderText(f.d))), idempotencyKey: `rem:${userId}:${fresh.map((f) => f.key).join("|")}`.slice(0, 256) });
    if (r.ok) mailed++;
    else if (r.transient) for (const f of fresh) await db.from("reminder_log").delete().eq("user_id", userId).eq("reminder_key", f.key);   // reintentar luego
  }
  return NextResponse.json({ ok: true, users: byUser.size, sent, mailed, skipped, removedSubscriptions: removed });
}
