import { parseAmountText, parseDateText } from "./parse";

export interface StatementRow { date: string; type: "income" | "expense"; amountCents: number; description: string }
export interface StatementResult {
  rows: StatementRow[];
  skipped: number;
  warnings: string[];
  /** true si los valores no traen signo ni columnas de débito/crédito: no se sabe si son ingresos o egresos. */
  ambiguousSign: boolean;
  mapping: { date: number; description: number; amount: number; debit: number; credit: number } | null;
}
export interface StatementOptions { defaultYear?: number; positiveIs?: "income" | "expense" }

const has = (cell: string, words: string[]) => { const c = cell.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return words.some((w) => c.includes(w)); };
const W = {
  date: ["fecha", "date"],
  desc: ["descripcion", "detalle", "concepto", "description", "movimiento", "transaccion", "referencia"],
  amount: ["valor", "monto", "importe", "amount"],
  debit: ["debito", "cargo", "retiro", "egreso", "salida", "debit"],
  credit: ["credito", "abono", "deposito", "ingreso", "entrada", "credit"],
  balance: ["saldo", "balance"],
};

function findHeader(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    const date = r.findIndex((c) => has(c, W.date));
    if (date < 0) continue;
    const pick = (words: string[]) => r.findIndex((c, idx) => idx !== date && has(c, words) && !has(c, W.balance));
    const amount = pick(W.amount), debit = pick(W.debit), credit = pick(W.credit);
    if (amount < 0 && debit < 0 && credit < 0) continue;
    let description = r.findIndex((c, idx) => idx !== date && has(c, W.desc));
    if (description < 0) description = r.findIndex((_, idx) => ![date, amount, debit, credit].includes(idx) && !has(r[idx], W.balance));
    return { headerAt: i, date, description, amount, debit, credit };
  }
  return null;
}

/** Sin encabezado reconocible: infiere columnas por contenido (una de fechas, una numérica, una de texto). */
function inferColumns(rows: string[][], defaultYear?: number) {
  const sample = rows.slice(0, 25), cols = Math.max(...sample.map((r) => r.length));
  const score = (f: (c: string) => boolean) => Array.from({ length: cols }, (_, j) => sample.filter((r) => r[j] !== undefined && f(r[j])).length);
  const dates = score((c) => parseDateText(c, defaultYear) !== null), nums = score((c) => parseAmountText(c) !== null && /\d/.test(c) && !parseDateText(c, defaultYear));
  const date = dates.indexOf(Math.max(...dates));
  if (dates[date] < Math.ceil(sample.length / 2)) return null;
  const numCols = nums.map((n, j) => ({ n, j })).filter((x) => x.j !== date && x.n >= Math.ceil(sample.length / 2)).map((x) => x.j);
  if (!numCols.length) return null;
  const description = Array.from({ length: cols }, (_, j) => j).filter((j) => j !== date && !numCols.includes(j)).sort((a, b) => (sample[0]?.[b]?.length ?? 0) - (sample[0]?.[a]?.length ?? 0))[0] ?? -1;
  // Con varias columnas numéricas la última suele ser el saldo: se usa la primera como valor.
  return { headerAt: -1, date, description, amount: numCols[0], debit: -1, credit: -1 };
}

export function mapStatement(rows: string[][], opts: StatementOptions = {}): StatementResult {
  const warnings: string[] = [];
  const m = findHeader(rows) ?? inferColumns(rows, opts.defaultYear);
  if (!m) return { rows: [], skipped: rows.length, warnings: ["No se reconocieron las columnas. El archivo necesita al menos fecha y valor."], ambiguousSign: false, mapping: null };

  const out: StatementRow[] = [];
  let skipped = 0, sawNegative = false, usedSingle = 0;
  const pending: { date: string; value: number; description: string }[] = [];
  for (const r of rows.slice(m.headerAt + 1)) {
    const date = parseDateText(r[m.date] ?? "", opts.defaultYear);
    if (!date) { skipped++; continue; }
    const description = (m.description >= 0 ? r[m.description] ?? "" : "").replace(/\s+/g, " ").trim();
    if (m.debit >= 0 || m.credit >= 0) {
      const debit = m.debit >= 0 ? Math.abs(parseAmountText(r[m.debit] ?? "") ?? 0) : 0;
      const credit = m.credit >= 0 ? Math.abs(parseAmountText(r[m.credit] ?? "") ?? 0) : 0;
      if (debit > 0 && credit === 0) out.push({ date, type: "expense", amountCents: Math.round(debit * 100), description });
      else if (credit > 0 && debit === 0) out.push({ date, type: "income", amountCents: Math.round(credit * 100), description });
      else skipped++;
    } else {
      const v = m.amount >= 0 ? parseAmountText(r[m.amount] ?? "") : null;
      if (v === null || v === 0) { skipped++; continue; }
      if (v < 0) sawNegative = true;
      pending.push({ date, value: v, description });
      usedSingle++;
    }
  }

  const ambiguousSign = usedSingle > 0 && !sawNegative && !opts.positiveIs;
  const positiveIs = opts.positiveIs ?? "expense";
  for (const p of pending) {
    const type = p.value < 0 ? "expense" : sawNegative ? "income" : positiveIs;
    out.push({ date: p.date, type, amountCents: Math.round(Math.abs(p.value) * 100), description: p.description });
  }
  if (ambiguousSign) warnings.push("Todos los valores vienen positivos y sin columnas de débito/crédito. Se asumieron egresos (como en un extracto de tarjeta); cámbialo abajo si son ingresos.");
  if (skipped > 0) warnings.push(`${skipped} fila(s) sin fecha o valor válido se omitieron (encabezados, totales o saldos).`);
  if (!opts.defaultYear && rows.some((r) => /^\d{1,2}[-/.]\d{1,2}$/.test((r[m.date] ?? "").trim()))) warnings.push("Hay fechas sin año; indica el año del extracto.");
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { rows: out, skipped, warnings, ambiguousSign, mapping: { date: m.date, description: m.description, amount: m.amount, debit: m.debit, credit: m.credit } };
}
