/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAll } from "@/lib/imports/dedupe";

vi.mock("server-only", () => ({}));

// ---- Supabase simulado: cada tabla responde con los datos que se le asignen ----
let user: { id: string } | null = { id: "u1" };
let userData: Record<string, unknown> = {};
let adminData: Record<string, unknown> = {};
let adminCount = 0;
const adminInserts: { table: string; row: any }[] = [];

function fakeDb(data: () => Record<string, unknown>, count: () => number, inserts?: typeof adminInserts) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b, in: () => b, gte: () => b, gt: () => b, or: () => b, order: () => b, limit: () => b, is: () => b,
        maybeSingle: async () => { const d = data()[table]; return { data: Array.isArray(d) ? d[0] ?? null : d ?? null, error: null }; },
        insert: async (row: unknown) => { inserts?.push({ table, row }); return { error: null }; },
        then: (res: any, rej: any) => Promise.resolve({ data: data()[table] ?? null, count: count(), error: null }).then(res, rej),
      };
      return b;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb(() => userData, () => 0) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb(() => adminData, () => adminCount, adminInserts) }));

// ---- API de Anthropic simulada (el SDK real le habla a este servidor) ----
let server: http.Server;
let apiReply: { status?: number; body: object } = { body: {} };
let apiCalls = 0;
const msg = (over: object) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 }, content: [], ...over });
const aiJson = { transactions: [{ type: "expense", amount: 85000, date: "2026-11-01", description: "Almuerzo", merchant: null, category: "Mercado", confidence: 0.9 }], notes: null };

beforeAll(async () => {
  server = http.createServer((req, res) => { apiCalls++; req.resume(); req.on("end", () => { res.writeHead(apiReply.status ?? 200, { "content-type": "application/json" }); res.end(JSON.stringify(apiReply.body)); }); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const { POST } = await import("./route");

const cats = [{ id: "cat-mercado", name: "Mercado" }, { id: "cat-rest", name: "Restaurantes y domicilios" }];
const merchants = [{ match_pattern: "rappi", category_id: "cat-rest", user_id: null }];
const form = (fields: Record<string, string | File>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v); return new Request("http://x/api/import/preview", { method: "POST", body: fd }); };
const csv = (text: string, name = "extracto.csv") => new File([text], name, { type: "text/csv" });

beforeEach(() => {
  user = { id: "u1" };
  userData = { accounts: [{ id: "acc1" }], expense_categories: cats, merchants, transactions: [] };
  adminData = { subscriptions: null, plans: [{ limits: { ai_requests_month: 3 } }] };
  adminCount = 0; adminInserts.length = 0; apiCalls = 0;
  process.env.ANTHROPIC_API_KEY = "test-key";
  apiReply = { body: msg({ content: [{ type: "text", text: JSON.stringify(aiJson) }] }) };
});

describe("POST /api/import/preview", () => {
  it("sin sesión responde 401", async () => {
    user = null;
    expect((await POST(form({ mode: "text", account_id: "acc1", text: "hola" }))).status).toBe(401);
  });

  it("modo o cuenta inválidos responden 400", async () => {
    expect((await POST(form({ mode: "otro", account_id: "acc1" }))).status).toBe(400);
    userData = { ...userData, accounts: [] };
    expect((await POST(form({ mode: "text", account_id: "ajena", text: "x" }))).status).toBe(400);
  });

  it("CSV: lee, categoriza por comercio, es gratis (sin IA ni cuota) y marca duplicados", async () => {
    const rows = [
      { accountId: "acc1", date: "2026-11-01", type: "expense", amountCents: 3_500_000, description: "COMPRA RAPPI 12345678" },
      { accountId: "acc1", date: "2026-11-02", type: "income", amountCents: 350_000_000, description: "ABONO NÓMINA" },
    ];
    userData = { ...userData, transactions: [{ dedupe_hash: hashAll(rows)[1] }] }; // la nómina ya existe
    const res = await POST(form({ mode: "statement", account_id: "acc1", file: csv("Fecha;Descripción;Valor\n01/11/2026;COMPRA RAPPI 12345678;-35.000\n02/11/2026;ABONO NÓMINA;3.500.000") }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe("statement_csv");
    expect(body.rows[0]).toMatchObject({ type: "expense", amountCents: 3_500_000, categoryId: "cat-rest", duplicate: false });
    expect(body.rows[1]).toMatchObject({ type: "income", duplicate: true });
    expect(body.warnings.join(" ")).toMatch(/ya existen/);
    expect(apiCalls).toBe(0);
    expect(adminInserts).toHaveLength(0); // no consume cuota
  });

  it("CSV irreconocible o vacío responde 422 con motivo", async () => {
    const res = await POST(form({ mode: "statement", account_id: "acc1", file: csv("hola,mundo\nno,sirve") }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/columnas/);
  });

  it("archivos grandes o de tipo incorrecto se rechazan", async () => {
    expect((await POST(form({ mode: "statement", account_id: "acc1", file: new File([new Uint8Array(4 * 1024 * 1024 + 1)], "x.csv", { type: "text/csv" }) }))).status).toBe(413);
    expect((await POST(form({ mode: "receipt", account_id: "acc1", file: new File(["x"], "r.gif", { type: "image/gif" }) }))).status).toBe(400);
    expect((await POST(form({ mode: "statement", account_id: "acc1", file: new File(["no soy pdf"], "x.pdf", { type: "application/pdf" }) }))).status).toBe(400);
    expect((await POST(form({ mode: "text", account_id: "acc1", text: "x".repeat(1501) }))).status).toBe(400);
    expect((await POST(form({ mode: "text", account_id: "acc1", text: "   " }))).status).toBe(400);
  });

  it("texto con IA: extrae, categoriza, registra el consumo y devuelve el uso", async () => {
    adminCount = 1;
    const res = await POST(form({ mode: "text", account_id: "acc1", text: "almuerzo 85 mil" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows[0]).toMatchObject({ type: "expense", amountCents: 8_500_000, categoryId: "cat-mercado" });
    expect(body.usage).toEqual({ used: 2, limit: 3 });
    expect(adminInserts).toEqual([{ table: "ai_usage", row: expect.objectContaining({ user_id: "u1", kind: "text", input_tokens: 10, output_tokens: 5 }) }]);
  });

  it("sin clave de IA responde 503; al llegar al límite del plan responde 429 y NO llama a la API", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await POST(form({ mode: "text", account_id: "acc1", text: "x" }))).status).toBe(503);
    process.env.ANTHROPIC_API_KEY = "test-key";
    adminCount = 3;
    const res = await POST(form({ mode: "text", account_id: "acc1", text: "x" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/límite de 3/);
    expect(apiCalls).toBe(0);
  });

  it("la suscripción activa sube el límite del usuario", async () => {
    adminData = { ...adminData, subscriptions: [{ plan: { limits: { ai_requests_month: 300 } } }] };
    adminCount = 50;
    expect((await POST(form({ mode: "text", account_id: "acc1", text: "x" }))).status).toBe(200);
  });

  it("recibo: una foto produce una fila", async () => {
    const res = await POST(form({ mode: "receipt", account_id: "acc1", file: new File([new Uint8Array([1, 2, 3])], "r.jpg", { type: "image/jpeg" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe("receipt");
  });

  it("PDF truncado → 502 con mensaje útil; refusal → 422; 429 del proveedor → 503; clave inválida → 503 sin filtrar detalles", async () => {
    const pdf = () => form({ mode: "statement", account_id: "acc1", file: new File(["%PDF-1.4 x"], "e.pdf", { type: "application/pdf" }) });
    apiReply = { body: msg({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"transactions":[' }] }) };
    const t = await POST(pdf());
    expect(t.status).toBe(502);
    expect((await t.json()).error).toMatch(/Divídelo/);
    apiReply = { body: msg({ stop_reason: "refusal", content: [] }) };
    expect((await POST(pdf())).status).toBe(422);
    apiReply = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "x" } } };
    expect((await POST(pdf())).status).toBe(503);
    apiReply = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key sk-secret" } } };
    const a = await POST(pdf());
    expect(a.status).toBe(503);
    expect(JSON.stringify(await a.json())).not.toMatch(/sk-secret|x-api-key/);
  });

  it("sin movimientos en el material → 422 con la nota del modelo", async () => {
    apiReply = { body: msg({ content: [{ type: "text", text: JSON.stringify({ transactions: [], notes: "El texto no menciona dinero." }) }] }) };
    const res = await POST(form({ mode: "text", account_id: "acc1", text: "hola" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("El texto no menciona dinero.");
  });
});
