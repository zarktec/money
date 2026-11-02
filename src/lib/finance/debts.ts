import type { Cents } from "./money";

export interface DebtInput { id: string; name: string; balanceCents: Cents; annualRateEA: number; minPaymentCents: Cents }
export type Strategy = "avalanche" | "snowball";

/** Tasa mensual equivalente a una tasa efectiva anual (E.A., la que usan los bancos en Colombia). */
export const monthlyRate = (eaPercent: number): number => (eaPercent <= 0 ? 0 : Math.pow(1 + eaPercent / 100, 1 / 12) - 1);

export interface PaymentSplit { interestCents: Cents; principalCents: Cents; newBalanceCents: Cents }

/** Reparte un pago entre interés del periodo y abono a capital. Un pago menor al interés no reduce la deuda. */
export function splitPayment(balanceCents: Cents, eaPercent: number, paymentCents: Cents): PaymentSplit {
  const interest = Math.min(Math.round(balanceCents * monthlyRate(eaPercent)), paymentCents);
  const principal = Math.min(paymentCents - interest, balanceCents);
  return { interestCents: interest, principalCents: principal, newBalanceCents: balanceCents - principal };
}

export interface PayoffResult {
  strategy: Strategy;
  months: number;
  totalInterestCents: Cents;
  totalPaidCents: Cents;
  /** true si con ese presupuesto la deuda nunca se termina de pagar (la cuota no cubre los intereses). */
  neverPaid: boolean;
  /** Mes (1 = el mes que viene) en que se cancela cada deuda, en el orden en que se cancelan. */
  payoffOrder: { id: string; name: string; month: number }[];
}

const MAX_MONTHS = 600;

/**
 * Simula el pago de varias deudas con un presupuesto mensual fijo = suma de cuotas mínimas + `extraCents`.
 * Al cancelarse una deuda, su cuota pasa a atacar la siguiente según la estrategia
 * (avalancha: mayor tasa primero; bola de nieve: menor saldo primero).
 */
export function simulatePayoff(debts: DebtInput[], extraCents: Cents, strategy: Strategy): PayoffResult {
  const live = debts.filter((d) => d.balanceCents > 0).map((d) => ({ ...d, bal: d.balanceCents, rate: monthlyRate(d.annualRateEA) }));
  const budget = live.reduce((a, d) => a + d.minPaymentCents, 0) + Math.max(extraCents, 0);
  const order = (a: (typeof live)[number], b: (typeof live)[number]) =>
    strategy === "avalanche" ? b.annualRateEA - a.annualRateEA || a.bal - b.bal : a.bal - b.bal || b.annualRateEA - a.annualRateEA;

  let interestTotal = 0, paidTotal = 0, month = 0;
  const payoffOrder: PayoffResult["payoffOrder"] = [];

  while (live.some((d) => d.bal > 0) && month < MAX_MONTHS) {
    month++;
    for (const d of live) if (d.bal > 0) { const i = Math.round(d.bal * d.rate); d.bal += i; interestTotal += i; }
    let pool = budget;
    for (const d of live) { // mínimos primero
      if (d.bal <= 0) continue;
      const pay = Math.min(d.minPaymentCents, d.bal, pool);
      d.bal -= pay; pool -= pay; paidTotal += pay;
    }
    for (const d of [...live].filter((x) => x.bal > 0).sort(order)) { // sobrante según estrategia
      if (pool <= 0) break;
      const pay = Math.min(pool, d.bal);
      d.bal -= pay; pool -= pay; paidTotal += pay;
    }
    for (const d of live) if (d.bal <= 0 && !payoffOrder.some((p) => p.id === d.id)) payoffOrder.push({ id: d.id, name: d.name, month });
  }

  const neverPaid = live.some((d) => d.bal > 0);
  return { strategy, months: neverPaid ? MAX_MONTHS : month, totalInterestCents: interestTotal, totalPaidCents: paidTotal, neverPaid, payoffOrder };
}

/** Meses restantes y primer mes de pago de una sola deuda pagando solo su cuota. */
export function monthsToPayOff(balanceCents: Cents, eaPercent: number, installmentCents: Cents) {
  const r = simulatePayoff([{ id: "x", name: "x", balanceCents, annualRateEA: eaPercent, minPaymentCents: installmentCents }], 0, "avalanche");
  return { months: r.months, neverPaid: r.neverPaid, totalInterestCents: r.totalInterestCents };
}
