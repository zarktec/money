import { describe, expect, it } from "vitest";
import { accountSchema, ruleSchema, txSchema } from "./schemas";

const base = { type: "expense", amount: "45 mil", occurred_on: "2026-11-02", account_id: "a1" };

describe("txSchema", () => {
  it("normaliza monto y vacíos", () => {
    const r = txSchema.parse({ ...base, category_id: "", description: " almuerzo " });
    expect(r.amount).toBe(4_500_000);
    expect(r.category_id).toBeNull();
    expect(r.description).toBe("almuerzo");
    expect(r.repeat).toBe("none");
  });
  it("rechaza monto 0 o texto", () => {
    expect(txSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(txSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
  });
  it("transferencia exige destino distinto", () => {
    expect(txSchema.safeParse({ ...base, type: "transfer" }).success).toBe(false);
    expect(txSchema.safeParse({ ...base, type: "transfer", to_account_id: "a1" }).success).toBe(false);
    expect(txSchema.safeParse({ ...base, type: "transfer", to_account_id: "a2" }).success).toBe(true);
  });
  it("rechaza fecha mal formada", () => {
    expect(txSchema.safeParse({ ...base, occurred_on: "02/11/2026" }).success).toBe(false);
  });
});

describe("ruleSchema / accountSchema", () => {
  it("regla mensual con checkboxes", () => {
    const r = ruleSchema.parse({ type: "expense", name: "Netflix", amount: "38.900", frequency: "monthly", next_date: "2026-12-01", account_id: "a1", auto_register: "on" });
    expect(r.amount).toBe(3_890_000);
    expect(r.auto_register).toBe(true);
    expect(r.amount_is_estimate).toBe(false);
    expect(r.remind_days_before).toBe(3);
  });
  it("saldo inicial negativo para tarjeta", () => {
    expect(accountSchema.parse({ name: "Visa", type: "credit_card", opening_balance: "-500.000" }).opening_balance).toBe(-50_000_000);
    expect(accountSchema.parse({ name: "Caja", type: "cash" }).opening_balance).toBe(0);
  });
});
