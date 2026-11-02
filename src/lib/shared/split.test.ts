import { describe, expect, it } from "vitest";
import { computeBalances, simplifyDebts, splitByWeights, splitEqually, validateShares, type SharedExpenseLite, type Transfer } from "./split";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("splitEqually / splitByWeights", () => {
  it("reparte sin perder centavos y da los sobrantes a los primeros", () => {
    expect(splitEqually(10_000, ["a", "b", "c"])).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(splitEqually(30_000_000, ["a", "b", "c"])).toEqual({ a: 10_000_000, b: 10_000_000, c: 10_000_000 });
    expect(splitEqually(1, ["a", "b", "c"])).toEqual({ a: 1, b: 0, c: 0 });
    expect(() => splitEqually(100, [])).toThrow();
  });
  it("proporcional por mayor resto, siempre exacto", () => {
    expect(splitByWeights(10_000, { a: 50, b: 30, c: 20 })).toEqual({ a: 5000, b: 3000, c: 2000 });
    const r = splitByWeights(100, { a: 1, b: 1, c: 1 });
    expect(sum(r)).toBe(100);
    expect(splitByWeights(7, { a: 1, b: 0 })).toEqual({ a: 7, b: 0 });
    expect(() => splitByWeights(100, { a: 0 })).toThrow();
    expect(() => splitByWeights(100, { a: -1, b: 2 })).toThrow();
  });
  it("propiedad: para cualquier monto y pesos, la suma es exacta", () => {
    for (let n = 0; n < 300; n++) {
      const amount = Math.floor(Math.random() * 1e9) + 1, k = 1 + (n % 7);
      const ids = Array.from({ length: k }, (_, i) => `m${i}`);
      expect(sum(splitEqually(amount, ids))).toBe(amount);
      expect(sum(splitByWeights(amount, Object.fromEntries(ids.map((id) => [id, Math.random() * 10 + 0.1]))))).toBe(amount);
    }
  });
});

describe("validateShares", () => {
  it("detecta faltantes, excesos, negativos y decimales", () => {
    expect(validateShares(100, { a: 60, b: 40 })).toBeNull();
    expect(validateShares(100, { a: 60, b: 30 })).toMatch(/Faltan 10/);
    expect(validateShares(100, { a: 60, b: 50 })).toMatch(/pasaste por 10/);
    expect(validateShares(100, { a: 150, b: -50 })).toMatch(/positivos/);
    expect(validateShares(100, { a: 50.5, b: 49.5 })).toMatch(/positivos/);
    expect(validateShares(100, {})).toMatch(/al menos un/);
  });
});

describe("saldos y liquidación", () => {
  const ids = ["yo", "ana", "luis"];
  const exp = (paidBy: string, amountCents: number, shares: Record<string, number>): SharedExpenseLite => ({ paidBy, amountCents, shares });

  it("quien paga recupera lo de los demás: cena de 300 mil pagada por mí entre 3", () => {
    const b = computeBalances(ids, [exp("yo", 300, { yo: 100, ana: 100, luis: 100 })], []);
    expect(b).toEqual({ yo: 200, ana: -100, luis: -100 });
  });
  it("varios gastos con distintos pagadores se compensan", () => {
    const b = computeBalances(ids, [exp("yo", 300, splitEqually(300, ids)), exp("ana", 150, splitEqually(150, ids)), exp("luis", 60, { yo: 60 })], []);
    expect(b).toEqual({ yo: 200 - 50 - 60, ana: -100 + 150 - 50, luis: -100 - 50 + 60 });
    expect(sum(b)).toBe(0);
  });
  it("una liquidación reduce lo que se debe", () => {
    const b = computeBalances(ids, [exp("yo", 300, splitEqually(300, ids))], [{ from: "ana", to: "yo", amountCents: 100 }]);
    expect(b).toEqual({ yo: 100, ana: 0, luis: -100 });
  });
  it("simplifica: A debe a B y B debe a C → A le paga a C, un solo pago", () => {
    const b = computeBalances(["a", "b", "c"], [exp("b", 100, { a: 100 }), exp("c", 100, { b: 100 })], []);
    expect(simplifyDebts(b)).toEqual([{ from: "a", to: "c", amountCents: 100 }]);
  });
  it("propiedad: pagar lo simplificado deja a todos en cero, con a lo sumo n−1 pagos", () => {
    for (let t = 0; t < 200; t++) {
      const n = 2 + (t % 6), members = Array.from({ length: n }, (_, i) => `m${i}`);
      const expenses = Array.from({ length: 1 + (t % 9) }, () => {
        const amount = Math.floor(Math.random() * 5_000_000) + 1;
        const who = members.filter(() => Math.random() > 0.3);
        const part = who.length ? who : [members[0]];
        return exp(members[Math.floor(Math.random() * n)], amount, splitEqually(amount, part));
      });
      const bal = computeBalances(members, expenses, []);
      expect(sum(bal)).toBe(0);
      const plan = simplifyDebts(bal);
      expect(plan.length).toBeLessThanOrEqual(n - 1);
      expect(plan.every((p) => p.amountCents > 0 && p.from !== p.to)).toBe(true);
      const after = computeBalances(members, expenses, plan as Transfer[]);
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
    }
  });
  it("todo saldado → sin pagos", () => { expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]); });
});
