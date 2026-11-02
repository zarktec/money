import { differenceInCalendarMonths, parseISO, startOfMonth } from "date-fns";
import type { Cents } from "./money";

export interface GoalProgress {
  remainingCents: Cents;
  monthsLeft: number;
  /** Cuota mensual sugerida para llegar a tiempo (recalculada con lo ya ahorrado). */
  monthlyContributionCents: Cents;
  percent: number;
  overdue: boolean;
}

/** Meses restantes contando el mes en curso; mínimo 1 para evitar división por cero. */
export function monthsUntil(targetDate: string, today = new Date()): number {
  const diff = differenceInCalendarMonths(startOfMonth(parseISO(targetDate)), startOfMonth(today));
  return Math.max(diff, 0) + 1;
}

export function goalProgress(
  targetCents: Cents, savedCents: Cents, targetDate: string, today = new Date(),
): GoalProgress {
  const remaining = Math.max(targetCents - savedCents, 0);
  const overdue = parseISO(targetDate) < today && remaining > 0;
  const monthsLeft = monthsUntil(targetDate, today);
  return {
    remainingCents: remaining,
    monthsLeft,
    monthlyContributionCents: remaining === 0 ? 0 : Math.ceil(remaining / monthsLeft),
    percent: targetCents === 0 ? 0 : Math.min(100, Math.round((savedCents / targetCents) * 100)),
    overdue,
  };
}
