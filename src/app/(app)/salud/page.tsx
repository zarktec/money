import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { healthScore } from "@/lib/finance/health";
import { loadSnapshot } from "@/lib/insights";

export const metadata = { title: "Salud financiera" };
const COLOR = { excelente: "text-brand", buena: "text-brand", regular: "text-warn", crítica: "text-danger" } as const;

export default async function Salud() {
  const s = await loadSnapshot();
  const h = healthScore({
    avgMonthlyIncomeCents: s.avgIncomeCents, avgMonthlyExpenseCents: s.avgExpenseCents, liquidCents: s.liquidCents,
    monthlyDebtPaymentsCents: s.debtPaymentsMonthlyCents, monthlyFixedExpensesCents: s.fixedMonthlyCents,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Salud financiera</h1>
      {h.score === null ? (
        <Card className="text-center"><p className="font-semibold">Aún no podemos calcularla</p><p className="mt-1 text-sm text-muted">Registra tus ingresos de al menos un mes y vuelve aquí.</p></Card>
      ) : (<>
        <Card className="text-center">
          <p className="text-sm text-muted">Tu puntaje</p>
          <p className={`text-6xl font-bold tabular-nums ${COLOR[h.level!]}`}>{h.score}</p>
          <p className={`font-semibold capitalize ${COLOR[h.level!]}`}>{h.level}</p>
          <p className="mt-2 text-xs text-muted">Basado en {s.monthsOfHistory === 1 ? "1 mes" : `${s.monthsOfHistory} meses`} de movimientos</p>
        </Card>
        {h.components.map((c) => (
          <Card key={c.key} className="space-y-2">
            <div className="flex items-center justify-between"><p className="font-medium">{c.label}</p><p className="text-sm tabular-nums">{c.valueLabel}</p></div>
            <Progress percent={c.score} level={c.score >= 70 ? "ok" : c.score >= 40 ? "warn" : "over"} label={c.label} />
            <p className="text-xs text-muted">{c.tip}</p>
          </Card>
        ))}
        <p className="text-center text-xs text-muted">Es una guía orientativa con reglas generales (ahorrar 20 %, fondo de 6 meses, deuda ≤ 10 % de ingresos), no asesoría financiera.</p>
      </>)}
    </div>
  );
}
