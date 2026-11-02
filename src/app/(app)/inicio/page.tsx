import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { monthlyProvision, type Frequency } from "@/lib/finance/recurrence";
import { goalProgress } from "@/lib/finance/savings";
import { availableToSpend, savingsRate } from "@/lib/finance/summary";
import { budgetStatus, upcomingEvents, type RuleLite } from "@/lib/finance/planning";
import { addDaysISO, monthBounds, todayISO } from "@/lib/dates";

export const metadata = { title: "Inicio" };

export default async function Inicio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = todayISO();
  const { from, to } = monthBounds(today);

  const [{ data: profile }, { data: txs }, { data: rules }, { data: goals }, { data: contribs }, { data: budgets }, { count: pending }, { data: debts }] = await Promise.all([
    supabase.from("profiles").select("full_name, currency").eq("id", user!.id).single(),
    supabase.from("transactions").select("type, amount_cents, category_id").eq("status", "confirmed").gte("occurred_on", from).lte("occurred_on", to),
    supabase.from("recurring_rules").select("id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active").eq("active", true),
    supabase.from("savings_goals").select("id, target_cents, saved_cents, target_date").eq("status", "active"),
    supabase.from("goal_contributions").select("goal_id, amount_cents").gte("contributed_on", from).lte("contributed_on", to),
    supabase.from("budgets").select("category_id, amount_cents").eq("period_month", from),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("debts").select("installment_cents, next_due_date").eq("active", true).not("installment_cents", "is", null).gte("next_due_date", from).lte("next_due_date", to),
  ]);

  const sum = (t: string) => (txs ?? []).filter((x) => x.type === t).reduce((a, x) => a + x.amount_cents, 0);
  const income = sum("income"), expense = sum("expense");
  const expenseRules = (rules ?? []).filter((r) => r.type === "expense");
  const provisions = expenseRules.reduce((a, r) => a + monthlyProvision(r.amount_cents, r.frequency as Frequency), 0);

  // Compromiso de ahorro del mes = cuota sugerida − lo ya aportado este mes a esa meta (nunca negativo).
  const doneByGoal = new Map<string, number>();
  for (const c of contribs ?? []) doneByGoal.set(c.goal_id, (doneByGoal.get(c.goal_id) ?? 0) + c.amount_cents);
  const now = new Date(today + "T12:00:00");
  const goalsMonthly = (goals ?? []).reduce((a, g) => {
    const quota = goalProgress(g.target_cents, g.saved_cents, g.target_date, now).monthlyContributionCents;
    return a + Math.max(quota - (doneByGoal.get(g.id) ?? 0), 0);
  }, 0);

  const pendingDebts = (debts ?? []).reduce((a, d) => a + Number(d.installment_cents ?? 0), 0);
  const pendingFixed = expenseRules.filter((r) => r.frequency === "monthly" && r.next_date >= from && r.next_date <= to).reduce((a, r) => a + r.amount_cents, 0) + pendingDebts;
  const available = availableToSpend({ incomeCents: income, expenseCents: expense, provisionsCents: provisions, goalContributionsCents: goalsMonthly, pendingFixedCents: pendingFixed });
  const cur = profile?.currency ?? "COP";

  const spentByCat = new Map<string, number>();
  for (const t of txs ?? []) if (t.type === "expense" && t.category_id) spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + t.amount_cents);
  const budgetAlerts = (budgets ?? []).map((b) => budgetStatus(spentByCat.get(b.category_id) ?? 0, b.amount_cents)).filter((s) => s.level !== "ok");
  const over = budgetAlerts.filter((s) => s.level === "over").length, warn = budgetAlerts.length - over;

  const soon = upcomingEvents((rules ?? []) as RuleLite[], today, addDaysISO(today, 7), 3).slice(0, 4);

  return (
    <div className="space-y-4">
      <header><p className="text-sm text-muted">Hola, {profile?.full_name?.split(" ")[0] ?? ""} 👋</p><h1 className="text-2xl font-bold">Tu mes</h1></header>

      <Card className="bg-brand text-brand-fg">
        <p className="text-sm opacity-80">Disponible para gastar</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatMoney(available, cur)}</p>
        <p className="mt-2 text-xs opacity-80">Ingresos − gastos − provisiones − ahorro pendiente − fijos pendientes</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Ingresos</p><p className="text-lg font-semibold tabular-nums">{formatMoney(income, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Egresos</p><p className="text-lg font-semibold tabular-nums">{formatMoney(expense, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Provisiones / mes</p><p className="text-lg font-semibold tabular-nums">{formatMoney(provisions, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Ahorro pendiente del mes</p><p className="text-lg font-semibold tabular-nums">{formatMoney(goalsMonthly, cur)}</p></Card>
      </div>
      <p className="text-center text-xs text-muted">Tasa de ahorro: {savingsRate(income, expense)}%</p>

      {!!pending && <Link href="/movimientos?tipo=pending"><Card className="border-amber-400"><p className="font-semibold">{pending} movimiento(s) por revisar</p><p className="text-sm text-muted">Confírmalos para que cuenten en tus cifras.</p></Card></Link>}

      {budgetAlerts.length > 0 && <Link href="/presupuestos"><Card className={over ? "border-danger" : "border-amber-400"}>
        <p className="font-semibold">{over > 0 && `${over} presupuesto(s) excedido(s)`}{over > 0 && warn > 0 && " · "}{warn > 0 && `${warn} cerca del límite`}</p><p className="text-sm text-muted">Revisa tus presupuestos del mes.</p></Card></Link>}

      <div className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
        <Link href="/salud" className="rounded-xl border border-line bg-card py-3">Salud</Link>
        <Link href="/proyeccion" className="rounded-xl border border-line bg-card py-3">Proyección</Link>
        <Link href="/patrimonio" className="rounded-xl border border-line bg-card py-3">Patrimonio</Link>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Próximos 7 días</h2><Link href="/calendario" className="text-sm font-semibold text-brand">Ver calendario</Link></div>
        {!soon.length && <p className="text-sm text-muted">Nada por vencer esta semana.</p>}
        {soon.map((e) => (
          <Card key={`${e.ruleId}:${e.date}`} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="truncate font-medium">{e.name}</p><p className="text-xs text-muted">{e.date === today ? "Hoy" : e.date}</p></div>
            <p className={`font-semibold tabular-nums ${e.type === "income" ? "text-brand" : ""}`}>{formatMoney(e.amountCents, cur)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
