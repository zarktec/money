import Link from "next/link";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { projectCashflow } from "@/lib/finance/cashflow";
import { loadSnapshot } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const metadata = { title: "Proyección" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const label = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

export default async function Proyeccion({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const months = [3, 6, 12].includes(Number(sp.m)) ? Number(sp.m) : 6;
  const s = await loadSnapshot();
  const rows = projectCashflow({
    startBalanceCents: s.liquidCents, startMonth: s.month, today: s.today, months, rules: s.rules,
    debts: s.debts.map((d) => ({ balanceCents: d.balanceCents, annualRateEA: d.annualRate, installmentCents: d.installmentCents })),
    goalMonthlyCents: s.goalsMonthlyCents, variableExpenseMonthlyCents: s.avgVariableCents,
  });
  const lowest = rows.reduce((a, r) => (r.endBalanceCents < a.endBalanceCents ? r : a), rows[0]);
  const max = Math.max(...rows.map((r) => Math.abs(r.endBalanceCents)), 1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Proyección de caja</h1>
      <div className="flex gap-2">{[3, 6, 12].map((m) => <Link key={m} href={`/proyeccion?m=${m}`} className={cn("rounded-full px-4 py-2 text-sm", months === m ? "bg-brand text-brand-fg" : "border border-line")}>{m} meses</Link>)}</div>
      <Card><p className="text-sm text-muted">Saldo disponible hoy (efectivo y cuentas)</p><p className="text-2xl font-bold tabular-nums">{formatMoney(s.liquidCents)}</p></Card>
      {lowest.endBalanceCents < 0 && <Card className="border-danger"><p className="font-semibold text-danger">Podrías quedar en negativo en {label(lowest.month)}</p><p className="text-sm text-muted">Tu saldo llegaría a {formatMoney(lowest.endBalanceCents)}. Revisa gastos variables o aplaza ahorros.</p></Card>}
      {rows.map((r) => (
        <Card key={r.month} className="space-y-2">
          <div className="flex items-center justify-between"><p className="font-medium capitalize">{label(r.month)}</p><p className={cn("font-semibold tabular-nums", r.endBalanceCents < 0 && "text-danger")}>{formatMoney(r.endBalanceCents)}</p></div>
          <div className="h-2 rounded-full bg-line"><div className={cn("h-full rounded-full", r.endBalanceCents < 0 ? "bg-danger" : "bg-brand")} style={{ width: `${Math.min(100, (Math.abs(r.endBalanceCents) / max) * 100)}%` }} /></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
            <div className="flex justify-between"><dt>Ingresos fijos</dt><dd className="tabular-nums text-brand">+{formatMoney(r.incomeCents)}</dd></div>
            <div className="flex justify-between"><dt>Egresos fijos</dt><dd className="tabular-nums">−{formatMoney(r.fixedCents)}</dd></div>
            <div className="flex justify-between"><dt>Gasto variable</dt><dd className="tabular-nums">−{formatMoney(r.variableCents)}</dd></div>
            <div className="flex justify-between"><dt>Cuotas de deuda</dt><dd className="tabular-nums">−{formatMoney(r.debtCents)}</dd></div>
            <div className="col-span-2 flex justify-between"><dt>Ahorro sugerido</dt><dd className="tabular-nums">−{formatMoney(r.savingsCents)}</dd></div>
          </dl>
        </Card>
      ))}
      <Card className="space-y-1 text-xs text-muted">
        <p className="font-semibold text-fg">Cómo se calcula</p>
        <p>Parte de tu saldo en efectivo y cuentas. Suma tus ingresos fijos y resta tus egresos fijos en el mes que vencen (un seguro anual aparece en su mes), las cuotas de deuda, el ahorro sugerido de tus metas y un gasto variable promedio de {formatMoney(s.avgVariableCents)} al mes.</p>
        <p>No supone ingresos que no hayas registrado como fijos (por ejemplo, trabajos ocasionales).{s.monthsOfHistory < 3 && " Aún tienes poco historial, así que el gasto variable es una aproximación."}</p>
      </Card>
    </div>
  );
}
