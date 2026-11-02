import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { DebtPaymentForm } from "@/components/insight-forms";
import { formatMoney } from "@/lib/finance/money";
import { monthsToPayOff } from "@/lib/finance/debts";
import { getFormOptions } from "@/lib/options";
import { todayISO } from "@/lib/dates";
import { closeDebt, deleteDebt } from "../../actions-insights";

export const metadata = { title: "Deuda" };

export default async function Deuda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: d } = await supabase.from("debts").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const [{ data: pays }, { accounts }] = await Promise.all([
    supabase.from("debt_payments").select("id, paid_on, amount_cents, principal_cents, interest_cents").eq("debt_id", id).order("paid_on", { ascending: false }).limit(60),
    getFormOptions(),
  ]);
  const balance = Number(d.balance_cents), principal = Number(d.principal_cents);
  const paidPct = principal > 0 ? Math.max(Math.round(((principal - balance) / principal) * 100), 0) : 0;
  const plan = d.installment_cents ? monthsToPayOff(balance, Number(d.annual_rate ?? 0), Number(d.installment_cents)) : null;
  const interestPaid = (pays ?? []).reduce((a, p) => a + Number(p.interest_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <header><p className="text-sm text-muted">{d.creditor ?? "Deuda"}{d.annual_rate != null && ` · ${d.annual_rate}% E.A.`}</p><h1 className="text-2xl font-bold">{d.name}</h1></header>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Saldo actual</p><p className="text-3xl font-bold tabular-nums">{formatMoney(balance)}</p>
        <Progress percent={paidPct} label="Pagado" /><p className="text-sm text-muted">{paidPct}% pagado de {formatMoney(principal)}</p>
        {!d.active && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Deuda saldada 🎉</p>}
        {d.active && plan && (plan.neverPaid
          ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Con la cuota de {formatMoney(Number(d.installment_cents))} no alcanzas a cubrir los intereses: la deuda no baja.</p>
          : <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Pagando {formatMoney(Number(d.installment_cents))} al mes terminas en {plan.months} cuotas y pagas {formatMoney(plan.totalInterestCents)} más en intereses.</p>)}
        {interestPaid > 0 && <p className="text-xs text-muted">Intereses pagados hasta hoy: {formatMoney(interestPaid)}</p>}
      </Card>

      {d.active && (<Card><h2 className="mb-3 font-semibold">Registrar pago</h2>
        <DebtPaymentForm debtId={d.id} accounts={accounts} today={todayISO()} defaultAmount={d.installment_cents ? String(Number(d.installment_cents) / 100) : ""} />
        {d.next_due_date && <p className="mt-2 text-xs text-muted">Próximo vencimiento: {d.next_due_date}</p>}</Card>)}

      <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Pagos</h2>
        {!pays?.length && <p className="text-sm text-muted">Aún no has registrado pagos.</p>}
        {pays?.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
            <div><p className="text-sm">{p.paid_on}</p><p className="text-xs text-muted">Capital {formatMoney(Number(p.principal_cents ?? 0))} · interés {formatMoney(Number(p.interest_cents ?? 0))}</p></div>
            <p className="font-semibold tabular-nums">{formatMoney(Number(p.amount_cents))}</p>
          </Card>
        ))}</section>

      <div className="flex gap-2 pt-2">
        {d.active && <form action={closeDebt}><input type="hidden" name="id" value={d.id} /><button className="rounded-lg border border-line px-3 py-2 text-sm">Marcar como saldada</button></form>}
        <form action={deleteDebt}><input type="hidden" name="id" value={d.id} /><button className="rounded-lg px-3 py-2 text-sm text-danger">Eliminar</button></form>
      </div>
    </div>
  );
}
