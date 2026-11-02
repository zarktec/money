/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
const { getPlanLimits, numericLimit } = await import("./plan-limits");

const FREE = { code: "free", limits: { accounts: 2, email_connections: 0 } };
const PRO = { accounts: 10, email_connections: 2 };
const future = new Date(Date.now() + 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
const sub = (o: Record<string, any>) => ({ user_id: "u1", plan: { limits: PRO }, created_at: "2026-01-01", ...o });
const limits = (subs: any[]) => getPlanLimits(fakeDb({ subscriptions: subs, plans: [FREE] }) as any, "u1");

describe("getPlanLimits: quién tiene derechos de un plan", () => {
  it("sin suscripción aplica el plan gratis", async () => { expect(await limits([])).toEqual(FREE.limits); });
  it("activa o en prueba con fecha de fin FUTURA da los límites del plan", async () => {
    expect(await limits([sub({ status: "active", current_period_end: future })])).toEqual(PRO);
    expect(await limits([sub({ status: "trialing", current_period_end: future })])).toEqual(PRO);
  });
  it("SEGURIDAD: un checkout sin pagar no da derechos, ni el estado 'trialing' sin fecha de fin (el bug del checkout viejo)", async () => {
    expect(await limits([sub({ status: "pending", current_period_end: null })])).toEqual(FREE.limits);
    expect(await limits([sub({ status: "pending", current_period_end: future })])).toEqual(FREE.limits);
    expect(await limits([sub({ status: "trialing", current_period_end: null })])).toEqual(FREE.limits);
    expect(await limits([sub({ status: "active" })])).toEqual(FREE.limits);
  });
  it("en mora (cobro rechazado) conserva los derechos hasta que termine el periodo ya pagado", async () => {
    expect(await limits([sub({ status: "past_due", current_period_end: future })])).toEqual(PRO);
    expect(await limits([sub({ status: "past_due", current_period_end: past })])).toEqual(FREE.limits);
  });
  it("vencida, cancelada o expirada no dan derechos", async () => {
    expect(await limits([sub({ status: "active", current_period_end: past })])).toEqual(FREE.limits);
    for (const status of ["canceled", "expired"]) expect(await limits([sub({ status, current_period_end: future })]), status).toEqual(FREE.limits);
  });
  it("numericLimit: valores inválidos o ausentes usan el valor por defecto", () => {
    expect(numericLimit({ a: 5 }, "a", 0)).toBe(5);
    expect(numericLimit({ a: -1 }, "a", 7)).toBe(7);
    expect(numericLimit({ a: "x" }, "a", 7)).toBe(7);
    expect(numericLimit({}, "a", 3)).toBe(3);
  });
});
