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
  adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { ai_requests_month: 5 } }], ai_usage: [], assistant_conversations: [], assistant_messages: [] });
  run.mockReset(); run.mockResolvedValue({ reply: "Gastaste $295.000.", toolCalls: 1, inputTokens: 120, outputTokens: 30, hitLimit: false });
});

const UUID = "11111111-1111-4111-8111-111111111111";
const seed = (extra: Record<string, unknown[]> = {}) => fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { ai_requests_month: 5 } }], ai_usage: [], assistant_conversations: [], assistant_messages: [], ...extra });
const m = (text: string, o = {}) => req({ message: text, ...o });

describe("POST /api/assistant", () => {
  it("sin sesión → 401; sin clave de IA → 503", async () => {
    user = null;
    expect((await POST(m("hola"))).status).toBe(401);
    user = { id: "u1" }; delete process.env.ANTHROPIC_API_KEY; clearIntegrationCache();
    expect((await POST(m("hola"))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it("valida el cuerpo: vacío, JSON roto, muy largo, sin pregunta o id de conversación inválido", async () => {
    for (const bad of [{ message: "" }, "no-json", { message: "x".repeat(2001) }, { message: "   " }, {}, { messages: [q("hola")] }, { message: "hola", conversationId: "no-uuid" }]) {
      expect((await POST(req(bad))).status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("límite mensual agotado → 429 y no llama a la IA", async () => {
    adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { ai_requests_month: 2 } }], ai_usage: [{ user_id: "u1", created_at: new Date().toISOString() }, { user_id: "u1", created_at: new Date().toISOString() }] });
    const r = await POST(m("hola"));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/límite de 2/);
    expect(run).not.toHaveBeenCalled();
  });
  it("conversación nueva: responde, la crea con el título de la pregunta y guarda ambos mensajes", async () => {
    const r = await POST(m("¿cuánto gasté?"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ reply: "Gastaste $295.000.", usage: { used: 1, limit: 5 } });
    expect(body.conversationId).toBeTruthy();
    expect(adminDb.tables.assistant_conversations).toEqual([expect.objectContaining({ user_id: "u1", title: "¿cuánto gasté?" })]);
    expect(adminDb.tables.assistant_messages.map((x: any) => [x.role, x.content, x.user_id])).toEqual([["user", "¿cuánto gasté?", "u1"], ["assistant", "Gastaste $295.000.", "u1"]]);
    expect(run.mock.calls[0][2]).toEqual([]);                                    // sin historial previo
    expect(adminDb.tables.ai_usage).toEqual([expect.objectContaining({ user_id: "u1", kind: "assistant", input_tokens: 120, output_tokens: 30 })]);
  });
  it("un título largo se recorta", async () => {
    await POST(m("a".repeat(100)));
    expect(adminDb.tables.assistant_conversations[0].title).toHaveLength(58);
  });
  it("conversación existente: el historial sale de la base (últimos 6 turnos, en orden) y se agregan los mensajes nuevos", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, seq: i, conversation_id: UUID, user_id: "u1", role: i % 2 ? "assistant" : "user", content: `t${i}` }));
    adminDb = seed({ assistant_conversations: [{ id: UUID, user_id: "u1", title: "vieja" }], assistant_messages: rows });
    const r = await POST(m("¿y el mes pasado?", { conversationId: UUID }));
    expect(r.status).toBe(200);
    expect((await r.json()).conversationId).toBe(UUID);
    const [, , history, question] = run.mock.calls[0];
    expect(question).toBe("¿y el mes pasado?");
    expect(history.map((h: any) => h.content)).toEqual(["t4", "t5", "t6", "t7", "t8", "t9"]);
    expect(adminDb.tables.assistant_messages).toHaveLength(12);
    expect(adminDb.tables.assistant_conversations).toHaveLength(1);              // no crea otra
  });
  it("no se puede usar la conversación de otra persona ni una inexistente (404, sin llamar a la IA)", async () => {
    adminDb = seed({ assistant_conversations: [{ id: UUID, user_id: "otro", title: "ajena" }] });
    expect((await POST(m("hola", { conversationId: UUID }))).status).toBe(404);
    expect((await POST(m("hola", { conversationId: "22222222-2222-4222-8222-222222222222" }))).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
    expect(adminDb.tables.assistant_messages).toHaveLength(0);
  });
  it("una conversación demasiado larga pide empezar otra", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, seq: i, conversation_id: UUID, user_id: "u1", role: "user", content: "x" }));
    adminDb = seed({ assistant_conversations: [{ id: UUID, user_id: "u1", title: "larga" }], assistant_messages: rows });
    const r = await POST(m("otra", { conversationId: UUID }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/muy larga/);
    expect(run).not.toHaveBeenCalled();
  });
  it("si no se puede guardar el historial, el usuario igual recibe su respuesta", async () => {
    const real = adminDb.from;
    adminDb.from = ((t: string) => (t === "assistant_messages" ? { insert: async () => ({ error: { message: "boom" } }), select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } : real(t))) as never;
    const r = await POST(m("hola"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.reply).toBe("Gastaste $295.000.");
    expect(body.conversationId).toBeNull();
  });
  it("errores del proveedor → mensajes genéricos sin filtrar detalles y sin guardar nada", async () => {
    run.mockRejectedValueOnce(err(Anthropic.RateLimitError));
    expect((await POST(m("a"))).status).toBe(503);
    run.mockRejectedValueOnce(err(Anthropic.AuthenticationError));
    const a = await POST(m("a"));
    expect(a.status).toBe(503);
    expect(JSON.stringify(await a.json())).not.toMatch(/secreto/);
    run.mockRejectedValueOnce(err(Anthropic.InternalServerError));
    const b = await POST(m("a"));
    expect(b.status).toBe(502);
    expect(JSON.stringify(await b.json())).not.toMatch(/secreto/);
    expect(adminDb.tables.ai_usage).toHaveLength(0);                       // un fallo no consume cupo
    expect(adminDb.tables.assistant_messages).toHaveLength(0);
    expect(adminDb.tables.assistant_conversations).toHaveLength(0);
  });
});
