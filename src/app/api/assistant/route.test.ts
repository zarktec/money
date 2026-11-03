/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
let user: { id: string } | null = { id: "u1" };
let adminDb: ReturnType<typeof fakeDb>;
const run = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminDb }));
vi.mock("@/lib/assistant/run", () => ({ runAssistant: (...a: unknown[]) => run(...a) }));
const { POST } = await import("./route");
const { clearIntegrationCache } = await import("@/lib/integrations/store");   // la clave de IA se lee con una caché corta: se limpia al cambiar el entorno

const req = (body: unknown) => new Request("http://x/api/assistant", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const q = (text: string) => ({ role: "user", content: text });
const err = (Cls: any) => Object.assign(Object.create(Cls.prototype), { status: 429, message: "detalle-interno-secreto" });

beforeEach(() => {
  user = { id: "u1" }; process.env.ANTHROPIC_API_KEY = "k"; clearIntegrationCache();
  adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { ai_requests_month: 5 } }], ai_usage: [] });
  run.mockReset(); run.mockResolvedValue({ reply: "Gastaste $295.000.", toolCalls: 1, inputTokens: 120, outputTokens: 30, hitLimit: false });
});

describe("POST /api/assistant", () => {
  it("sin sesión → 401; sin clave de IA → 503", async () => {
    user = null;
    expect((await POST(req({ messages: [q("hola")] }))).status).toBe(401);
    user = { id: "u1" }; delete process.env.ANTHROPIC_API_KEY; clearIntegrationCache();
    expect((await POST(req({ messages: [q("hola")] }))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it("valida el cuerpo: vacío, JSON roto, muy largo, mensajes vacíos o sin pregunta final del usuario", async () => {
    for (const bad of [{ messages: [] }, "no-json", { messages: [q("x".repeat(2001))] }, { messages: [q("   ")] }, { messages: [{ role: "assistant", content: "hola" }] }, { messages: [{ role: "system", content: "x" }] }, { messages: Array.from({ length: 31 }, () => q("x")) }]) {
      expect((await POST(req(bad))).status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("límite mensual agotado → 429 y no llama a la IA", async () => {
    adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { ai_requests_month: 2 } }], ai_usage: [{ user_id: "u1", created_at: new Date().toISOString() }, { user_id: "u1", created_at: new Date().toISOString() }] });
    const r = await POST(req({ messages: [q("hola")] }));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/límite de 2/);
    expect(run).not.toHaveBeenCalled();
  });
  it("éxito: responde, registra el consumo y envía solo los últimos 6 turnos de historial", async () => {
    const hist = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `t${i}` }));
    const r = await POST(req({ messages: [...hist, q("¿cuánto gasté?")] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ reply: "Gastaste $295.000.", usage: { used: 1, limit: 5 } });
    const [, , history, question] = run.mock.calls[0];
    expect(question).toBe("¿cuánto gasté?");
    expect(history.map((h: any) => h.content)).toEqual(["t4", "t5", "t6", "t7", "t8", "t9"]);
    expect(adminDb.tables.ai_usage).toEqual([expect.objectContaining({ user_id: "u1", kind: "assistant", input_tokens: 120, output_tokens: 30 })]);
  });
  it("errores del proveedor → mensajes genéricos sin filtrar detalles", async () => {
    run.mockRejectedValueOnce(err(Anthropic.RateLimitError));
    expect((await POST(req({ messages: [q("a")] }))).status).toBe(503);
    run.mockRejectedValueOnce(err(Anthropic.AuthenticationError));
    const a = await POST(req({ messages: [q("a")] }));
    expect(a.status).toBe(503);
    expect(JSON.stringify(await a.json())).not.toMatch(/secreto/);
    run.mockRejectedValueOnce(err(Anthropic.InternalServerError));
    const b = await POST(req({ messages: [q("a")] }));
    expect(b.status).toBe(502);
    expect(JSON.stringify(await b.json())).not.toMatch(/secreto/);
    expect(adminDb.tables.ai_usage).toHaveLength(0);                       // un fallo no consume cupo
  });
});
