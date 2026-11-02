"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hashAll } from "@/lib/imports/dedupe";

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(1e14),
  description: z.string().trim().max(120),
  categoryId: z.string().nullable(),
  include: z.boolean(),
});
const payloadSchema = z.object({
  accountId: z.string().min(1),
  source: z.enum(["statement_csv", "statement_pdf", "receipt", "text"]),
  fileName: z.string().max(200).nullable().optional(),
  rows: z.array(rowSchema).min(1).max(1000),
});

const TX_SOURCE = { statement_csv: "statement_import", statement_pdf: "statement_import", receipt: "receipt_ocr", text: "natural_language" } as const;
export type CommitResult = { ok: true; inserted: number; batchId: string } | { ok: false; error: string };

/** Guarda las filas que el usuario revisó y marcó. Todo se revalida aquí: el cliente no es de confianza. */
export async function commitImport(raw: unknown): Promise<CommitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const p = parsed.data;
  const rows = p.rows.filter((r) => r.include);
  if (!rows.length) return { ok: false, error: "Marca al menos un movimiento" };

  const { data: acc } = await supabase.from("accounts").select("id").eq("id", p.accountId).maybeSingle();
  if (!acc) return { ok: false, error: "Cuenta inválida" };
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
  if (catIds.length) {
    const { data: vis } = await supabase.from("expense_categories").select("id").in("id", catIds);
    if ((vis?.length ?? 0) !== catIds.length) return { ok: false, error: "Categoría inválida" };
  }

  const hashes = hashAll(rows.map((r) => ({ accountId: p.accountId, date: r.date, type: r.type, amountCents: r.amountCents, description: r.description })));
  const { data: batch, error: be } = await supabase.from("import_batches").insert({ user_id: user.id, account_id: p.accountId, source: p.source, file_name: p.fileName ?? null, row_count: rows.length }).select("id").single();
  if (be || !batch) return { ok: false, error: "No se pudo iniciar la importación" };

  const records = rows.map((r, i) => ({
    user_id: user.id, type: r.type, amount_cents: r.amountCents, occurred_on: r.date, description: r.description || null,
    account_id: p.accountId, category_id: r.type === "expense" ? r.categoryId : null, source: TX_SOURCE[p.source], status: "confirmed" as const,
    import_batch_id: batch.id, dedupe_hash: hashes[i],
  }));
  for (let i = 0; i < records.length; i += 200) {
    const { error } = await supabase.from("transactions").insert(records.slice(i, i + 200));
    if (error) { // todo o nada: se deshace lo ya insertado de este lote
      await supabase.from("transactions").delete().eq("import_batch_id", batch.id);
      await supabase.from("import_batches").delete().eq("id", batch.id);
      return { ok: false, error: "No se pudo guardar. No se importó nada." };
    }
  }
  ["/inicio", "/movimientos", "/cuentas", "/presupuestos", "/proyeccion", "/salud"].forEach((x) => revalidatePath(x));
  return { ok: true, inserted: records.length, batchId: batch.id };
}

export async function undoImport(batchId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("transactions").delete().eq("import_batch_id", batchId);
  await supabase.from("import_batches").delete().eq("id", batchId);
  ["/inicio", "/movimientos", "/cuentas", "/presupuestos", "/proyeccion", "/salud"].forEach((x) => revalidatePath(x));
  return { ok: true };
}
