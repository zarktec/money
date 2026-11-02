import "server-only";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/db-page";
import { addDaysISO, monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import { monthlyEquivalent, type Frequency } from "@/lib/finance/recurrence";
import { goalProgress } from "@/lib/finance/savings";
import type { RuleLite } from "@/lib/finance/planning";

const LIQUID = new Set(["cash", "checking", "savings", "wallet"]);

/** Foto de la situación del usuario que alimenta salud, proyección y patrimonio. */
export async function loadSnapshot() {
  const supabase = await createClient();
  const today = todayISO();
  const cur = monthBounds(today);
  const winFrom = `${shiftMonth(cur.month, -3)}-01`;
  const winTo = addDaysISO(cur.from, -1);

  const [accounts, balances, rules, debts, assets, goals, debtCat] = await Promise.all([
    supabase.from("accounts").select("id, name, type").eq("archived", false),
    supabase.from("account_balances").select("account_id, balance_cents"),
    supabase.from("recurring_rules").select("id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active").eq("active", true),
    supabase.from("debts").select("id, name, balance_cents, annual_rate, installment_cents, next_due_date, active").eq("active", true),
    supabase.from("assets").select("id, name, kind, value_cents").order("created_at"),
    supabase.from("savings_goals").select("target_cents, saved_cents, target_date").eq("status", "active"),
    supabase.from("expense_categories").select("id").is("user_id", null).eq("name", "Deudas y créditos").limit(1).maybeSingle(),
  ]);

  // Promedios: últimos 3 meses completos; si no hay historial, el mes en curso hasta hoy (contado como 1 mes).
  type Tx = { type: string; amount_cents: number; occurred_on: string; recurring_rule_id: string | null; category_id: string | null };
  // Paginado: PostgREST corta en 1.000 filas y los promedios saldrían mal para quien tiene muchos movimientos.
  const readTx = (a: string, b: string) => selectAll<Tx>((from, to) => supabase.from("transactions").select("type, amount_cents, occurred_on, recurring_rule_id, category_id")
    .eq("status", "confirmed").neq("type", "transfer").gte("occurred_on", a).lte("occurred_on", b).order("occurred_on").order("id").range(from, to));
  let txs = await readTx(winFrom, winTo);
  if (!txs.length) txs = await readTx(cur.from, today);
  const months = Math.max(new Set(txs.map((t) => t.occurred_on.slice(0, 7))).size, 1);
  const sum = (f: (t: Tx) => boolean) => txs.filter(f).reduce((a, t) => a + t.amount_cents, 0) / months;
  const avgIncome = Math.round(sum((t) => t.type === "income"));
  const avgExpense = Math.round(sum((t) => t.type === "expense"));
  const avgVariable = Math.round(sum((t) => t.type === "expense" && !t.recurring_rule_id && t.category_id !== debtCat.data?.id));

  const bal = new Map((balances.data ?? []).map((b) => [b.account_id, Number(b.balance_cents)]));
  const accountRows = (accounts.data ?? []).map((a) => ({ ...a, balanceCents: bal.get(a.id) ?? 0 }));
  const liquid = accountRows.filter((a) => LIQUID.has(a.type)).reduce((s, a) => s + a.balanceCents, 0);

  const ruleRows = (rules.data ?? []) as RuleLite[];
  const fixedMonthly = ruleRows.filter((r) => r.type === "expense").reduce((a, r) => a + monthlyEquivalent(r.amount_cents, r.frequency as Frequency, r.interval_days), 0);
  const debtRows = (debts.data ?? []).map((d) => ({ id: d.id as string, name: d.name as string, balanceCents: Number(d.balance_cents), annualRate: Number(d.annual_rate ?? 0), installmentCents: Number(d.installment_cents ?? 0), nextDueDate: d.next_due_date as string | null }));
  const debtPayments = debtRows.reduce((a, d) => a + d.installmentCents, 0);
  const now = new Date(today + "T12:00:00");
  const goalsMonthly = (goals.data ?? []).reduce((a, g) => a + goalProgress(g.target_cents, g.saved_cents, g.target_date, now).monthlyContributionCents, 0);

  return {
    today, month: cur.month, accounts: accountRows, liquidCents: liquid, rules: ruleRows, debts: debtRows,
    assets: (assets.data ?? []).map((a) => ({ id: a.id as string, name: a.name as string, kind: a.kind as string, valueCents: Number(a.value_cents) })),
    avgIncomeCents: avgIncome, avgExpenseCents: avgExpense, avgVariableCents: avgVariable,
    fixedMonthlyCents: fixedMonthly, debtPaymentsMonthlyCents: debtPayments, goalsMonthlyCents: goalsMonthly, monthsOfHistory: months,
  };
}
