/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { addDaysISO, todayISO } from "@/lib/dates";

vi.mock("server-only", () => ({}));
const push = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => push(...a) } }));
let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const emailFor = vi.fn();
vi.mock("@/lib/mail/notify", () => ({ emailFor: (...a: unknown[]) => emailFor(...a) }));
const fetchMock = vi.fn();
const { GET } = await import("./route");

const rule = (o: Record<string, any> = {}) => ({ id: "r1", user_id: "u1", name: "Arriendo", type: "expense", amount_cents: 100_000_00, amount_is_estimate: false, frequency: "monthly", interval_days: null, next_date: addDaysISO(todayISO(), 3), end_date: null, remind_days_before: 3, active: true, ...o });
const seed = (rules: any[], subs: any[] = []) => fakeDb({ recurring_rules: rules, push_subscriptions: subs, reminder_log: [] }, { reminder_log: [["user_id", "reminder_key"]] });
const call = () => GET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer cron" } }));

beforeEach(() => {
  process.env.CRON_SECRET = "cron"; delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  process.env.RESEND_API_KEY = "re_x"; process.env.MAIL_FROM = "Money <a@mail.test>";
  push.mockReset(); emailFor.mockReset(); emailFor.mockResolvedValue("ana@correo.co");
  fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "em_1" }) }); vi.stubGlobal("fetch", fetchMock);
  db = seed([rule()]);
});

describe("cron de recordatorios por correo", () => {
  it("sin ningún canal configurado se omite", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await (await call()).json()).toMatchObject({ skipped: expect.stringContaining("Sin canales") });
  });
  it("envía un correo (aunque no haya push ni VAPID) y no lo repite si el cron corre otra vez", async () => {
    expect(await (await call()).json()).toMatchObject({ mailed: 1, sent: 0 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["ana@correo.co"]); expect(body.text).toMatch(/Arriendo vence en 3 días/);
    expect(await (await call()).json()).toMatchObject({ mailed: 0, skipped: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("agrupa los recordatorios del mismo usuario en un solo correo", async () => {
    db = seed([rule(), rule({ id: "r2", name: "Internet" })]);
    expect(await (await call()).json()).toMatchObject({ mailed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe("Tienes 2 recordatorios de pago"); expect(body.text).toMatch(/Arriendo[\s\S]*Internet/);
  });
  it("quien apagó los avisos no recibe nada", async () => {
    emailFor.mockResolvedValue(null);
    expect(await (await call()).json()).toMatchObject({ mailed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("si Resend falla de forma temporal se reintenta en la siguiente corrida", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await (await call()).json()).toMatchObject({ mailed: 0 });
    expect(await (await call()).json()).toMatchObject({ mailed: 1 });
  });
});
