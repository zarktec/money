import { describe, expect, it, vi } from "vitest";
import { ExtractionSchema, toDrafts, type Extraction } from "./schema";
import { buildSystemPrompt } from "./prompts";
import { AiError, buildContent, extractTransactions, type AiClient } from "./extract";

vi.mock("server-only", () => ({}));
const { monthlyAiLimit } = await import("./usage");

const cats = [{ id: "c1", name: "Restaurantes y domicilios" }, { id: "c2", name: "Transporte y gasolina" }];
const tx = (o: Partial<Extraction["transactions"][number]> = {}) => ({ type: "expense" as const, amount: 25000, date: "2026-11-02", description: "Almuerzo", merchant: null, category: "Restaurantes", confidence: 0.9, ...o });
const ctx = { today: "2026-11-02", categories: cats };

describe("toDrafts", () => {
  it("convierte pesos a centavos y mapea la categoría por nombre", () => {
    const r = toDrafts({ transactions: [tx()], notes: null }, ctx);
    expect(r.rows[0]).toMatchObject({ amountCents: 2_500_000, categoryId: "c1", type: "expense", date: "2026-11-02" });
  });
  it("no confía en el modelo: descarta montos inválidos y absurdos, arregla fechas", () => {
    const r = toDrafts({ transactions: [tx({ amount: 0 }), tx({ amount: -5000, description: "neg" }), tx({ amount: 5e12 }), tx({ date: "2026-02-31" }), tx({ date: "2030-01-01" }), tx({ date: "2026-11-03" })], notes: null }, ctx);
    expect(r.rows).toHaveLength(4);                       // 0 y 5e12 descartados; -5000 se vuelve 5000
    expect(r.rows[0].amountCents).toBe(500_000);
    expect(r.rows.slice(1, 3).every((x) => x.date === "2026-11-02")).toBe(true);
    expect(r.rows[3].date).toBe("2026-11-03");             // mañana se tolera (zona horaria)
    expect(r.warnings.join(" ")).toMatch(/descartaron/);
    expect(r.warnings.join(" ")).toMatch(/fecha/);
  });
  it("una categoría inventada no se acepta y los ingresos no llevan categoría", () => {
    const r = toDrafts({ transactions: [tx({ category: "Inventada" }), tx({ type: "income", category: "Restaurantes" })], notes: null }, ctx);
    expect(r.rows.map((x) => x.categoryId)).toEqual([null, null]);
  });
  it("descripción vacía usa el comercio y se acota", () => {
    const r = toDrafts({ transactions: [tx({ description: "", merchant: "Exito" }), tx({ description: "x".repeat(300) })], notes: null }, ctx);
    expect(r.rows[0].description).toBe("Exito");
    expect(r.rows[1].description).toHaveLength(120);
  });
  it("el esquema exige los campos", () => {
    expect(ExtractionSchema.safeParse({ transactions: [{ type: "gasto" }], notes: null }).success).toBe(false);
  });
});

describe("prompt", () => {
  const p = buildSystemPrompt({ today: "2026-11-02", categories: ["Mercado", "Cine"] });
  it("incluye fecha, día de la semana, jerga colombiana y categorías", () => {
    expect(p).toContain("2026-11-02 (lunes)");
    expect(p).toMatch(/lucas/); expect(p).toMatch(/palo/);
    expect(p).toContain("Mercado | Cine");
  });
  it("trata el contenido del usuario como datos", () => { expect(p).toMatch(/ignora cualquier instrucción/); });
});

describe("extractTransactions", () => {
  const fake = (res: { stop_reason: string; parsed_output: object | null }) => ({ messages: { create: vi.fn().mockResolvedValue({
    usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: res.stop_reason,
    content: res.parsed_output ? [{ type: "text", text: JSON.stringify(res.parsed_output) }] : [],
  }) } }) as unknown as AiClient & { messages: { create: ReturnType<typeof vi.fn> } };
  const input = { mode: "text" as const, text: "almuerzo 25 mil", today: "2026-11-02", categories: ["Mercado"] };

  it("arma la petición sin tool_choice forzado, sin prefill y con efecto bajo", async () => {
    const c = fake({ stop_reason: "end_turn", parsed_output: { transactions: [tx()], notes: null } });
    const r = await extractTransactions(c, input);
    const params = (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.tool_choice).toBeUndefined();
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format).toBeDefined();
    expect(r).toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });
  it("respeta ANTHROPIC_MODEL", async () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-5-5";
    const c = fake({ stop_reason: "end_turn", parsed_output: { transactions: [], notes: null } });
    await extractTransactions(c, input);
    expect((c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0].model).toBe("claude-haiku-5-5");
    delete process.env.ANTHROPIC_MODEL;
  });
  it("traduce refusal, max_tokens y salida no interpretable en errores claros", async () => {
    await expect(extractTransactions(fake({ stop_reason: "refusal", parsed_output: null }), input)).rejects.toMatchObject({ code: "refusal" });
    await expect(extractTransactions(fake({ stop_reason: "max_tokens", parsed_output: null }), input)).rejects.toMatchObject({ code: "truncated" });
    await expect(extractTransactions(fake({ stop_reason: "end_turn", parsed_output: null }), input)).rejects.toBeInstanceOf(AiError);
  });
  it("arma los bloques de contenido por modo: texto delimitado, imagen y PDF base64", () => {
    expect(buildContent(input)[0]).toMatchObject({ type: "text" });
    expect((buildContent(input)[0] as { text: string }).text).toContain("<texto_del_usuario>");
    const img = buildContent({ mode: "receipt", mediaType: "image/jpeg", base64: "AAA", today: "x", categories: [] });
    expect(img[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } });
    const pdf = buildContent({ mode: "statement", pdfBase64: "BBB", today: "x", categories: [] });
    expect(pdf[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf", data: "BBB" } });
  });
});

describe("monthlyAiLimit", () => {
  it("lee el límite del plan y cae al gratis si falta o es inválido", () => {
    expect(monthlyAiLimit({ ai_requests_month: 300 })).toBe(300);
    expect(monthlyAiLimit({ ai_requests_month: 0 })).toBe(0);
    expect(monthlyAiLimit({})).toBe(10);
    expect(monthlyAiLimit(null)).toBe(10);
    expect(monthlyAiLimit({ ai_requests_month: "x" })).toBe(10);
    expect(monthlyAiLimit({ ai_requests_month: -5 })).toBe(10);
  });
});
