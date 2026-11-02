/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { AiError } from "@/lib/ai/extract";
import type { Extraction } from "@/lib/ai/schema";
import { pickAccount, syncMailbox, syncSince, type SyncConnection, type SyncContext, type SyncDeps } from "./sync";
import { ProviderAuthError, ProviderError, type MailFull, type MailProvider } from "./providers/types";

const NOW = new Date("2026-11-02T15:00:00Z");
const conn: SyncConnection = { id: "c1", user_id: "u1", email: "a@gmail.com", default_account_id: "acc-default", last_sync_at: null };
const ctx: SyncContext = {
  today: "2026-11-02", knownDomains: ["bancolombia.com.co", "netflix.com"],
  banks: [{ id: "bank-bc", sender_domains: ["bancolombia.com.co"] }], accounts: [{ id: "acc-default", bank_id: null }, { id: "acc-bc", bank_id: "bank-bc" }],
  categories: [{ id: "cat-rest", name: "Restaurantes y domicilios" }, { id: "cat-sus", name: "Suscripciones" }], rules: [{ pattern: "netflix", categoryId: "cat-sus", own: false }],
};
const mail = (id: string, from: string, subject: string, receivedAt = "2026-11-01T12:00:00Z"): MailFull => ({ id, from, subject, snippet: "", receivedAt, listUnsubscribe: false, body: `cuerpo de ${id}` });
const extraction = (o: Partial<Extraction["transactions"][number]> = {}): Extraction => ({ notes: null, transactions: [{ type: "expense", amount: 38900, date: "2026-11-01", description: "Netflix", merchant: "Netflix", category: null, confidence: 0.95, ...o }] });

function setup(messages: MailFull[], opts: { extract?: SyncDeps["extract"]; remaining?: number; seed?: Record<string, any[]>; provider?: Partial<MailProvider> } = {}) {
  const db = fakeDb({ email_ingest_log: [], transactions: [], email_connections: [{ ...conn }], ...opts.seed }, { email_ingest_log: [["user_id", "message_id"]], transactions: [["user_id", "external_id"]] });
  const provider: MailProvider = { list: vi.fn(async () => messages.map((m) => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet, receivedAt: m.receivedAt, listUnsubscribe: m.listUnsubscribe }))), read: vi.fn(async (id: string) => messages.find((m) => m.id === id)!), close: vi.fn(async () => {}), ...opts.provider };
  const extract = opts.extract ?? vi.fn(async () => ({ extraction: extraction(), inputTokens: 100, outputTokens: 20 }));
  const record = vi.fn(async () => {});
  const deps: SyncDeps = { db: db as any, provider, extract, quota: { remaining: async () => opts.remaining ?? 100, record }, now: NOW };
  return { db, provider, extract, record, deps, run: (o = {}) => syncMailbox(deps, conn, ctx, { maxList: 50, maxAi: 25, ...o }) };
}

describe("helpers", () => {
  it("ventana de lectura: 14 días la primera vez, solapa 1 día después, nunca más de 30", () => {
    expect(syncSince(null, NOW).toISOString()).toBe("2026-10-19T15:00:00.000Z");
    expect(syncSince("2026-11-01T15:00:00Z", NOW).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(syncSince("2026-01-01T00:00:00Z", NOW).toISOString()).toBe("2026-10-03T15:00:00.000Z");
  });
  it("cuenta: la del banco remitente gana a la predeterminada", () => {
    expect(pickAccount("Banco <a@notificaciones.bancolombia.com.co>", ctx.banks, ctx.accounts, "acc-default")).toBe("acc-bc");
    expect(pickAccount("Netflix <i@netflix.com>", ctx.banks, ctx.accounts, "acc-default")).toBe("acc-default");
    expect(pickAccount("x@y.com", ctx.banks, [{ id: "z", bank_id: null }], null)).toBeNull();
  });
});

describe("syncMailbox", () => {
  it("ignora promociones y crea movimientos PENDIENTES de revisión con origen y nota", async () => {
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso"), mail("m2", "Promos <p@tienda.com>", "Black Friday: 50% de descuento")]);
    const s = await t.run();
    expect(s).toMatchObject({ listed: 2, ignored: 1, processed: 1, created: 1, errors: 0, incomplete: false });
    const tx = t.db.tables.transactions[0];
    expect(tx).toMatchObject({ user_id: "u1", type: "expense", amount_cents: 3_890_000, occurred_on: "2026-11-01", status: "pending_review", source: "email", external_id: "email:m1:0", account_id: "acc-default", category_id: "cat-sus" });
    expect(tx.notes).toContain("Netflix <i@netflix.com>");
    expect(t.db.tables.email_ingest_log.map((l: any) => [l.message_id, l.outcome])).toEqual([["m1", "extracted"], ["m2", "ignored"]]);
    expect(t.extract).toHaveBeenCalledTimes(1);                    // la promoción nunca llegó a la IA
    expect(t.record).toHaveBeenCalledWith(100, 20);
    expect(t.db.tables.email_connections[0]).toMatchObject({ last_sync_at: NOW.toISOString(), last_error: null });
    expect(t.provider.close).toHaveBeenCalled();
  });

  it("usa la cuenta del banco que envía el correo", async () => {
    const t = setup([mail("m1", "Bancolombia <a@notificaciones.bancolombia.com.co>", "Compra aprobada por $38.900")]);
    await t.run();
    expect(t.db.tables.transactions[0].account_id).toBe("acc-bc");
  });

  it("no reprocesa correos ya registrados en el log (idempotente entre corridas)", async () => {
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { seed: { email_ingest_log: [{ user_id: "u1", message_id: "m1", outcome: "extracted" }] } });
    const s = await t.run();
    expect(s).toMatchObject({ alreadyLogged: 1, processed: 0, created: 0 });
    expect(t.extract).not.toHaveBeenCalled();
    const again = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso")]);
    await again.run(); await again.run();
    expect(again.db.tables.transactions).toHaveLength(1);
  });

  it("no crea un movimiento que ya existe (p. ej. importado del extracto)", async () => {
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { seed: { transactions: [{ id: "old", user_id: "u1", type: "expense", amount_cents: 3_890_000, occurred_on: "2026-11-02", description: "COMPRA NETFLIX.COM 5566778", merchant: null }] } });
    const s = await t.run();
    expect(s).toMatchObject({ created: 0, duplicates: 1 });
    expect(t.db.tables.transactions).toHaveLength(1);
    expect(t.db.tables.email_ingest_log[0].outcome).toBe("duplicate");
  });

  it("descarta lo que la IA no ve claro (confianza baja) y las respuestas sin movimientos", async () => {
    const low = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { extract: async () => ({ extraction: extraction({ confidence: 0.3 }), inputTokens: 1, outputTokens: 1 }) });
    expect((await low.run()).created).toBe(0);
    const none = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { extract: async () => ({ extraction: { transactions: [], notes: "sin cobro" }, inputTokens: 1, outputTokens: 1 }) });
    const s = await none.run();
    expect(s.created).toBe(0);
    expect(none.db.tables.email_ingest_log[0].outcome).toBe("ignored");
  });

  it("al agotarse la cuota deja los correos SIN registrar y NO avanza la fecha (se retoman luego)", async () => {
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Tu pago fue exitoso"), mail("m2", "Netflix <i@netflix.com>", "Pago recibido")], { remaining: 1 });
    const s = await t.run();
    expect(s).toMatchObject({ processed: 1, created: 1, incomplete: true, quotaExhausted: true });
    expect(t.db.tables.email_ingest_log.map((l: any) => l.message_id)).toEqual(["m1"]);
    expect(t.db.tables.email_connections[0].last_sync_at).toBeNull();
    expect(t.db.tables.email_connections[0].last_error).toMatch(/límite mensual/);
  });

  it("respeta el máximo de llamadas de IA por corrida y el tiempo límite", async () => {
    const many = Array.from({ length: 5 }, (_, i) => mail(`m${i}`, "Netflix <i@netflix.com>", "Pago recibido"));
    const t = setup(many);
    expect((await t.run({ maxAi: 2 })).processed).toBe(2);
    const t2 = setup(many);
    const s = await t2.run({ deadline: Date.now() - 1 });
    expect(s).toMatchObject({ processed: 0, incomplete: true });
  });

  it("una cuenta de destino inexistente se anota como error y no inventa movimientos", async () => {
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Pago recibido")]);
    const s = await syncMailbox(t.deps, { ...conn, default_account_id: null }, { ...ctx, accounts: [] }, { maxList: 10, maxAi: 10 });
    expect(s.errors).toBe(1);
    expect(t.db.tables.transactions).toHaveLength(0);
  });

  it("si la IA rechaza un correo lo anota y sigue con los demás", async () => {
    let n = 0;
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Pago recibido"), mail("m2", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { extract: async () => { if (n++ === 0) throw new AiError("refusal", "x"); return { extraction: extraction(), inputTokens: 1, outputTokens: 1 }; } });
    const s = await t.run();
    expect(s).toMatchObject({ errors: 1, created: 1 });
    expect(t.db.tables.email_ingest_log.map((l: any) => l.outcome).sort()).toEqual(["error", "extracted"]);
  });

  it("credencial revocada: desactiva la conexión con un mensaje y no avanza", async () => {
    const t = setup([], { provider: { list: async () => { throw new ProviderAuthError("revocado"); } } });
    const s = await t.run();
    expect(s.authError).toBe(true);
    expect(t.db.tables.email_connections[0]).toMatchObject({ active: false, last_sync_at: null });
    expect(t.db.tables.email_connections[0].last_error).toMatch(/reconectarse/);
    expect(t.provider.close).toHaveBeenCalled();
  });

  it("un fallo transitorio guarda lo ya procesado, anota el error y se relanza para reintentar", async () => {
    let n = 0;
    const t = setup([mail("m1", "Netflix <i@netflix.com>", "Pago recibido"), mail("m2", "Netflix <i@netflix.com>", "Tu pago fue exitoso")], { extract: async () => { if (n++ === 1) throw new ProviderError("red caída"); return { extraction: extraction(), inputTokens: 1, outputTokens: 1 }; } });
    await expect(t.run()).rejects.toThrow(/red caída/);
    expect(t.db.tables.transactions).toHaveLength(1);
    expect(t.db.tables.email_ingest_log.map((l: any) => l.message_id)).toEqual(["m1"]);   // m2 queda sin registrar → se reintenta
    expect(t.db.tables.email_connections[0].last_error).toMatch(/reintentará/);
    expect(t.db.tables.email_connections[0].last_sync_at).toBeNull();
  });

  it("varios movimientos en un correo reciben external_id distinto", async () => {
    const t = setup([mail("m1", "Bancolombia <a@bancolombia.com.co>", "Transacciones del día")], { extract: async () => ({ extraction: { notes: null, transactions: [extraction().transactions[0], { ...extraction().transactions[0], amount: 5000, description: "Café" }] }, inputTokens: 1, outputTokens: 1 }) });
    expect((await t.run()).created).toBe(2);
    expect(t.db.tables.transactions.map((x: any) => x.external_id)).toEqual(["email:m1:0", "email:m1:1"]);
  });

  it("buzón vacío: no falla y avanza la fecha", async () => {
    const t = setup([]);
    expect(await t.run()).toMatchObject({ listed: 0, created: 0, incomplete: false });
    expect(t.db.tables.email_connections[0].last_sync_at).toBe(NOW.toISOString());
  });
});
