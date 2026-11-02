import { differenceInCalendarDays, parseISO } from "date-fns";
import { nextOccurrence, type Frequency } from "./recurrence";
import { formatMoney, type Cents } from "./money";

// ---------- Presupuestos ----------
export type BudgetLevel = "ok" | "warn" | "over";
export interface BudgetStatus { percent: number; remainingCents: Cents; level: BudgetLevel }

/** Alerta al 80 % (warn) y al 100 % (over). El porcentaje no se recorta para mostrar excesos. */
export function budgetStatus(spentCents: Cents, budgetCents: Cents): BudgetStatus {
  const percent = budgetCents <= 0 ? 0 : Math.round((spentCents / budgetCents) * 100);
  return { percent, remainingCents: budgetCents - spentCents, level: percent >= 100 ? "over" : percent >= 80 ? "warn" : "ok" };
}

// ---------- Calendario y recordatorios ----------
export interface RuleLite {
  id: string; name: string; type: "income" | "expense"; amount_cents: Cents; amount_is_estimate: boolean;
  frequency: Frequency; interval_days?: number | null; next_date: string; end_date?: string | null;
  remind_days_before: number; active: boolean;
}

export interface CalendarEvent {
  date: string; ruleId: string; name: string; type: "income" | "expense"; amountCents: Cents; estimate: boolean; overdue: boolean;
}

/**
 * Vencimientos entre `from` y `to` (ISO). Un vencimiento anterior a `from` aún sin pagar se marca vencido
 * (la regla solo avanza next_date cuando se paga o la registra el cron).
 */
export function upcomingEvents(rules: RuleLite[], from: string, to: string, limitPerRule = 60): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    let d = r.next_date;
    let guard = 0;
    while (d <= to && guard++ < limitPerRule) {
      if (r.end_date && d > r.end_date) break;
      out.push({ date: d, ruleId: r.id, name: r.name, type: r.type, amountCents: r.amount_cents, estimate: r.amount_is_estimate, overdue: d < from });
      d = nextOccurrence(d, r.frequency, r.interval_days);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export interface DueReminder { rule: RuleLite; kind: "before" | "due"; daysLeft: number }

/** Recordatorios a enviar hoy: N días antes y el día del vencimiento. Un 0 en remind_days_before = solo el día. */
export function remindersDue(rules: RuleLite[], today: string): DueReminder[] {
  const out: DueReminder[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    const daysLeft = differenceInCalendarDays(parseISO(r.next_date), parseISO(today));
    if (daysLeft === 0) out.push({ rule: r, kind: "due", daysLeft });
    else if (r.remind_days_before > 0 && daysLeft === r.remind_days_before) out.push({ rule: r, kind: "before", daysLeft });
  }
  return out;
}

export const reminderKey = (d: DueReminder) => `${d.rule.id}:${d.rule.next_date}:${d.kind}`;

export function reminderText(d: DueReminder): { title: string; body: string } {
  const amount = formatMoney(d.rule.amount_cents) + (d.rule.amount_is_estimate ? " (aprox.)" : "");
  const verb = d.rule.type === "income" ? "llega" : "vence";
  const when = d.kind === "due" ? "hoy" : d.daysLeft === 1 ? "mañana" : `en ${d.daysLeft} días`;
  return { title: d.rule.type === "income" ? "Ingreso esperado" : "Pago por vencer", body: `${d.rule.name} ${verb} ${when}: ${amount}` };
}
