import { describe, expect, it } from "vitest";
import { describeLimits, priceLabel, yearlySavingsPercent } from "./plans";

describe("plans", () => {
  it("describe límites en español, singular/plural y omite correo en 0", () => {
    expect(describeLimits({ accounts: 1, projects: 10, goals: 2, email_connections: 0, ai_requests_month: 10 })).toEqual([
      "1 cuenta", "10 proyectos", "2 metas de ahorro activas", "10 consultas con IA al mes (recibos, extractos, correo y asistente)"]);
    expect(describeLimits({ email_connections: 2 })).toEqual(["Lectura de correo: 2 cuentas (Gmail, Outlook o IMAP)"]);
    expect(describeLimits({ accounts: "x", otra: 5, goals: -1 })).toEqual([]);
    expect(describeLimits(null)).toEqual([]);
  });
  it("precio y ahorro anual", () => {
    expect(priceLabel(0, "month")).toBe("Gratis");
    expect(priceLabel(1_990_000, "month")).toMatch(/19\.900.*mes/);
    expect(priceLabel(19_900_000, "year")).toMatch(/199\.000.*año/);
    expect(yearlySavingsPercent(1_990_000, 19_900_000)).toBe(17);
    expect(yearlySavingsPercent(1_990_000, 30_000_000)).toBe(0);
    expect(yearlySavingsPercent(0, 100)).toBe(0);
  });
});
