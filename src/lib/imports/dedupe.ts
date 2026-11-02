import { createHash } from "node:crypto";
import { normalizeText } from "./parse";

export interface HashInput { accountId: string; date: string; type: string; amountCents: number; description: string }

/** Huella de un movimiento. `occurrence` distingue dos movimientos idénticos el mismo día (dos cafés de $5.000). */
export function dedupeHash(i: HashInput, occurrence = 0): string {
  return createHash("sha256").update(`${i.accountId}|${i.date}|${i.type}|${i.amountCents}|${normalizeText(i.description)}|${occurrence}`).digest("hex");
}

/** Hashes de cada fila, numerando las repeticiones exactas dentro del mismo lote. */
export function hashAll(rows: HashInput[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.accountId}|${r.date}|${r.type}|${r.amountCents}|${normalizeText(r.description)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return dedupeHash(r, n);
  });
}
