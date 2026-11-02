/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
const send = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => send(...a) } }));
let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const emailFor = vi.fn();
vi.mock("@/lib/mail/notify", () => ({ emailFor: (...a: unknown[]) => emailFor(...a) }));
const fetchMock = vi.fn();
const { GET } = await import("./route");

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const call = (auth = "Bearer cron") => GET(new Request("http://x/api/cron/billing-reminders", { headers: { authorization: auth } }));
const sub = (o: Record<string, any>) => ({ id: "s1", user_id: "u1", status: "active", cancel_at_period_end: false, current_period_end: inDays(2.5), plan: { name: "Pro" }, ...o });
const seed = (subs: any[]) => fakeDb({ subscriptions: subs, push_subscriptions: [{ id: "ps1", user_id: "u1", endpoint: "https://e/1", p256dh: "k", auth: "a" }], reminder_log: [] }, { reminder_log: [["user_id", "reminder_key"]] });

beforeEach(() => { process.env.CRON_SECRET = "cron"; process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv"; send.mockReset(); send.mockResolvedValue({}); delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; emailFor.mockReset(); emailFor.mockResolvedValue("ana@correo.co"); fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "em_1" }) }); vi.stubGlobal("fetch", fetchMock); db = seed([sub({})]); });

describe("cron de avisos de vencimiento del plan", () => {
  it("sin secreto del cron 401; sin VAPID se omite sin error", async () => {
    expect((await call("Bearer otro")).status).toBe(401);
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await (await call()).json()).toMatchObject({ skipped: expect.stringContaining("Sin canales") });
    expect(send).not.toHaveBeenCalled();
  });
  it("avisa del plan por vencer y NO repite el mismo tramo si el cron corre dos veces", async () => {
    expect(await (await call()).json()).toMatchObject({ sent: 1 });
    const payload = JSON.parse(send.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: "Tu plan vence pronto", url: "/precios" });
    expect(payload.body).toMatch(/Pro vence en 3 días/);
    expect(await (await call()).json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("a 1 día es un tramo distinto y vuelve a avisar", async () => {
    await call();
    db.tables.subscriptions[0].current_period_end = inDays(0.5);
    expect(await (await call()).json()).toMatchObject({ sent: 1 });
    expect(JSON.parse(send.mock.calls[1][1]).body).toMatch(/vence en 1 día\./);
  });
  it("la prueba tiene su propio texto; quien canceló no recibe aviso; lo que vence lejos o ya venció no se avisa", async () => {
    db = seed([sub({ status: "trialing" })]);
    await call();
    expect(JSON.parse(send.mock.calls[0][1]).title).toBe("Tu prueba gratis termina pronto");
    send.mockClear();
    db = seed([sub({ cancel_at_period_end: true })]);
    expect(await (await call()).json()).toMatchObject({ sent: 0, skipped: 1 });
    db = seed([sub({ current_period_end: inDays(10) }), sub({ id: "s2", current_period_end: inDays(-1) })]);
    expect(await (await call()).json()).toMatchObject({ sent: 0, skipped: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it("suscripción de push caducada (410) se elimina; un fallo temporal libera el aviso para reintentar", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await call();
    expect(db.tables.push_subscriptions).toHaveLength(0);
    db = seed([sub({})]); send.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));
    expect(await (await call()).json()).toMatchObject({ sent: 0 });
    expect(db.tables.reminder_log).toHaveLength(0);
    expect(db.tables.push_subscriptions).toHaveLength(1);
  });

  describe("por correo (Resend)", () => {
    beforeEach(() => { process.env.RESEND_API_KEY = "re_x"; process.env.MAIL_FROM = "Money <a@mail.test>"; });
    it("funciona aunque no haya VAPID, no repite el tramo y no escribe a quien apagó los avisos", async () => {
      delete process.env.VAPID_PRIVATE_KEY;
      expect(await (await call()).json()).toMatchObject({ mailed: 1, sent: 0 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ to: ["ana@correo.co"], subject: "Tu plan vence pronto" });
      expect(await (await call()).json()).toMatchObject({ mailed: 0, skipped: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      db = seed([sub({})]); emailFor.mockResolvedValue(null);
      expect(await (await call()).json()).toMatchObject({ mailed: 0 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("un fallo temporal de Resend libera la reserva y se reintenta; uno permanente no", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
      expect(await (await call()).json()).toMatchObject({ mailed: 0 });
      expect(await (await call()).json()).toMatchObject({ mailed: 1 });
      db = seed([sub({})]);
      fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: "bad" }) });
      await call();
      expect(await (await call()).json()).toMatchObject({ mailed: 0, skipped: expect.any(Number) });
    });
    it("push y correo son independientes: ambos salen una vez", async () => {
      expect(await (await call()).json()).toMatchObject({ sent: 1, mailed: 1 });
      expect(await (await call()).json()).toMatchObject({ sent: 0, mailed: 0, skipped: 2 });
    });
  });
});
