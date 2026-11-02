import { describe, expect, it } from "vitest";
import { MAX_RENEWAL_ATTEMPTS, nextPeriod, shouldAttemptRenewal, type RenewalCandidate } from "./billing";

const NOW = new Date("2026-11-10T12:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("nextPeriod", () => {
  it("primer pago: empieza ahora", () => {
    expect(iso(nextPeriod("month", null, NOW).end)).toBe("2026-12-10T12:00:00.000Z");
    expect(iso(nextPeriod("year", null, NOW).end)).toBe("2027-11-10T12:00:00.000Z");
  });
  it("renovación a tiempo: empieza donde terminó el anterior, sin perder días", () => {
    const p = nextPeriod("month", "2026-11-12T12:00:00Z", NOW);
    expect(iso(p.start)).toBe("2026-11-12T12:00:00.000Z");
    expect(iso(p.end)).toBe("2026-12-12T12:00:00.000Z");
  });
  it("pago tardío (ya venció): empieza ahora, no en el pasado", () => {
    expect(iso(nextPeriod("month", "2026-10-01T00:00:00Z", NOW).start)).toBe(iso(NOW));
  });
  it("fin de mes y vitalicio", () => {
    expect(iso(nextPeriod("month", null, new Date("2026-01-31T00:00:00Z")).end)).toBe("2026-02-28T00:00:00.000Z");
    expect(nextPeriod("lifetime", null, NOW).end.getUTCFullYear()).toBe(2126);
  });
});

describe("shouldAttemptRenewal", () => {
  const s = (o: Partial<RenewalCandidate> = {}): RenewalCandidate => ({ status: "active", cancel_at_period_end: false, wompi_payment_source_id: "ps_1", current_period_end: "2026-11-11T12:00:00Z", renewal_attempts: 0, last_renewal_attempt_at: null, ...o });
  it("cobra desde 2 días antes del vencimiento si hay tarjeta guardada", () => {
    expect(shouldAttemptRenewal(s(), NOW)).toBe(true);
    expect(shouldAttemptRenewal(s({ current_period_end: "2026-11-13T12:00:01Z" }), NOW)).toBe(false);   // aún falta más de 2 días
    expect(shouldAttemptRenewal(s({ current_period_end: "2026-11-12T12:00:00Z" }), NOW)).toBe(true);
  });
  it("nunca cobra: sin tarjeta, cancelada al final del periodo, o en otro estado", () => {
    expect(shouldAttemptRenewal(s({ wompi_payment_source_id: null }), NOW)).toBe(false);
    expect(shouldAttemptRenewal(s({ cancel_at_period_end: true }), NOW)).toBe(false);
    for (const status of ["pending", "trialing", "canceled", "expired"]) expect(shouldAttemptRenewal(s({ status }), NOW), status).toBe(false);
    expect(shouldAttemptRenewal(s({ current_period_end: null }), NOW)).toBe(false);
  });
  it("reintenta a las 24 h y a las 72 h, y luego se rinde", () => {
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
    expect(shouldAttemptRenewal(s({ status: "past_due", renewal_attempts: 1, last_renewal_attempt_at: at(23) }), NOW)).toBe(false);
    expect(shouldAttemptRenewal(s({ status: "past_due", renewal_attempts: 1, last_renewal_attempt_at: at(24) }), NOW)).toBe(true);
    expect(shouldAttemptRenewal(s({ status: "past_due", renewal_attempts: 2, last_renewal_attempt_at: at(48) }), NOW)).toBe(false);
    expect(shouldAttemptRenewal(s({ status: "past_due", renewal_attempts: 2, last_renewal_attempt_at: at(72) }), NOW)).toBe(true);
    expect(shouldAttemptRenewal(s({ status: "past_due", renewal_attempts: MAX_RENEWAL_ATTEMPTS, last_renewal_attempt_at: at(500) }), NOW)).toBe(false);
  });
});
