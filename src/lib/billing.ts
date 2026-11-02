import { addMonths, addYears } from "date-fns";

export type Interval = "month" | "year" | "lifetime";

/**
 * Siguiente periodo de una suscripción. Una renovación a tiempo (el periodo actual aún no vence) empieza donde terminó el anterior,
 * así quien paga unos días antes no pierde esos días; un pago tardío o el primero empieza ahora.
 */
export function nextPeriod(interval: Interval, currentEnd: string | null, now: Date): { start: Date; end: Date } {
  const start = currentEnd && Date.parse(currentEnd) > now.getTime() ? new Date(currentEnd) : now;
  const end = interval === "year" ? addYears(start, 1) : interval === "lifetime" ? addYears(start, 100) : addMonths(start, 1);
  return { start, end };
}

/** Fecha a partir de la cual intentar el cobro automático: 2 días antes de que venza el periodo. */
export const RENEW_LEAD_MS = 2 * 86_400_000;
/** Reintentos de un cobro rechazado: a las 24 h, a las 72 h y luego se da por vencida. */
export const RETRY_AFTER_HOURS = [24, 72] as const;
export const MAX_RENEWAL_ATTEMPTS = 1 + RETRY_AFTER_HOURS.length;

export interface RenewalCandidate { status: string; cancel_at_period_end: boolean; wompi_payment_source_id: string | null; current_period_end: string | null; renewal_attempts: number; last_renewal_attempt_at: string | null }

/** ¿Toca intentar cobrar ahora? Respeta la cancelación, el calendario de reintentos y que haya una tarjeta guardada. */
export function shouldAttemptRenewal(s: RenewalCandidate, now: Date): boolean {
  if (!["active", "past_due"].includes(s.status) || s.cancel_at_period_end || !s.wompi_payment_source_id || !s.current_period_end) return false;
  if (s.renewal_attempts >= MAX_RENEWAL_ATTEMPTS) return false;
  const end = Date.parse(s.current_period_end);
  if (now.getTime() < end - RENEW_LEAD_MS) return false;                      // aún falta mucho
  if (s.renewal_attempts === 0) return true;
  const wait = RETRY_AFTER_HOURS[s.renewal_attempts - 1] * 3_600_000;
  return !s.last_renewal_attempt_at || now.getTime() - Date.parse(s.last_renewal_attempt_at) >= wait;
}
