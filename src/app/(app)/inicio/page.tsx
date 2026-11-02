import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/db-page";
import { Card, PageHeader, Stat } from "@/components/ui";
import { HeartPulse, Scale, TrendingUp } from "lucide-react";
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

  const [{ data: profile }, txs, { data: rules }, { data: goals }, { data: contribs }, { data: budgets }, { count: pending }, { data: debts }] = await Promise.all([
    supabase.from("profiles").select("full_name, currency").eq("id", user!.id).single(),
    selectAll<{ type: string; amount_cents: number; category_id: string | null }>((a, b) => supabase.from("transactions").select("type, amount_cents, category_id").eq("status", "confirmed").gte("occurred_on", from).lte("occurred_on", to).order("id").range(a, b)),
    supabase.from("recurring_rules").select("id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active").eq("active", true),
    supabase.from("savings_goals").select("id, target_cents, saved_cents, target_date").eq("status", "active"),
    supabase.from("goal_contributions").select("goal_id, amount_cents").gte("contributed_on", from).lte("contributed_on", to),
    supabase.from("budgets").select("category_id, amount_cents").eq("period_month", from),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("debts").select("installment_cents, next_due_date").eq("active", true).not("installment_cents", "is", null).gte("next_due_date", from).lte("next_due_date", to),
  ]);

  const sum = (t: string) => txs.filter((x) => x.type === t).reduce((a, x) => a + x.amount_cents, 0);
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
  for (const t of txs) if (t.type === "expense" && t.category_id) spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + t.amount_cents);
  const budgetAlerts = (budgets ?? []).map((b) => budgetStatus(spentByCat.get(b.category_id) ?? 0, b.amount_cents)).filter((s) => s.level !== "ok");
  const over = budgetAlerts.filter((s) => s.level === "over").length, warn = budgetAlerts.length - over;

  const soon = upcomingEvents((rules ?? []) as RuleLite[], today, addDaysISO(today, 7), 3).slice(0, 4);

  const spentPct = income > 0 ? Math.min(100, Math.round((expense / income) * 100)) : expense > 0 ? 100 : 0;
  const rate = savingsRate(income, expense);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(new Date()));
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const monthName = new Date(today + "T12:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const alerts = (
    <>
      {!!pending && <Link href="/movimientos?tipo=pending"><Card className="border-warn/50 bg-warn-soft transition hover:brightness-105"><p className="font-semibold text-warn">{pending} movimiento(s) por revisar</p><p className="text-sm text-muted">Confírmalos para que cuenten en tus cifras.</p></Card></Link>}
      {budgetAlerts.length > 0 && <Link href="/presupuestos"><Card className={over ? "border-danger/50 bg-danger-soft" : "border-warn/50 bg-warn-soft"}>
        <p className={`font-semibold ${over ? "text-danger" : "text-warn"}`}>{over > 0 && `${over} presupuesto(s) excedido(s)`}{over > 0 && warn > 0 && " · "}{warn > 0 && `${warn} cerca del límite`}</p><p className="text-sm text-muted">Revisa tus presupuestos del mes.</p></Card></Link>}
    </>
  );

  return (
    <div className="wide space-y-5">
      <PageHeader title="Tu mes" subtitle={<>{greeting}{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} · <span className="capitalize">{monthName}</span></>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="space-y-4 bg-brand text-brand-fg shadow-none lg:p-7">
            <div>
              <p className="text-sm opacity-80">Disponible para gastar</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight lg:text-5xl">{formatMoney(available, cur)}</p>
            </div>
            <div className="space-y-1.5">
              <div role="progressbar" aria-label="Gastado del ingreso del mes" aria-valuenow={spentPct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-black/20">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${spentPct}%` }} />
              </div>
              <p className="flex justify-between text-xs opacity-80"><span>Has gastado el {spentPct} % de tus ingresos</span><span>Ahorro: {rate} %</span></p>
            </div>
            <p className="text-xs opacity-70">Ingresos − gastos − provisiones − ahorro pendiente − fijos pendientes</p>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:gap-4 2xl:grid-cols-4">
            <Stat label="Ingresos" value={formatMoney(income, cur)} tone="good" />
            <Stat label="Egresos" value={formatMoney(expense, cur)} />
            <Stat label="Provisiones / mes" value={formatMoney(provisions, cur)} hint="Pagos no mensuales" />
            <Stat label="Ahorro pendiente" value={formatMoney(goalsMonthly, cur)} hint="Aporte de este mes" />
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Próximos 7 días</h2><Link href="/calendario" className="text-sm font-semibold text-brand hover:underline">Ver calendario</Link></div>
            {!soon.length && <Card className="py-6 text-center text-sm text-muted">Nada por vencer esta semana. 🎉</Card>}
            <div className="grid gap-2 lg:grid-cols-2">
              {soon.map((e) => (
                <Card key={`${e.ruleId}:${e.date}`} className="flex items-center justify-between gap-3 p-3 lg:p-4">
                  <div className="min-w-0"><p className="truncate font-medium">{e.name}</p><p className="text-xs text-muted">{e.date === today ? "Hoy" : e.date}</p></div>
                  <p className={`font-semibold tabular-nums ${e.type === "income" ? "text-brand" : ""}`}>{formatMoney(e.amountCents, cur)}</p>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {alerts}
          <Card className="space-y-1 p-2 lg:p-2">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Análisis</p>
            {([["/salud", "Salud financiera", HeartPulse], ["/proyeccion", "Proyección de caja", TrendingUp], ["/patrimonio", "Patrimonio", Scale]] as const).map(([h, l, I]) => (
              <Link key={h} href={h} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-card-2"><I size={18} className="text-brand" aria-hidden />{l}<span className="ml-auto text-muted">›</span></Link>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  );
}
