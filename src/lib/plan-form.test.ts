import { describe, expect, it } from "vitest";
import { parsePlanForm } from "./plan-form";
import { UNLIMITED } from "./plans";

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const ok = { name: "Pro", description: "Automatiza", price: "19.900", trial_days: "14", sort_order: "2", limit_accounts: "10", limit_projects: "10", limit_goals: "20", limit_email_connections: "2", limit_ai_requests_month: "300", features: "Todo lo del plan Gratis\n- Lectura de correo\n\n  Foto de recibos  ", active: "on" };

describe("formulario de plan", () => {
  it("convierte pesos a centavos, arma los límites y la lista de beneficios", () => {
    const r = parsePlanForm(form(ok), {});
    expect(r).toMatchObject({ ok: true, value: { name: "Pro", price_cents: 1_990_000, trial_days: 14, active: true, sort_order: 2,
      limits: { accounts: 10, projects: 10, goals: 20, email_connections: 2, ai_requests_month: 300 }, features: ["Todo lo del plan Gratis", "Lectura de correo", "Foto de recibos"] } });
  });
  it("«Ilimitado» guarda el tope alto y desactivar el plan no lo marca activo", () => {
    const r = parsePlanForm(form({ ...ok, active: "", accounts__unlimited: "on", limit_accounts: "" }), {});
    expect(r.ok && r.value.limits.accounts).toBe(UNLIMITED);
    expect(r.ok && r.value.active).toBe(false);
  });
  it("conserva las claves de límites que el formulario no maneja", () => {
    const r = parsePlanForm(form(ok), { otra_clave: 7, accounts: 1 });
    expect(r.ok && r.value.limits).toMatchObject({ otra_clave: 7, accounts: 10 });
  });
  it("rechaza datos inválidos con un mensaje claro", () => {
    const bad = (o: Record<string, string>) => { const r = parsePlanForm(form({ ...ok, ...o }), {}); return r.ok ? "ok" : r.error; };
    expect(bad({ name: " " })).toMatch(/nombre/);
    expect(bad({ price: "-5" })).toMatch(/precio/);
    expect(bad({ price: "abc" })).toMatch(/precio/);
    expect(bad({ trial_days: "1.5" })).toMatch(/prueba/);
    expect(bad({ limit_goals: "-1" })).toMatch(/Metas de ahorro/);
    expect(bad({ limit_projects: "" })).toMatch(/Proyectos/);
    expect(bad({ features: Array.from({ length: 13 }, (_, i) => `b${i}`).join("\n") })).toMatch(/12 beneficios/);
  });
});
