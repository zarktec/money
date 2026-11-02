import { normalizeText } from "@/lib/imports/parse";

export interface TxLite { id?: string; type: string; amountCents: number; date: string; description?: string | null; merchant?: string | null }

const tokens = (s: string | null | undefined) => new Set(normalizeText(s ?? "").split(" ").filter((t) => t.length >= 4));
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000;

/**
 * ¿Este movimiento detectado ya existe? Un mismo gasto puede llegar por correo, extracto y banco con descripciones distintas
 * ("COMPRA RAPPI*123" vs "Rappi - tu pedido"), así que se compara: mismo tipo y monto, fecha ±1 día y, además, una palabra
 * significativa en común (o alguna de las dos descripciones vacía). Dos compras del mismo valor en tiendas distintas NO se funden.
 */
export function findDuplicate(c: TxLite, existing: TxLite[]): TxLite | null {
  const ct = new Set([...tokens(c.description), ...tokens(c.merchant)]);
  for (const e of existing) {
    if (e.type !== c.type || e.amountCents !== c.amountCents || dayDiff(e.date, c.date) > 1) continue;
    const et = new Set([...tokens(e.description), ...tokens(e.merchant)]);
    if (!ct.size || !et.size || [...ct].some((t) => et.has(t))) return e;
  }
  return null;
}
