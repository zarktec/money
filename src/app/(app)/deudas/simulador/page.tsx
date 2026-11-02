import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney, parseMoneyInput } from "@/lib/finance/money";
import { simulatePayoff, type DebtInput, type PayoffResult } from "@/lib/finance/debts";
import { todayISO, shiftMonth } from "@/lib/dates";

export const metadata = { title: "Simulador de deudas" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const freeDate = (months: number) => { const m = shiftMonth(todayISO().slice(0, 7), months); return `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`; };
const NAMES = { avalanche: "Avalancha", snowball: "Bola de nieve" } as const;
const WHY = { avalanche: "Ataca primero la deuda con la tasa más alta. Es la que menos intereses cuesta.", snowball: "Ataca primero la deuda más pequeña. Cancelas deudas rápido y eso motiva." } as const;

export default async function Simulador({ searchParams }: { searchParams: Promise<{ extra?: string }> }) {
  const sp = await searchParams;
  const extra = parseMoneyInput(sp.extra ?? "") ?? 0;
  const supabase = await createClient();
  const { data } = await supabase.from("debts").select("id, name, balance_cents, annual_rate, installment_cents").eq("active", true);
  const debts: DebtInput[] = (data ?? []).map((d) => ({ id: d.id, name: d.name, balanceCents: Number(d.balance_cents), annualRateEA: Number(d.annual_rate ?? 0), minPaymentCents: Number(d.installment_cents ?? 0) }));

  const results = debts.length ? (["avalanche", "snowball"] as const).map((s) => simulatePayoff(debts, extra, s)) : [];
  const baseline = debts.length ? simulatePayoff(debts, 0, "avalanche") : null;
  const best = results.length ? [...results].sort((a, b) => Number(a.neverPaid) - Number(b.neverPaid) || a.totalInterestCents - b.totalInterestCents || a.months - b.months)[0] : null;
  const diff = results.length === 2 ? Math.abs(results[0].totalInterestCents - results[1].totalInterestCents) : 0;
  const noMin = debts.some((d) => d.minPaymentCents === 0);

  return (
    <div className="space-y-4">
      <header><Link href="/deudas" className="text-sm text-muted">‹ Deudas</Link><h1 className="text-2xl font-bold">Simulador de pago</h1></header>
      {!debts.length && <p className="py-10 text-center text-muted">Registra al menos una deuda para simular.</p>}
      {debts.length > 0 && (<>
        <Card>
          <form className="space-y-2">
            <label htmlFor="extra" className="text-sm font-medium text-muted">¿Cuánto extra puedes pagar cada mes?</label>
            <div className="flex gap-2"><input id="extra" name="extra" defaultValue={sp.extra ?? ""} inputMode="decimal" placeholder="$ 0" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-4 outline-none focus:border-brand" />
              <button className="h-12 rounded-xl bg-brand px-5 font-semibold text-brand-fg">Simular</button></div>
          </form>
          {noMin && <p className="mt-2 text-xs text-warn">Hay deudas sin cuota mensual: solo se pagarán con el dinero extra.</p>}
        </Card>

        {best && !best.neverPaid && baseline && !baseline.neverPaid && extra > 0 && (
          <Card className="border-brand"><p className="text-sm">Con {formatMoney(extra)} extra al mes quedas libre en <strong>{freeDate(best.months)}</strong>, {baseline.months - best.months} meses antes y ahorrando {formatMoney(baseline.totalInterestCents - best.totalInterestCents)} en intereses.</p></Card>
        )}

        {results.map((r: PayoffResult) => (
          <Card key={r.strategy} className={`space-y-2 ${best?.strategy === r.strategy ? "border-brand" : ""}`}>
            <div className="flex items-center justify-between"><h2 className="font-semibold">{NAMES[r.strategy]}</h2>{best?.strategy === r.strategy && diff > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Menos intereses</span>}</div>
            <p className="text-xs text-muted">{WHY[r.strategy]}</p>
            {r.neverPaid ? <p className="text-sm text-danger">Con este presupuesto las deudas no se terminan de pagar (las cuotas no cubren los intereses).</p> : (
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted">Libre en</dt><dd className="font-semibold">{freeDate(r.months)}</dd><dd className="text-xs text-muted">{r.months} meses</dd></div>
                <div><dt className="text-xs text-muted">Intereses</dt><dd className="font-semibold tabular-nums">{formatMoney(r.totalInterestCents)}</dd></div>
                <div><dt className="text-xs text-muted">Total pagado</dt><dd className="font-semibold tabular-nums">{formatMoney(r.totalPaidCents)}</dd></div>
              </dl>)}
            {!r.neverPaid && <ol className="space-y-1 text-sm">{r.payoffOrder.map((p, i) => <li key={p.id} className="flex justify-between"><span>{i + 1}. {p.name}</span><span className="text-muted">mes {p.month}</span></li>)}</ol>}
          </Card>
        ))}
        {diff > 0 && <p className="text-center text-xs text-muted">La diferencia de intereses entre estrategias es de {formatMoney(diff)}. Elige la que te mantenga constante.</p>}
        <p className="text-center text-xs text-muted">Simulación con tasa efectiva anual constante y presupuesto mensual fijo. Es una estimación, no una oferta financiera.</p>
      </>)}
    </div>
  );
}
