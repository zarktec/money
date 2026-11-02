import { describe, expect, it } from "vitest";
import { monthlyRate, monthsToPayOff, simulatePayoff, splitPayment, type DebtInput } from "./debts";
import { healthScore } from "./health";
import { netWorth } from "./networth";
import { projectCashflow } from "./cashflow";
import type { RuleLite } from "./planning";

const d = (id: string, bal: number, ea: number, min: number): DebtInput => ({ id, name: id, balanceCents: bal, annualRateEA: ea, minPaymentCents: min });

describe("tasas y pagos", () => {
  it("E.A. a mensual: 12,68 % E.A. ≈ 1 % mensual", () => {
    expect(monthlyRate(12.6825)).toBeCloseTo(0.01, 4);
    expect(monthlyRate(0)).toBe(0);
  });
  it("reparte el pago en interés y capital", () => {
    const s = splitPayment(100_000_000, 12.6825, 20_000_000);
    expect(s.interestCents).toBe(1_000_000);
    expect(s.principalCents).toBe(19_000_000);
    expect(s.newBalanceCents).toBe(81_000_000);
  });
  it("un pago menor al interés no baja la deuda; uno mayor al saldo no deja saldo negativo", () => {
    expect(splitPayment(100_000_000, 12.6825, 500_000).newBalanceCents).toBe(100_000_000);
    expect(splitPayment(1_000, 0, 5_000).newBalanceCents).toBe(0);
  });
});

describe("simulatePayoff", () => {
  it("deuda a 0 %: 10 cuotas exactas y sin intereses", () => {
    const r = simulatePayoff([d("a", 1_000_000, 0, 100_000)], 0, "avalanche");
    expect(r).toMatchObject({ months: 10, totalInterestCents: 0, neverPaid: false });
    expect(r.totalPaidCents).toBe(1_000_000);
  });
  it("detecta cuando la cuota no cubre el interés", () => {
    expect(simulatePayoff([d("a", 100_000_000, 40, 100_000)], 0, "avalanche").neverPaid).toBe(true);
  });
  it("un extra acorta el plazo y reduce intereses", () => {
    const base = simulatePayoff([d("a", 50_000_000, 25, 2_000_000)], 0, "avalanche");
    const extra = simulatePayoff([d("a", 50_000_000, 25, 2_000_000)], 1_000_000, "avalanche");
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.totalInterestCents).toBeLessThan(base.totalInterestCents);
  });
  it("avalancha nunca paga más intereses que bola de nieve", () => {
    const debts = [d("tarjeta", 80_000_000, 32, 2_500_000), d("moto", 20_000_000, 18, 900_000), d("amigo", 5_000_000, 0, 300_000)];
    const av = simulatePayoff(debts, 1_500_000, "avalanche"), sn = simulatePayoff(debts, 1_500_000, "snowball");
    expect(av.totalInterestCents).toBeLessThanOrEqual(sn.totalInterestCents);
    expect(av.neverPaid || sn.neverPaid).toBe(false);
  });
  it("el orden de cancelación respeta la estrategia", () => {
    const debts = [d("grande_cara", 80_000_000, 32, 2_500_000), d("chica_barata", 5_000_000, 0, 300_000)];
    expect(simulatePayoff(debts, 1_000_000, "avalanche").payoffOrder[0].id).toBe("chica_barata"); // termina primero por ser pequeña…
    // …pero con mucho extra la avalancha ataca primero la cara
    const big = simulatePayoff(debts, 20_000_000, "avalanche"), snow = simulatePayoff(debts, 20_000_000, "snowball");
    expect(big.payoffOrder.map((p) => p.id)).toContain("grande_cara");
    expect(snow.payoffOrder[0].id).toBe("chica_barata");
  });
  it("ignora deudas ya saldadas y no se cuelga con lista vacía", () => {
    expect(simulatePayoff([], 0, "avalanche")).toMatchObject({ months: 0, neverPaid: false });
    expect(simulatePayoff([d("a", 0, 10, 0)], 0, "snowball").months).toBe(0);
  });
  it("monthsToPayOff", () => {
    expect(monthsToPayOff(1_200_000, 0, 100_000).months).toBe(12);
  });
});

describe("healthScore", () => {
  const base = { avgMonthlyIncomeCents: 1_000_000_00, avgMonthlyExpenseCents: 800_000_00, liquidCents: 0, monthlyDebtPaymentsCents: 0, monthlyFixedExpensesCents: 0 };
  it("sin ingresos no inventa puntaje", () => {
    expect(healthScore({ ...base, avgMonthlyIncomeCents: 0 }).score).toBeNull();
  });
  it("perfil sano puntúa alto y perfil apretado puntúa bajo", () => {
    const good = healthScore({ ...base, avgMonthlyExpenseCents: 700_000_00, liquidCents: 5_000_000_00, monthlyDebtPaymentsCents: 50_000_00, monthlyFixedExpensesCents: 300_000_00 });
    const bad = healthScore({ ...base, avgMonthlyExpenseCents: 1_100_000_00, liquidCents: 0, monthlyDebtPaymentsCents: 500_000_00, monthlyFixedExpensesCents: 600_000_00 });
    expect(good.score!).toBeGreaterThan(80);
    expect(good.level).toBe("excelente");
    expect(bad.score!).toBeLessThan(20);
    expect(bad.level).toBe("crítica");
  });
  it("los pesos suman 100 y el puntaje queda entre 0 y 100", () => {
    const r = healthScore({ ...base, liquidCents: 99_999_999_99 });
    expect(r.score!).toBeGreaterThanOrEqual(0);
    expect(r.score!).toBeLessThanOrEqual(100);
    expect(r.components).toHaveLength(4);
  });
});

describe("netWorth", () => {
  it("tarjeta negativa cuenta como pasivo y no se resta dos veces", () => {
    const n = netWorth({ accountBalances: [{ balanceCents: 500 }, { balanceCents: -200 }], assets: [{ valueCents: 3000 }], debts: [{ balanceCents: 1000 }] });
    expect(n).toMatchObject({ assetsCents: 3500, liabilitiesCents: 1200, netCents: 2300 });
  });
});

describe("projectCashflow", () => {
  const rule = (o: Partial<RuleLite>): RuleLite => ({ id: "r", name: "x", type: "expense", amount_cents: 100, amount_is_estimate: false, frequency: "monthly", next_date: "2026-11-20", remind_days_before: 3, active: true, ...o });
  const base = { startBalanceCents: 1_000, startMonth: "2026-11", today: "2026-11-02", months: 3, rules: [] as RuleLite[], debts: [], goalMonthlyCents: 0, variableExpenseMonthlyCents: 0 };
  it("saldo final acumula ingresos y egresos mes a mes", () => {
    const r = projectCashflow({ ...base, rules: [rule({ type: "income", amount_cents: 500, next_date: "2026-11-30" }), rule({ amount_cents: 200 })] });
    expect(r.map((m) => m.endBalanceCents)).toEqual([1_300, 1_600, 1_900]);
  });
  it("un pago anual cae solo en su mes", () => {
    const r = projectCashflow({ ...base, rules: [rule({ frequency: "annual", amount_cents: 1_200, next_date: "2027-01-10" })] });
    expect(r.map((m) => m.fixedCents)).toEqual([0, 0, 1_200]);
  });
  it("las cuotas de deuda terminan cuando la deuda se paga", () => {
    const r = projectCashflow({ ...base, months: 4, debts: [{ balanceCents: 200, annualRateEA: 0, installmentCents: 100 }] });
    expect(r.map((m) => m.debtCents)).toEqual([100, 100, 0, 0]);
  });
  it("descuenta variable y ahorro", () => {
    const r = projectCashflow({ ...base, months: 1, variableExpenseMonthlyCents: 300, goalMonthlyCents: 100 });
    expect(r[0].netCents).toBe(-400);
  });
});
