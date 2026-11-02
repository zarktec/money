import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegration } from "@/lib/integrations/store";
import { verifyEvent, type WompiEvent } from "@/lib/wompi";
import { mailConfigured, sendMail } from "@/lib/mail/resend";
import { emailFor } from "@/lib/mail/notify";
import { paymentReceiptEmail } from "@/lib/mail/templates";
import { nextPeriod, type Interval } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const evt = (await req.json().catch(() => null)) as WompiEvent | null;
  if (!evt || !verifyEvent(evt, (await getIntegration("wompi")).events_secret)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  const tx = evt.data.transaction;
  if (evt.event !== "transaction.updated" || !tx) return NextResponse.json({ ok: true, ignored: true });

  const db = createAdminClient();
  const { data: payment } = await db.from("payments").select("*").eq("reference", tx.reference).single();
  if (!payment) return NextResponse.json({ ok: true, unknown_reference: true });

  // Defensa: el monto confirmado debe coincidir con el esperado.
  if (tx.status === "APPROVED" && (tx.amount_in_cents !== payment.amount_cents || tx.currency !== payment.currency)) {
    await db.from("audit_log").insert({ action: "wompi.amount_mismatch", entity: "payments", entity_id: payment.id, meta: { tx } });
    return NextResponse.json({ error: "Monto no coincide" }, { status: 422 });
  }

  // Idempotencia: no reprocesar un pago ya aprobado.
  if (payment.status === "APPROVED") return NextResponse.json({ ok: true, duplicate: true });

  await db.from("payments").update({
    status: tx.status, wompi_transaction_id: tx.id, payment_method: tx.payment_method_type ?? null, raw: evt as never,
  }).eq("id", payment.id);

  if (tx.status === "APPROVED" && payment.subscription_id) {
    const { data: sub } = await db.from("subscriptions").select("id, plan_id, current_period_end").eq("id", payment.subscription_id).single();
    const { data: plan } = sub ? await db.from("plans").select("interval, name").eq("id", sub.plan_id).single() : { data: null };
    if (sub && plan) {
      // Renovación a tiempo: el nuevo periodo empieza donde terminó el anterior (no se pierden días).
      const { start, end } = nextPeriod(plan.interval as Interval, sub.current_period_end, new Date());
      await db.from("subscriptions").update({
        status: "active", current_period_start: start.toISOString(), current_period_end: end.toISOString(), renewal_attempts: 0, last_renewal_attempt_at: null,
        ...(tx.payment_source_id ? { wompi_payment_source_id: String(tx.payment_source_id) } : {}), wompi_customer_email: tx.customer_email ?? null,
      }).eq("id", sub.id);
      // Un usuario solo conserva una suscripción vigente: cancelar las anteriores (activas o en prueba) de otros planes/compras.
      await db.from("subscriptions").update({ status: "canceled" }).eq("user_id", payment.user_id).neq("id", sub.id).in("status", ["active", "trialing"]);
      // Recibo por correo. Es un extra: si falla, el pago ya quedó registrado y no se debe reintentar el webhook por esto.
      if (mailConfigured() && payment.user_id) {
        try {
          const email = await emailFor(db, payment.user_id);
          if (email) await sendMail({ to: email, ...paymentReceiptEmail({ planName: (plan as { name?: string }).name ?? "", amountCents: payment.amount_cents, currency: payment.currency, reference: payment.reference, date: new Date() }), idempotencyKey: `receipt:${payment.id}` });
        } catch { /* sin recibo */ }
      }
    }
  } else if (tx.status === "DECLINED" || tx.status === "ERROR") {
    // Cobro automático rechazado: la suscripción queda en mora y el cron reintenta; ver /api/cron/renewals.
    if (payment.subscription_id) await db.from("subscriptions").update({ status: "past_due" }).eq("id", payment.subscription_id).eq("status", "active");
  }
  return NextResponse.json({ ok: true });
}
