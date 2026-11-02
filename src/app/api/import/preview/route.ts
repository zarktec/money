import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/dates";
import { parseCsv } from "@/lib/imports/csv";
import { mapStatement } from "@/lib/imports/statement";
import { categorizeByMerchants, type MerchantRule } from "@/lib/imports/categorize";
import { hashAll } from "@/lib/imports/dedupe";
import type { DraftRow, ImportMode } from "@/lib/imports/types";
import { AiError, aiModel, extractTransactions, type AiClient, type ExtractInput } from "@/lib/ai/extract";
import { toDrafts } from "@/lib/ai/schema";
import { aiQuota, recordAiUsage } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel limita el cuerpo de una función a 4,5 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const fail = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Inicia sesión para continuar", 401);

  const fd = await req.formData().catch(() => null);
  if (!fd) return fail("Solicitud inválida", 400);
  const mode = String(fd.get("mode")) as ImportMode;
  const accountId = String(fd.get("account_id") ?? "");
  if (!["text", "receipt", "statement"].includes(mode)) return fail("Modo inválido", 400);

  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!account) return fail("Elige una cuenta válida", 400);

  const today = todayISO();
  const [{ data: cats }, { data: merchants }] = await Promise.all([
    supabase.from("expense_categories").select("id, name").eq("active", true),
    supabase.from("merchants").select("match_pattern, category_id, user_id"),
  ]);
  const categories = cats ?? [];
  const rules: MerchantRule[] = (merchants ?? []).map((m) => ({ pattern: m.match_pattern, categoryId: m.category_id, own: !!m.user_id }));

  let rows: Omit<DraftRow, "duplicate">[] = [];
  let warnings: string[] = [];
  let notes: string | null = null;
  let ambiguousSign = false;
  let source: "statement_csv" | "statement_pdf" | "receipt" | "text" = "text";
  let usage: { used: number; limit: number } | null = null;

  const file = fd.get("file");
  if (file instanceof File && file.size > MAX_BYTES) return fail("El archivo supera 4 MB. Comprímelo o divídelo en partes.", 413);

  // ---------- Extracto CSV: determinista, sin IA ni costo ----------
  const isCsv = mode === "statement" && file instanceof File && (/\.(csv|txt)$/i.test(file.name) || file.type.startsWith("text/"));
  if (isCsv) {
    source = "statement_csv";
    const year = Number(fd.get("default_year"));
    const positiveIs = fd.get("positive_is") === "income" ? "income" : fd.get("positive_is") === "expense" ? "expense" : undefined;
    const r = mapStatement(parseCsv(await (file as File).text()), { defaultYear: Number.isInteger(year) && year > 1990 && year < 2100 ? year : undefined, positiveIs });
    if (!r.rows.length) return fail(r.warnings[0] ?? "No se encontraron movimientos en el archivo.", 422, { warnings: r.warnings });
    if (r.rows.length > 1000) return fail("El archivo tiene más de 1.000 movimientos. Divídelo por periodos.", 422);
    warnings = r.warnings; ambiguousSign = r.ambiguousSign;
    rows = r.rows.map((x, i) => ({ key: `csv-${i}`, date: x.date, type: x.type, amountCents: x.amountCents, description: x.description, categoryId: x.type === "expense" ? categorizeByMerchants(x.description, rules) : null, confidence: null }));
  } else {
    // ---------- Con IA: texto, recibo (imagen) o extracto PDF ----------
    let input: ExtractInput;
    const catNames = categories.map((c) => c.name);
    if (mode === "text") {
      const text = String(fd.get("text") ?? "").trim();
      if (!text) return fail("Escribe o dicta qué gastaste o recibiste.", 400);
      if (text.length > 1500) return fail("El texto es muy largo (máximo 1.500 caracteres).", 400);
      source = "text";
      input = { mode: "text", text, today, categories: catNames };
    } else if (mode === "receipt") {
      if (!(file instanceof File) || !(IMAGE_TYPES as readonly string[]).includes(file.type)) return fail("Sube una foto JPG, PNG o WebP del recibo.", 400);
      source = "receipt";
      input = { mode: "receipt", mediaType: file.type as ImageType, base64: Buffer.from(await file.arrayBuffer()).toString("base64"), today, categories: catNames };
    } else {
      if (!(file instanceof File)) return fail("Sube un extracto en CSV o PDF.", 400);
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("El archivo debe ser un CSV o un PDF.", 400);
      source = "statement_pdf";
      input = { mode: "statement", pdfBase64: buf.toString("base64"), today, categories: catNames };
    }

    if (!process.env.ANTHROPIC_API_KEY) return fail("La lectura con IA aún no está configurada.", 503);
    const admin = createAdminClient();
    const quota = await aiQuota(admin, user.id);
    usage = { used: quota.used, limit: quota.limit };
    if (!quota.allowed) return fail(`Llegaste al límite de ${quota.limit} análisis con IA de este mes. Mejora tu plan para seguir.`, 429, { usage });

    try {
      const client = new Anthropic() as unknown as AiClient;
      const r = await extractTransactions(client, input);
      await recordAiUsage(admin, user.id, source, r.inputTokens, r.outputTokens, aiModel());
      usage = { used: quota.used + 1, limit: quota.limit };
      const d = toDrafts(r.extraction, { today, categories });
      warnings = d.warnings; notes = d.notes;
      rows = d.rows.map((x) => ({ ...x, categoryId: x.categoryId ?? (x.type === "expense" ? categorizeByMerchants(x.description, rules) : null) }));
      if (!rows.length) return fail(notes || "No se encontraron movimientos en el material.", 422, { usage });
    } catch (e) {
      if (e instanceof AiError) return fail(e.message, e.code === "refusal" ? 422 : 502, { usage });
      if (e instanceof Anthropic.RateLimitError) return fail("El servicio de IA está muy ocupado. Inténtalo en un minuto.", 503, { usage });
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error("Anthropic auth error", e.status); return fail("La lectura con IA no está disponible en este momento.", 503); }
      if (e instanceof Anthropic.APIError) { console.error("Anthropic API error", e.status, e.message); return fail("No se pudo analizar el contenido. Inténtalo de nuevo.", 502, { usage }); }
      throw e;
    }
  }

  // ---------- Duplicados: el mismo movimiento ya registrado en esta cuenta ----------
  const hashes = hashAll(rows.map((r) => ({ accountId, date: r.date, type: r.type, amountCents: r.amountCents, description: r.description })));
  const { data: existing } = await supabase.from("transactions").select("dedupe_hash").in("dedupe_hash", hashes);
  const have = new Set((existing ?? []).map((t) => t.dedupe_hash));
  const out: DraftRow[] = rows.map((r, i) => ({ ...r, duplicate: have.has(hashes[i]) }));
  if (out.some((r) => r.duplicate)) warnings.push(`${out.filter((r) => r.duplicate).length} movimiento(s) ya existen en esta cuenta y vienen sin marcar.`);

  return NextResponse.json({ rows: out, warnings, notes, ambiguousSign, source, usage });
}
