import type { Cents } from "@/lib/finance/money";

/** Reparte `amount` en partes iguales sin perder centavos: los sobrantes se dan de a 1 a los primeros participantes. */
export function splitEqually(amount: Cents, memberIds: string[]): Record<string, Cents> {
  if (!memberIds.length) throw new Error("Elige al menos un participante");
  const base = Math.floor(amount / memberIds.length);
  let extra = amount - base * memberIds.length;
  return Object.fromEntries(memberIds.map((id) => [id, base + (extra-- > 0 ? 1 : 0)]));
}

/** Reparto proporcional (porcentajes o cuotas) por el método del mayor resto: siempre suma exactamente `amount`. */
export function splitByWeights(amount: Cents, weights: Record<string, number>): Record<string, Cents> {
  const ids = Object.keys(weights);
  const total = ids.reduce((a, id) => a + weights[id], 0);
  if (!ids.length || ids.some((id) => !Number.isFinite(weights[id]) || weights[id] < 0) || total <= 0) throw new Error("Pesos inválidos");
  const raw = ids.map((id) => ({ id, exact: (amount * weights[id]) / total }));
  const out: Record<string, Cents> = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)]));
  let left = amount - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || ids.indexOf(a.id) - ids.indexOf(b.id))) {
    if (left-- <= 0) break;
    out[r.id]++;
  }
  return out;
}

/** null si las partes son válidas; si no, el motivo en español. */
export function validateShares(amount: Cents, shares: Record<string, Cents>): string | null {
  const v = Object.values(shares);
  if (!v.length) return "Elige al menos un participante";
  if (v.some((x) => !Number.isInteger(x) || x < 0)) return "Las partes deben ser valores positivos";
  const sum = v.reduce((a, b) => a + b, 0);
  return sum === amount ? null : sum < amount ? `Faltan ${amount - sum} por repartir` : `Te pasaste por ${sum - amount}`;
}

export interface SharedExpenseLite { paidBy: string; amountCents: Cents; shares: Record<string, Cents> }
export interface Transfer { from: string; to: string; amountCents: Cents }

/**
 * Saldo de cada participante: positivo = le deben, negativo = debe. Quien paga suma lo que desembolsó y cada uno resta su parte;
 * una liquidación ("from le pagó a to") acerca ambos a cero. La suma de saldos siempre es 0.
 */
export function computeBalances(memberIds: string[], expenses: SharedExpenseLite[], settlements: Transfer[]): Record<string, Cents> {
  const b: Record<string, Cents> = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    b[e.paidBy] = (b[e.paidBy] ?? 0) + e.amountCents;
    for (const [m, s] of Object.entries(e.shares)) b[m] = (b[m] ?? 0) - s;
  }
  for (const s of settlements) { b[s.from] = (b[s.from] ?? 0) + s.amountCents; b[s.to] = (b[s.to] ?? 0) - s.amountCents; }
  return b;
}

/** Pagos mínimos para dejar todo en cero: el que más debe le paga al que más le deben, y se repite. Como mucho n−1 pagos. */
export function simplifyDebts(balances: Record<string, Cents>): Transfer[] {
  const cred = Object.entries(balances).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const debt = Object.entries(balances).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < cred.length && j < debt.length) {
    const pay = Math.min(cred[i].v, debt[j].v);
    out.push({ from: debt[j].id, to: cred[i].id, amountCents: pay });
    cred[i].v -= pay; debt[j].v -= pay;
    if (cred[i].v === 0) i++;
    if (debt[j].v === 0) j++;
  }
  return out;
}
