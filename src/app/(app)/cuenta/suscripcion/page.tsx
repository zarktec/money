import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { PaymentPoller } from "@/components/payment-poller";
import { formatMoney } from "@/lib/finance/money";
import { getPlanLimits, numericLimit } from "@/lib/plan-limits";
import { monthlyAiLimit } from "@/lib/ai/usage";
import { cancelAtPeriodEnd, resumeSubscription } from "../../actions-billing";

export const metadata = { title: "Mi plan" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { active: "Activo", trialing: "En prueba", past_due: "Pago pendiente", pending: "Pendiente de pago", canceled: "Cancelado", expired: "Vencido" };
const PAY: Record<string, string> = { APPROVED: "Aprobado", PENDING: "En proceso", DECLINED: "Rechazado", VOIDED: "Anulado", ERROR: "Error" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

export default async function Suscripcion({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [{ data: sub }, { data: pays }, limits, acc, prj, goal, mail, ai] = await Promise.all([
    supabase.from("subscriptions").select("id, status, current_period_end, cancel_at_period_end, trial_started_at, card_brand, card_last4, wompi_payment_source_id, plan:plans(name, price_cents, interval)")
      .in("status", ["active", "trialing", "past_due"]).gt("current_period_end", now.toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("id, reference, amount_cents, status, created_at").order("created_at", { ascending: false }).limit(12),
    (async () => { const { data: { user } } = await supabase.auth.getUser(); return getPlanLimits(supabase, user!.id); })(),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("savings_goals").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("email_connections").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
  ]);
  const plan = Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan;
  const refPayment = ref ? (pays ?? []).find((p) => p.reference === ref) : undefined;
  const usage: { label: string; used: number; limit: number | null }[] = [
    { label: "Cuentas", used: acc.count ?? 0, limit: limits.accounts == null ? null : numericLimit(limits, "accounts", 0) },
    { label: "Proyectos", used: prj.count ?? 0, limit: limits.projects == null ? null : numericLimit(limits, "projects", 0) },
    { label: "Metas de ahorro activas", used: goal.count ?? 0, limit: limits.goals == null ? null : numericLimit(limits, "goals", 0) },
    { label: "Cuentas de correo", used: mail.count ?? 0, limit: limits.email_connections == null ? null : numericLimit(limits, "email_connections", 0) },
    { label: "Consultas con IA este mes", used: ai.count ?? 0, limit: monthlyAiLimit(limits) },
  ];
  const daysLeft = sub?.current_period_end ? Math.max(Math.ceil((Date.parse(sub.current_period_end) - now.getTime()) / 86_400_000), 0) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mi plan</h1>
      <PaymentPoller active={refPayment?.status === "PENDING" || (!!ref && !refPayment)} />

      {ref && (!refPayment || refPayment.status === "PENDING") && <p role="status" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Estamos confirmando tu pago con Wompi. Esto toma unos segundos…</p>}
      {refPayment?.status === "APPROVED" && <p role="status" className="rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand">¡Pago aprobado! Tu plan ya está activo. 🎉</p>}
      {refPayment && ["DECLINED", "ERROR", "VOIDED"].includes(refPayment.status) && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">El pago no fue aprobado ({PAY[refPayment.status]}). No se te cobró. <Link href="/precios" className="underline">Intentar de nuevo</Link>.</p>}

      <Card className="space-y-2">
        {sub ? (<>
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">Plan actual</p><p className="text-xl font-bold">{plan?.name}</p></div>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">{STATUS[sub.status]}</span></div>
          <p className="text-sm text-muted">
            {sub.status === "trialing" ? `Tu prueba termina el ${fmt(sub.current_period_end)} (${daysLeft} día${daysLeft === 1 ? "" : "s"}).`
              : sub.cancel_at_period_end ? `No se renovará. Conservas tus beneficios hasta el ${fmt(sub.current_period_end)}.`
              : sub.status === "past_due" ? `No pudimos cobrar la renovación. Conservas tus beneficios hasta el ${fmt(sub.current_period_end)}.`
              : `Se renueva el ${fmt(sub.current_period_end)}${plan ? ` por ${formatMoney(plan.price_cents)}` : ""}.`}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {sub.status === "trialing" || sub.status === "past_due" ? <Link href="/precios" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">{sub.status === "trialing" ? "Pagar para continuar" : "Pagar ahora"}</Link> : null}
            {sub.cancel_at_period_end
              ? <form action={resumeSubscription}><input type="hidden" name="id" value={sub.id} /><button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Reanudar renovación</button></form>
              : sub.status !== "trialing" && <form action={cancelAtPeriodEnd}><input type="hidden" name="id" value={sub.id} /><button className="rounded-lg px-3 py-2 text-sm text-danger">Cancelar suscripción</button></form>}
          </div>
        </>) : (<>
          <p className="text-sm text-muted">Plan actual</p><p className="text-xl font-bold">Gratis</p>
          <Link href="/precios" className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">Ver planes</Link>
        </>)}
      </Card>

      <Card className="space-y-3"><h2 className="font-semibold">Tu uso</h2>
        {usage.map((u) => (<div key={u.label} className="space-y-1">
          <div className="flex justify-between text-sm"><span>{u.label}</span><span className="tabular-nums text-muted">{u.used}{u.limit === null ? " (sin límite)" : ` de ${u.limit}`}</span></div>
          {u.limit !== null && u.limit > 0 && <Progress percent={Math.round((u.used / u.limit) * 100)} level={u.used >= u.limit ? "over" : u.used / u.limit >= 0.8 ? "warn" : "ok"} label={u.label} />}
        </div>))}
        <p className="text-xs text-muted">Si llegas a un límite, <Link href="/precios" className="underline">mejora tu plan</Link>.</p>
      </Card>

      {!!pays?.length && <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Pagos</h2>
        {pays.map((p) => <Card key={p.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm">{fmt(p.created_at)}</p><p className="text-xs text-muted">{PAY[p.status] ?? p.status}</p></div><p className="font-semibold tabular-nums">{formatMoney(Number(p.amount_cents))}</p></Card>)}</section>}
    </div>
  );
}
