import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { planLimitMessage } from "@/lib/plan-error";

vi.mock("server-only", () => ({}));
let user: { id: string } | null = { id: "u1" };
let userDb: ReturnType<typeof fakeDb>, adminDb: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ ...userDb, auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminDb }));
const { POST } = await import("./trial/route");
const req = (b: unknown) => new Request("http://x/api/subscription/trial", { method: "POST", body: JSON.stringify(b) });
const PRO = { id: "plan-pro", code: "pro", price_cents: 1_990_000, trial_days: 14, active: true };

beforeEach(() => { user = { id: "u1" }; userDb = fakeDb({ plans: [PRO], subscriptions: [] }); adminDb = fakeDb({ subscriptions: [] }, { subscriptions: [["user_id", "plan_id"]] }); });

describe("POST /api/subscription/trial", () => {
  it("sin sesión 401; sin plan 400; plan sin prueba, inactivo o gratis 400", async () => {
    user = null; expect((await POST(req({ planCode: "pro" }))).status).toBe(401);
    user = { id: "u1" }; expect((await POST(req({}))).status).toBe(400);
    for (const over of [{ trial_days: 0 }, { active: false }, { price_cents: 0 }]) { userDb = fakeDb({ plans: [{ ...PRO, ...over }], subscriptions: [] }); expect((await POST(req({ planCode: "pro" }))).status, JSON.stringify(over)).toBe(400); }
  });
  it("activa la prueba SIN tarjeta: estado trialing, 14 días de duración y la marca de prueba usada", async () => {
    const r = await POST(req({ planCode: "pro" }));
    expect(r.status).toBe(200);
    const s = adminDb.tables.subscriptions[0];
    expect(s).toMatchObject({ user_id: "u1", plan_id: "plan-pro", status: "trialing" });
    expect(s.trial_started_at).toBeTruthy();
    expect(Math.round((Date.parse(s.current_period_end) - Date.parse(s.current_period_start)) / 86_400_000)).toBe(14);
  });
  it("una sola prueba por usuario y plan: la segunda se rechaza con 409", async () => {
    expect((await POST(req({ planCode: "pro" }))).status).toBe(200);
    const again = await POST(req({ planCode: "pro" }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/Ya usaste/);
    expect(adminDb.tables.subscriptions).toHaveLength(1);
  });
  it("quien ya tiene un plan vigente no puede iniciar otra prueba", async () => {
    userDb = fakeDb({ plans: [PRO], subscriptions: [{ id: "s", status: "active", current_period_end: new Date(Date.now() + 864e5).toISOString() }] });
    expect((await POST(req({ planCode: "pro" }))).status).toBe(409);
    expect(adminDb.tables.subscriptions).toHaveLength(0);
  });
});

describe("planLimitMessage", () => {
  it("traduce el error de la base de datos y no toca otros errores", () => {
    expect(planLimitMessage('plan_limit:accounts')).toMatch(/límite de cuentas.*Mi plan/);
    expect(planLimitMessage("ERROR: plan_limit:goals")).toMatch(/metas de ahorro/);
    expect(planLimitMessage("plan_limit:otra")).toMatch(/límite de tu plan/);
    expect(planLimitMessage("duplicate key")).toBeNull();
    expect(planLimitMessage(undefined)).toBeNull();
  });
});
