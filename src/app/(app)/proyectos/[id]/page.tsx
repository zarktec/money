import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { formatMoney } from "@/lib/finance/money";
import { budgetStatus } from "@/lib/finance/planning";
import { goalProgress } from "@/lib/finance/savings";
import { todayISO } from "@/lib/dates";
import { archiveProject } from "../../actions-planning";

export const metadata = { title: "Proyecto" };

export default async function Proyecto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: txs }, { data: goals }] = await Promise.all([
    supabase.from("transactions").select("id, type, amount_cents, occurred_on, description").eq("project_id", id).eq("status", "confirmed").order("occurred_on", { ascending: false }).limit(50),
    supabase.from("savings_goals").select("id, name, target_cents, saved_cents, target_date").eq("project_id", id).neq("status", "canceled"),
  ]);
  const spent = (txs ?? []).filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  const b = p.budget_cents ? budgetStatus(spent, p.budget_cents) : null;
  const today = new Date(todayISO() + "T12:00:00");

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">{p.name}</h1>{p.description && <p className="text-sm text-muted">{p.description}</p>}</header>
      <Card className="space-y-2">
        <p className="text-sm text-muted">Gastado</p><p className="text-3xl font-bold tabular-nums">{formatMoney(spent)}</p>
        {b && p.budget_cents && (<><Progress percent={b.percent} level={b.level} label="Gasto del proyecto" />
          <p className={`text-sm ${b.level === "over" ? "text-danger" : "text-muted"}`}>{b.level === "over" ? `Te pasaste ${formatMoney(-b.remainingCents)}` : `Quedan ${formatMoney(b.remainingCents)} de ${formatMoney(p.budget_cents)}`}</p></>)}
      </Card>
      {!!goals?.length && <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Metas de ahorro</h2>
        {goals.map((g) => { const gp = goalProgress(g.target_cents, g.saved_cents, g.target_date, today);
          return <Link key={g.id} href={`/ahorros/${g.id}`}><Card className="mb-2 space-y-2"><p className="font-medium">{g.name}</p><Progress percent={gp.percent} /><p className="text-xs text-muted">{gp.percent}% · {formatMoney(gp.monthlyContributionCents)}/mes</p></Card></Link>; })}</section>}
      <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Movimientos</h2>
        {!txs?.length && <p className="text-sm text-muted">Elige este proyecto al registrar un movimiento para verlo aquí.</p>}
        {txs?.map((t) => <Link key={t.id} href={`/movimientos/${t.id}`}><Card className="mb-2 flex justify-between p-3"><span className="truncate">{t.description || t.occurred_on}</span>
          <span className={`font-semibold tabular-nums ${t.type === "income" ? "text-brand" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(t.amount_cents)}</span></Card></Link>)}</section>
      <form action={archiveProject}><input type="hidden" name="id" value={p.id} /><button className="rounded-lg px-3 py-2 text-sm text-danger">Archivar proyecto</button></form>
    </div>
  );
}
