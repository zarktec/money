import { NextResponse } from "next/server";
import { addMonths, addYears } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEvent, type WompiEvent } from "@/lib/wompi";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const evt = (await req.json().catch(() => null)) as WompiEvent | null;
  if (!evt || !verifyEvent(evt)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

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
    const { data: plan } = sub ? await db.from("plans").select("interval").eq("id", sub.plan_id).single() : { data: null };
    if (sub && plan) {
      const start = new Date();
      const end = plan.interval === "year" ? addYears(start, 1) : plan.interval === "lifetime" ? addYears(start, 100) : addMonths(start, 1);
      await db.from("subscriptions").update({
        status: "active", current_period_start: start.toISOString(), current_period_end: end.toISOString(),
        wompi_payment_source_id: tx.payment_source_id ? String(tx.payment_source_id) : null, wompi_customer_email: tx.customer_email ?? null,
      }).eq("id", sub.id);
      // Un usuario solo conserva una suscripción activa: cancelar las anteriores.
      await db.from("subscriptions").update({ status: "canceled" }).eq("user_id", payment.user_id).neq("id", sub.id).eq("status", "active");
    }
  }
  return NextResponse.json({ ok: true });
}
