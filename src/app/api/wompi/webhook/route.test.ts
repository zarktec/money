import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
let events: string | undefined;
vi.mock("@/lib/integrations/store", () => ({ getIntegration: async () => ({ events_secret: events }) }));
const { POST } = await import("./route");

const evt = (secret: string, status = "APPROVED") => {
  const e = { event: "transaction.updated", environment: "test", timestamp: 1700000000, sent_at: "",
    data: { transaction: { id: "t1", status, amount_in_cents: 100, reference: "ref-1", currency: "COP" } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" } };
  e.signature.checksum = createHash("sha256").update(`t1${status}100${e.timestamp}${secret}`).digest("hex");
  return e;
};
const call = (body: unknown) => POST(new Request("http://x/api/wompi/webhook", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { events = "secreto-del-panel"; db = fakeDb({ payments: [{ id: "p1", reference: "ref-1", user_id: null, subscription_id: null, amount_cents: 100, currency: "COP", status: "PENDING" }] }); });

describe("webhook de Wompi con el secreto del panel", () => {
  it("acepta un evento firmado con el secreto guardado en el panel y actualiza el pago", async () => {
    expect((await call(evt("secreto-del-panel"))).status).toBe(200);
    expect(db.tables.payments[0].status).toBe("APPROVED");
  });
  it("rechaza (401) un evento firmado con otro secreto, o si no hay secreto configurado", async () => {
    expect((await call(evt("otro"))).status).toBe(401);
    events = undefined;
    expect((await call(evt("secreto-del-panel"))).status).toBe(401);
    expect(db.tables.payments[0].status).toBe("PENDING");
  });
});
