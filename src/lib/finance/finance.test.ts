import { describe, expect, it } from "vitest";
import { parseMoneyInput, toCents, formatMoney } from "./money";
import { monthlyEquivalent, monthlyProvision, nextOccurrence, occurrencesBetween } from "./recurrence";
import { goalProgress, monthsUntil } from "./savings";

describe("money", () => {
  it("convierte a centavos sin errores de flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it("parsea formatos colombianos", () => {
    expect(parseMoneyInput("1.250.000")).toBe(125_000_000);
    expect(parseMoneyInput("$ 45 mil")).toBe(4_500_000);
    expect(parseMoneyInput("1,250,000.50")).toBe(125_000_050);
    expect(parseMoneyInput("2 millones")).toBe(200_000_000);
    expect(parseMoneyInput("abc")).toBeNull();
  });
  it("formatea COP sin decimales", () => {
    expect(formatMoney(125_000_000)).toMatch(/1\.250\.000/);
  });
});

describe("recurrence", () => {
  it("calcula la siguiente fecha", () => {
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2026-01-15", "quarterly")).toBe("2026-04-15");
    expect(nextOccurrence("2026-01-15", "annual")).toBe("2027-01-15");
    expect(nextOccurrence("2026-01-01", "custom", 10)).toBe("2026-01-11");
  });
  it("provisión: seguro anual de 1.2M => 100k/mes", () => {
    expect(monthlyProvision(120_000_000, "annual")).toBe(10_000_000);
    expect(monthlyProvision(30_000_000, "quarterly")).toBe(10_000_000);
    expect(monthlyProvision(50_000_000, "monthly")).toBe(0);
  });
  it("equivalente mensual", () => {
    expect(monthlyEquivalent(120_000_000, "annual")).toBe(10_000_000);
    expect(monthlyEquivalent(1_200, "weekly")).toBe(5_200);
  });
  it("lista vencimientos en un rango", () => {
    expect(occurrencesBetween("2026-01-10", "quarterly", "2026-01-01", "2026-12-31"))
      .toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
  });
});

describe("savings", () => {
  const today = new Date("2026-11-02T12:00:00");
  it("cuenta el mes en curso", () => {
    expect(monthsUntil("2026-11-30", today)).toBe(1);
    expect(monthsUntil("2027-10-15", today)).toBe(12);
  });
  it("cuota mensual y recálculo al adelantar ahorro", () => {
    const a = goalProgress(1_200_000_00, 0, "2027-10-15", today);
    expect(a.monthlyContributionCents).toBe(10_000_000);
    const b = goalProgress(1_200_000_00, 600_000_00, "2027-10-15", today);
    expect(b.monthlyContributionCents).toBe(5_000_000);
    expect(b.percent).toBe(50);
  });
  it("meta vencida o completada", () => {
    expect(goalProgress(100, 0, "2026-01-01", today).overdue).toBe(true);
    expect(goalProgress(100, 100, "2026-01-01", today).monthlyContributionCents).toBe(0);
  });
});

import { availableToSpend, savingsRate } from "./summary";
describe("summary", () => {
  it("disponible = ingresos - gastos - compromisos", () => {
    expect(availableToSpend({ incomeCents: 500, expenseCents: 100, provisionsCents: 50, goalContributionsCents: 100, pendingFixedCents: 50 })).toBe(200);
    expect(availableToSpend({ incomeCents: 100, expenseCents: 300, provisionsCents: 0, goalContributionsCents: 0, pendingFixedCents: 0 })).toBe(-200);
  });
  it("tasa de ahorro", () => {
    expect(savingsRate(1000, 800)).toBe(20);
    expect(savingsRate(0, 10)).toBe(0);
  });
});
