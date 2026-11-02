import { addDays, addMonths, addYears, format, parseISO } from "date-fns";
import type { Cents } from "./money";

export type Frequency =
  | "weekly" | "biweekly" | "monthly" | "bimonthly"
  | "quarterly" | "semiannual" | "annual" | "custom";

/** Meses que abarca cada ciclo (null si no es mensual-múltiplo). */
export const MONTHS_PER_CYCLE: Record<Frequency, number | null> = {
  weekly: null, biweekly: null, monthly: 1, bimonthly: 2,
  quarterly: 3, semiannual: 6, annual: 12, custom: null,
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Siguiente fecha de vencimiento a partir de `from` (ISO yyyy-MM-dd). */
export function nextOccurrence(from: string, freq: Frequency, intervalDays?: number | null): string {
  const d = parseISO(from);
  switch (freq) {
    case "weekly": return iso(addDays(d, 7));
    case "biweekly": return iso(addDays(d, 14));
    case "monthly": return iso(addMonths(d, 1));
    case "bimonthly": return iso(addMonths(d, 2));
    case "quarterly": return iso(addMonths(d, 3));
    case "semiannual": return iso(addMonths(d, 6));
    case "annual": return iso(addYears(d, 1));
    case "custom":
      if (!intervalDays || intervalDays < 1) throw new Error("interval_days requerido para frecuencia custom");
      return iso(addDays(d, intervalDays));
  }
}

/** Equivalente mensual de un monto recurrente. Útil para presupuesto y "disponible". */
export function monthlyEquivalent(amount: Cents, freq: Frequency, intervalDays?: number | null): Cents {
  switch (freq) {
    case "weekly": return Math.round((amount * 52) / 12);
    case "biweekly": return Math.round((amount * 26) / 12);
    case "custom": return Math.round((amount * 365) / (intervalDays ?? 30) / 12);
    default: return Math.round(amount / (MONTHS_PER_CYCLE[freq] as number));
  }
}

/**
 * Provisión mensual (sinking fund) para un pago no mensual:
 * cuota = monto / meses del ciclo. Para pagos mensuales no aplica provisión (0).
 */
export function monthlyProvision(amount: Cents, freq: Frequency): Cents {
  const m = MONTHS_PER_CYCLE[freq];
  if (!m || m === 1) return 0;
  return Math.ceil(amount / m);
}

/** Genera las fechas de vencimiento dentro de [start, end] (inclusive). */
export function occurrencesBetween(
  firstDate: string, freq: Frequency, start: string, end: string, intervalDays?: number | null, limit = 500,
): string[] {
  const out: string[] = [];
  let cur = firstDate;
  let guard = 0;
  while (cur <= end && guard++ < limit) {
    if (cur >= start) out.push(cur);
    cur = nextOccurrence(cur, freq, intervalDays);
  }
  return out;
}
