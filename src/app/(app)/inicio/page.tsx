import { startOfMonth, endOfMonth, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { monthlyProvision, type Frequency } from "@/lib/finance/recurrence";
import { goalProgress } from "@/lib/finance/savings";
import { availableToSpend, savingsRate } from "@/lib/finance/summary";

export const metadata = { title: "Inicio" };

export default async function Inicio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  const [{ data: profile }, { data: txs }, { data: rules }, { data: goals }, { count: pending }] = await Promise.all([
    supabase.from("profiles").select("full_name, currency").eq("id", user!.id).single(),
    supabase.from("transactions").select("type, amount_cents").eq("status", "confirmed").gte("occurred_on", from).lte("occurred_on", to),
    supabase.from("recurring_rules").select("type, amount_cents, frequency, next_date").eq("active", true).eq("type", "expense"),
    supabase.from("savings_goals").select("target_cents, saved_cents, target_date").eq("status", "active"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
  ]);

  const sum = (t: string) => (txs ?? []).filter((x) => x.type === t).reduce((a, x) => a + x.amount_cents, 0);
  const income = sum("income"), expense = sum("expense");
  const provisions = (rules ?? []).reduce((a, r) => a + monthlyProvision(r.amount_cents, r.frequency as Frequency), 0);
  const goalsMonthly = (goals ?? []).reduce((a, g) => a + goalProgress(g.target_cents, g.saved_cents, g.target_date).monthlyContributionCents, 0);
  const pendingFixed = (rules ?? []).filter((r) => r.frequency === "monthly" && r.next_date >= from && r.next_date <= to).reduce((a, r) => a + r.amount_cents, 0);
  const available = availableToSpend({ incomeCents: income, expenseCents: expense, provisionsCents: provisions, goalContributionsCents: goalsMonthly, pendingFixedCents: pendingFixed });
  const cur = profile?.currency ?? "COP";

  return (
    <div className="space-y-4">
      <header><p className="text-sm text-muted">Hola, {profile?.full_name?.split(" ")[0] ?? ""} 👋</p><h1 className="text-2xl font-bold">Tu mes</h1></header>

      <Card className="bg-brand text-brand-fg">
        <p className="text-sm opacity-80">Disponible para gastar</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatMoney(available, cur)}</p>
        <p className="mt-2 text-xs opacity-80">Ingresos − gastos − provisiones − ahorro − fijos pendientes</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Ingresos</p><p className="text-lg font-semibold tabular-nums">{formatMoney(income, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Egresos</p><p className="text-lg font-semibold tabular-nums">{formatMoney(expense, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Provisiones / mes</p><p className="text-lg font-semibold tabular-nums">{formatMoney(provisions, cur)}</p></Card>
        <Card><p className="text-xs text-muted">Tasa de ahorro</p><p className="text-lg font-semibold">{savingsRate(income, expense)}%</p></Card>
      </div>

      {!!pending && <Card className="border-brand"><p className="font-semibold">{pending} movimiento(s) por revisar</p><p className="text-sm text-muted">Detectados automáticamente. Confírmalos para que cuenten.</p></Card>}
    </div>
  );
}
