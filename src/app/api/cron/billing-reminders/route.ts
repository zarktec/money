import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { pushConfigured, sendToUser } from "@/lib/push";

export const runtime = "nodejs";
const DAY = 86_400_000;

/** Aviso (una vez por tramo: a 3 días y a 1 día) de que el plan o la prueba está por vencer. No molesta a quien ya canceló. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ok: true, skipped: "VAPID no configurado" });
  const db = createAdminClient();
  const now = Date.now();
  const { data: subs, error } = await db.from("subscriptions").select("id, user_id, status, current_period_end, cancel_at_period_end, plan:plans(name)")
    .in("status", ["active", "trialing", "past_due"]).gt("current_period_end", new Date(now).toISOString()).lte("current_period_end", new Date(now + 3 * DAY).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0, skipped = 0;
  for (const s of subs ?? []) {
    if (s.cancel_at_period_end && s.status !== "trialing") { skipped++; continue; }
    const end = Date.parse(s.current_period_end);
    const bucket = end - now <= DAY ? 1 : 3;
    const days = Math.max(Math.ceil((end - now) / DAY), 1);
    const key = `sub:${s.id}:${s.current_period_end.slice(0, 10)}:${bucket}`;
    const { error: dup } = await db.from("reminder_log").insert({ user_id: s.user_id, reminder_key: key });
    if (dup) { skipped++; continue; }                                    // ya se envió este tramo
    const plan = Array.isArray(s.plan) ? s.plan[0] : s.plan;
    const trial = s.status === "trialing";
    const r = await sendToUser(db, s.user_id, {
      title: trial ? "Tu prueba gratis termina pronto" : "Tu plan vence pronto",
      body: `${trial ? "Tu prueba" : `Tu plan ${plan?.name ?? ""}`.trim()} vence en ${days} día${days === 1 ? "" : "s"}. Renueva para no perder tus beneficios.`,
      url: "/precios", tag: key,
    });
    if (!r.delivered && r.transient) await db.from("reminder_log").delete().eq("user_id", s.user_id).eq("reminder_key", key);   // reintentar luego
    sent += r.delivered;
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
