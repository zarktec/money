import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiError, extractTransactions, type AiClient } from "./extract";
import { toDrafts } from "./schema";

/** Servidor local que imita POST /v1/messages: valida el formato REAL que envía el SDK, sin red ni costo. */
let server: http.Server, baseURL = "";
let lastBody: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
let reply: { status?: number; body: object } = { body: {} };

const message = (over: object) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 321, output_tokens: 45 }, content: [], ...over,
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { lastBody = JSON.parse(raw || "{}"); res.writeHead(reply.status ?? 200, { "content-type": "application/json" }); res.end(JSON.stringify(reply.body)); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const client = () => new Anthropic({ apiKey: "test-key", baseURL, maxRetries: 0 }) as unknown as AiClient;
const json = { transactions: [{ type: "expense", amount: 85000, date: "2026-11-01", description: "Almuerzo con el equipo", merchant: null, category: "Restaurantes", confidence: 0.95 }, { type: "income", amount: 2000000, date: "2026-11-02", description: "Trabajo freelance", merchant: null, category: null, confidence: 0.8 }], notes: null };
const ctx = { today: "2026-11-02", categories: ["Restaurantes y domicilios"] };

describe("formato real de la petición (SDK → API)", () => {
  it("texto: esquema JSON estricto, efecto bajo, sin parámetros removidos y respuesta parseada", async () => {
    reply = { body: message({ content: [{ type: "text", text: JSON.stringify(json) }] }) };
    const r = await extractTransactions(client(), { mode: "text", text: "ayer almuerzo 85 mil y hoy me pagaron 2 palos", ...ctx });
    expect(lastBody.model).toBe("claude-opus-5-5");
    expect(lastBody.max_tokens).toBe(16000);
    expect(lastBody.output_config.effort).toBe("low");
    expect(lastBody.output_config.format.type).toBe("json_schema");
    const schema = lastBody.output_config.format.schema;
    expect(schema.type).toBe("object");
    expect(schema.properties.transactions.type).toBe("array");
    expect(schema.additionalProperties).toBe(false);
    for (const banned of ["tool_choice", "temperature", "top_p", "top_k", "budget_tokens"]) expect(lastBody).not.toHaveProperty(banned);
    expect(lastBody.thinking).toBeUndefined();
    expect(lastBody.system).toContain("2026-11-02");
    expect(lastBody.messages).toHaveLength(1);
    expect(lastBody.messages[0].role).toBe("user");           // sin prefill de asistente
    expect(lastBody.messages[0].content[0].text).toContain("<texto_del_usuario>");
    expect(r.inputTokens).toBe(321);
    const d = toDrafts(r.extraction, { today: ctx.today, categories: [{ id: "c1", name: "Restaurantes y domicilios" }] });
    expect(d.rows.map((x) => [x.type, x.amountCents, x.categoryId])).toEqual([["expense", 8_500_000, "c1"], ["income", 200_000_000, null]]);
  });

  it("recibo: imagen base64 antes de la instrucción", async () => {
    reply = { body: message({ content: [{ type: "text", text: JSON.stringify({ ...json, transactions: [json.transactions[0]] }) }] }) };
    await extractTransactions(client(), { mode: "receipt", mediaType: "image/jpeg", base64: "QUJD", ...ctx });
    const [img, txt] = lastBody.messages[0].content;
    expect(img).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(txt.text).toMatch(/UNA sola transacción/);
  });

  it("extracto PDF: documento base64", async () => {
    reply = { body: message({ content: [{ type: "text", text: JSON.stringify(json) }] }) };
    await extractTransactions(client(), { mode: "statement", pdfBase64: "UERG", ...ctx });
    expect(lastBody.messages[0].content[0]).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } });
  });

  it("refusal, max_tokens y JSON roto se traducen a errores claros (con el SDK real)", async () => {
    reply = { body: message({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null }, content: [] }) };
    await expect(extractTransactions(client(), { mode: "text", text: "x", ...ctx })).rejects.toMatchObject({ code: "refusal" });
    reply = { body: message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"transactions":[' }] }) };
    await expect(extractTransactions(client(), { mode: "statement", pdfBase64: "x", ...ctx })).rejects.toMatchObject({ code: "truncated" });
    reply = { body: message({ content: [{ type: "text", text: '{"transactions": "no es una lista"}' }] }) };
    await expect(extractTransactions(client(), { mode: "text", text: "x", ...ctx })).rejects.toBeTruthy();
  });

  it("errores HTTP llegan como clases tipadas del SDK (429 y 401)", async () => {
    reply = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } };
    await expect(extractTransactions(client(), { mode: "text", text: "x", ...ctx })).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    reply = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "bad key" } } };
    await expect(extractTransactions(client(), { mode: "text", text: "x", ...ctx })).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
    expect(AiError).toBeDefined();
  });
});
