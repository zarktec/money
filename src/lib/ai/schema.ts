import { z } from "zod";
import { matchCategoryByName } from "@/lib/imports/categorize";
import type { DraftRow } from "@/lib/imports/types";

/** Lo que le pedimos a Claude. Los montos van en pesos (unidades mayores); la conversión a centavos la hacemos nosotros. */
export const ExtractionSchema = z.object({
  transactions: z.array(z.object({
    type: z.enum(["income", "expense"]),
    amount: z.number(),
    date: z.string(),
    description: z.string(),
    merchant: z.string().nullable(),
    category: z.string().nullable(),
    confidence: z.number(),
  })),
  notes: z.string().nullable(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const MAX_AMOUNT = 1e12; // $1 billón: por encima casi seguro es un error de lectura
const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Convierte la respuesta del modelo en filas seguras. No confiamos en ella: fechas imposibles o futuras pasan a hoy (con aviso),
 * montos no positivos o absurdos se descartan, y la categoría solo se acepta si existe en la lista del usuario.
 */
export function toDrafts(e: Extraction, ctx: { today: string; categories: { id: string; name: string }[] }) {
  const warnings: string[] = [];
  const rows: Omit<DraftRow, "duplicate">[] = [];
  let dropped = 0, dateFixed = 0;
  e.transactions.forEach((t, i) => {
    const amount = Math.abs(t.amount);
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || cents <= 0 || amount > MAX_AMOUNT) { dropped++; return; }
    let date = t.date;
    if (!isRealDate(date) || date > addDays(ctx.today, 1)) { date = ctx.today; dateFixed++; }
    const description = (t.description || t.merchant || "Movimiento").replace(/\s+/g, " ").trim().slice(0, 120);
    rows.push({
      key: `ai-${i}`, date, type: t.type, amountCents: cents, description,
      categoryId: t.type === "expense" ? matchCategoryByName(t.category, ctx.categories) : null,
      confidence: Number.isFinite(t.confidence) ? Math.max(0, Math.min(1, t.confidence)) : null,
    });
  });
  if (dropped) warnings.push(`${dropped} movimiento(s) con monto inválido se descartaron.`);
  if (dateFixed) warnings.push(`${dateFixed} fecha(s) no eran válidas o estaban en el futuro; se usó la de hoy. Revísalas.`);
  return { rows, warnings, notes: e.notes };
}
