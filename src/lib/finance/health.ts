import type { Cents } from "./money";

export interface HealthInputs {
  avgMonthlyIncomeCents: Cents;
  avgMonthlyExpenseCents: Cents;     // promedio de los últimos meses completos
  liquidCents: Cents;                // efectivo + cuentas + billeteras (sin inversiones ni tarjetas)
  monthlyDebtPaymentsCents: Cents;
  monthlyFixedExpensesCents: Cents;  // recurrentes de egreso, en equivalente mensual
}

export type HealthKey = "savings" | "emergency" | "debt" | "fixed";
export interface HealthComponent { key: HealthKey; label: string; score: number; valueLabel: string; tip: string }
export interface HealthResult { score: number | null; level: "excelente" | "buena" | "regular" | "crítica" | null; components: HealthComponent[] }

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
/** Escala lineal: `bad` → 0 y `good` → 100 (funciona en ambos sentidos). */
const scale = (v: number, bad: number, good: number) => clamp(((v - bad) / (good - bad)) * 100);

export const WEIGHTS: Record<HealthKey, number> = { savings: 0.3, emergency: 0.25, debt: 0.25, fixed: 0.2 };

/**
 * Puntaje 0–100 con cuatro señales: tasa de ahorro (meta 20 %), fondo de emergencia (meta 6 meses de gastos),
 * carga de deuda (cuotas / ingresos, sana ≤ 10 %, crítica ≥ 40 %) y peso de los fijos (sano ≤ 50 %, crítico ≥ 90 %).
 * Sin ingresos registrados no hay puntaje: devolver un número sería inventarlo.
 */
export function healthScore(i: HealthInputs): HealthResult {
  if (i.avgMonthlyIncomeCents <= 0) return { score: null, level: null, components: [] };
  const rate = (i.avgMonthlyIncomeCents - i.avgMonthlyExpenseCents) / i.avgMonthlyIncomeCents;
  const months = i.avgMonthlyExpenseCents > 0 ? i.liquidCents / i.avgMonthlyExpenseCents : i.liquidCents > 0 ? 12 : 0;
  const dti = i.monthlyDebtPaymentsCents / i.avgMonthlyIncomeCents;
  const fixed = (i.monthlyFixedExpensesCents + i.monthlyDebtPaymentsCents) / i.avgMonthlyIncomeCents;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const components: HealthComponent[] = [
    { key: "savings", label: "Tasa de ahorro", score: scale(rate, 0, 0.2), valueLabel: pct(rate), tip: rate >= 0.2 ? "Estás ahorrando una buena parte de tus ingresos." : "Intenta llegar a ahorrar el 20 % de lo que ganas." },
    { key: "emergency", label: "Fondo de emergencia", score: scale(months, 0, 6), valueLabel: `${months.toFixed(1)} meses`, tip: months >= 6 ? "Cubres 6 meses o más de gastos." : "Lo ideal es tener guardados 6 meses de gastos." },
    { key: "debt", label: "Carga de deuda", score: scale(dti, 0.4, 0.1), valueLabel: pct(dti), tip: dti <= 0.1 ? "Tus cuotas son manejables." : "Las cuotas de deuda superan el 10 % de tus ingresos." },
    { key: "fixed", label: "Peso de los gastos fijos", score: scale(fixed, 0.9, 0.5), valueLabel: pct(fixed), tip: fixed <= 0.5 ? "Tienes margen de maniobra." : "Tus fijos y cuotas dejan poco espacio; revisa suscripciones y servicios." },
  ];
  const score = Math.round(components.reduce((a, c) => a + c.score * WEIGHTS[c.key], 0));
  return { score, level: score >= 80 ? "excelente" : score >= 60 ? "buena" : score >= 40 ? "regular" : "crítica", components };
}
