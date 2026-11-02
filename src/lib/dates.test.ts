import { describe, expect, it } from "vitest";
import { addDaysISO, monthBounds, shiftMonth, todayISO } from "./dates";

describe("dates", () => {
  it("hoy en Bogotá no salta de día a las 8 p. m. (01:00 UTC del día siguiente)", () => {
    expect(todayISO("America/Bogota", new Date("2026-11-03T01:00:00Z"))).toBe("2026-11-02");
    expect(todayISO("America/Bogota", new Date("2026-11-03T05:30:00Z"))).toBe("2026-11-03");
  });
  it("límites de mes, incluido bisiesto", () => {
    expect(monthBounds("2026-11-15")).toEqual({ from: "2026-11-01", to: "2026-11-30", month: "2026-11" });
    expect(monthBounds("2028-02-10").to).toBe("2028-02-29");
  });
  it("suma de días y cambio de mes", () => {
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
