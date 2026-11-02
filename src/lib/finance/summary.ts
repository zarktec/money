import type { Cents } from "./money";

export interface MonthInputs {
  incomeCents: Cents;           // ingresos confirmados del mes
  expenseCents: Cents;          // egresos confirmados del mes
  provisionsCents: Cents;       // suma de provisiones mensuales de pagos no mensuales
  goalContributionsCents: Cents;// cuotas mensuales sugeridas de metas activas
  pendingFixedCents: Cents;     // recurrentes mensuales del mes aún no pagados
}

/**
 * "Disponible para gastar": lo que queda tras ingresos − gastos ya hechos − compromisos del mes
 * (provisiones, aportes a metas y fijos pendientes). Puede ser negativo (alerta).
 */
export function availableToSpend(m: MonthInputs): Cents {
  return m.incomeCents - m.expenseCents - m.provisionsCents - m.goalContributionsCents - m.pendingFixedCents;
}

export const savingsRate = (income: Cents, expense: Cents) =>
  income <= 0 ? 0 : Math.round(((income - expense) / income) * 100);
