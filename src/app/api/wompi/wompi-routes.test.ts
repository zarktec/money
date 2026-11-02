/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
let user: { id: string; email?: string } | null = { id: "u1", email: "a@x.co" };
let userDb: ReturnType<typeof fakeDb>, adminDb: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ ...userDb, auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminDb }));
const { POST: webhook } = await import("./webhook/route");
const { POST: checkout } = await import("./checkout/route");

const EVENTS_SECRET = "evt-secret";
const event = (tx: Record<string, any>, over: Record<string, any> = {}) => {
  const e = { event: "transaction.updated", environment: "test", timestamp: 1_700_000_000, sent_at: "", data: { transaction: tx }, signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" }, ...over };
  e.signature.checksum = createHash("sha256").update(`${tx.id}${tx.status}${tx.amount_in_cents}${e.timestamp}${EVENTS_SECRET}`).digest("hex");
  return e;
};
const hook = (e: object) => webhook(new Request("http://x/api/wompi/webhook", { method: "POST", body: JSON.stringify(e) }));
const tx = (o: Record<string, any> = {}) => ({ id: "T1", reference: "ref-1", status: "APPROVED", amount_in_cents: 1_990_000, currency: "COP", payment_method_type: "CARD", payment_source_id: 777, customer_email: "a@x.co", ...o });
const sub = (id: string) => adminDb.tables.subscriptions.find((x: any) => x.id === id)!;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

beforeEach(() => {
  process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET; process.env.WOMPI_INTEGRITY_SECRET = "integ"; process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY = "pub_test"; process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  user = { id: "u1", email: "a@x.co" };
  adminDb = fakeDb({
    plans: [{ id: "plan-pro", code: "pro", interval: "month" }],
    payments: [{ id: "p1", user_id: "u1", subscription_id: "s1", reference: "ref-1", amount_cents: 1_990_000, currency: "COP", status: "PENDING" }],
    subscriptions: [{ id: "s1", user_id: "u1", plan_id: "plan-pro", status: "pending", current_period_end: null }, { id: "old", user_id: "u1", plan_id: "plan-free", status: "active" }],
    audit_log: [],
  });
});

describe("webhook de Wompi", () => {
  it("firma inválida → 401 y no toca nada", async () => {
    const e = event(tx()); e.signature.checksum = "0".repeat(64);
    expect((await hook(e)).status).toBe(401);
    expect((await webhook(new Request("http://x", { method: "POST", body: "no-json" }))).status).toBe(401);
    expect(adminDb.tables.subscriptions[0].status).toBe("pending");
  });
  it("un evento alterado después de firmado se rechaza", async () => {
    const e: any = event(tx());
    e.data.transaction.status = "DECLINED";
    expect((await hook(e)).status).toBe(401);
  });
  it("eventos que no son de transacción y referencias desconocidas se ignoran sin error", async () => {
    expect(await (await hook(event(tx(), { event: "nequi_token.updated" }))).json()).toMatchObject({ ignored: true });
    expect(await (await hook(event(tx({ reference: "otra" })))).json()).toMatchObject({ unknown_reference: true });
  });
  it("monto distinto al esperado → 422, queda en el log de auditoría y NO activa", async () => {
    const r = await hook(event(tx({ amount_in_cents: 100 })));
    expect(r.status).toBe(422);
    expect(adminDb.tables.audit_log[0]).toMatchObject({ action: "wompi.amount_mismatch" });
    expect(sub("s1").status).toBe("pending");
    expect(adminDb.tables.payments[0].status).toBe("PENDING");
  });
  it("pago aprobado: activa 1 mes desde ahora, guarda la fuente de pago y cancela la suscripción vigente anterior", async () => {
    expect(await (await hook(event(tx()))).json()).toEqual({ ok: true });
    const s = sub("s1");
    expect(s).toMatchObject({ status: "active", wompi_payment_source_id: "777", renewal_attempts: 0 });
    const days = (Date.parse(s.current_period_end) - Date.parse(s.current_period_start)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(28); expect(days).toBeLessThanOrEqual(31);
    expect(sub("old").status).toBe("canceled");
    expect(adminDb.tables.payments[0]).toMatchObject({ status: "APPROVED", wompi_transaction_id: "T1" });
  });
  it("es idempotente: el mismo evento dos veces no extiende dos periodos", async () => {
    await hook(event(tx()));
    const end1 = sub("s1").current_period_end;
    expect(await (await hook(event(tx()))).json()).toMatchObject({ duplicate: true });
    expect(sub("s1").current_period_end).toBe(end1);
  });
  it("renovación a tiempo: el nuevo periodo empieza donde terminó el anterior", async () => {
    const end = day(1);
    adminDb = fakeDb({ plans: [{ id: "plan-pro", interval: "month" }], payments: [{ id: "p2", user_id: "u1", subscription_id: "s1", reference: "ref-1", amount_cents: 1_990_000, currency: "COP", status: "PENDING" }], subscriptions: [{ id: "s1", user_id: "u1", plan_id: "plan-pro", status: "active", current_period_end: end }], audit_log: [] });
    await hook(event(tx()));
    const s = adminDb.tables.subscriptions[0];
    expect(s.current_period_start).toBe(new Date(end).toISOString());
    expect(Date.parse(s.current_period_end)).toBeGreaterThan(Date.parse(end) + 27 * 86_400_000);
  });
  it("cobro rechazado: una suscripción activa pasa a mora; un checkout inicial sigue pendiente", async () => {
    adminDb.tables.subscriptions[0].status = "active";
    await hook(event(tx({ status: "DECLINED" })));
    expect(adminDb.tables.subscriptions[0].status).toBe("past_due");
    expect(adminDb.tables.payments[0].status).toBe("DECLINED");
    adminDb = fakeDb({ plans: [], payments: [{ id: "p1", user_id: "u1", subscription_id: "s1", reference: "ref-1", amount_cents: 1_990_000, currency: "COP", status: "PENDING" }], subscriptions: [{ id: "s1", user_id: "u1", status: "pending" }], audit_log: [] });
    await hook(event(tx({ status: "DECLINED" })));
    expect(adminDb.tables.subscriptions[0].status).toBe("pending");
  });
});

describe("POST /api/wompi/checkout", () => {
  const req = (body: unknown) => new Request("http://x/api/wompi/checkout", { method: "POST", body: JSON.stringify(body) });
  const plans = (over: Record<string, any> = {}) => [{ id: "plan-pro", code: "pro", price_cents: 1_990_000, currency: "COP", active: true, ...over }];
  beforeEach(() => { userDb = fakeDb({ plans: plans() }); adminDb = fakeDb({ subscriptions: [], payments: [] }); });

  it("sin sesión → 401; sin plan, plan inexistente, inactivo o gratis → 400", async () => {
    user = null;
    expect((await checkout(req({ planCode: "pro" }))).status).toBe(401);
    user = { id: "u1" };
    expect((await checkout(req({}))).status).toBe(400);
    expect((await checkout(req({ planCode: "nada" }))).status).toBe(400);
    userDb = fakeDb({ plans: plans({ active: false }) });
    expect((await checkout(req({ planCode: "pro" }))).status).toBe(400);
    userDb = fakeDb({ plans: plans({ price_cents: 0 }) });
    expect((await checkout(req({ planCode: "pro" }))).status).toBe(400);
  });
  it("el precio sale SIEMPRE del servidor, aunque el cliente mande otro", async () => {
    const r = await checkout(req({ planCode: "pro", price_cents: 1, amount: 1, amount_in_cents: 1 }));
    const { url, reference } = await r.json();
    const u = new URL(url);
    expect(u.searchParams.get("amount-in-cents")).toBe("1990000");
    expect(adminDb.tables.payments[0]).toMatchObject({ reference, amount_cents: 1_990_000, status: "PENDING", user_id: "u1" });
    const sig = createHash("sha256").update(`${reference}1990000COPinteg`).digest("hex");
    expect(u.searchParams.get("signature:integrity")).toBe(sig);
    expect(u.searchParams.get("public-key")).toBe("pub_test");
    expect(u.searchParams.get("redirect-url")).toBe(`https://app.test/cuenta/suscripcion?ref=${reference}`);
  });
  it("renovación: con el plan vigente, el pago se asocia a ESA suscripción (no se crea otra ni se pierden días)", async () => {
    adminDb = fakeDb({ subscriptions: [{ id: "vig", user_id: "u1", plan_id: "plan-pro", status: "active", current_period_end: new Date(Date.now() + 864e5).toISOString() }], payments: [] });
    await checkout(req({ planCode: "pro" }));
    expect(adminDb.tables.subscriptions).toHaveLength(1);
    expect(adminDb.tables.payments[0].subscription_id).toBe("vig");
  });
  it("cambio de plan: con otro plan vigente se crea una suscripción nueva pendiente (la anterior no se toca hasta que se pague)", async () => {
    adminDb = fakeDb({ subscriptions: [{ id: "otro", user_id: "u1", plan_id: "plan-basic", status: "active", current_period_end: new Date(Date.now() + 864e5).toISOString() }], payments: [] });
    await checkout(req({ planCode: "pro" }));
    expect(adminDb.tables.subscriptions).toHaveLength(2);
    expect(adminDb.tables.subscriptions.find((x: any) => x.id === "otro")!.status).toBe("active");
    expect(adminDb.tables.subscriptions.find((x: any) => x.id !== "otro")!.status).toBe("pending");
  });
  it("BUG corregido: el checkout sin pagar deja la suscripción en 'pending' (nunca 'trialing'), y se reutiliza", async () => {
    await checkout(req({ planCode: "pro" }));
    await checkout(req({ planCode: "pro" }));
    expect(adminDb.tables.subscriptions).toHaveLength(1);
    expect(adminDb.tables.subscriptions[0].status).toBe("pending");
    expect(adminDb.tables.subscriptions[0].current_period_end).toBeUndefined();
    expect(adminDb.tables.payments).toHaveLength(2);                         // cada intento es un pago distinto
    expect(new Set(adminDb.tables.payments.map((p: any) => p.reference)).size).toBe(2);
  });
});
