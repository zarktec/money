import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { ContributionForm } from "@/components/planning-forms";
import { formatMoney } from "@/lib/finance/money";
import { goalProgress } from "@/lib/finance/savings";
import { todayISO } from "@/lib/dates";
import { deleteContribution, deleteGoal, setGoalStatus } from "../../actions-planning";

export const metadata = { title: "Meta de ahorro" };

export default async function Meta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: g } = await supabase.from("savings_goals").select("*").eq("id", id).maybeSingle();
  if (!g) notFound();
  const { data: contribs } = await supabase.from("goal_contributions").select("id, amount_cents, contributed_on, note").eq("goal_id", id).order("contributed_on", { ascending: false }).limit(100);
  const today = todayISO();
  const p = goalProgress(g.target_cents, g.saved_cents, g.target_date, new Date(today + "T12:00:00"));

  return (
    <div className="space-y-4">
      <header><p className="text-sm text-muted">{g.status === "completed" ? "✓ Meta lograda" : g.status === "paused" ? "En pausa" : `Meta para el ${g.target_date}`}</p><h1 className="text-2xl font-bold">{g.name}</h1></header>
      <Card className="space-y-3">
        <p className="text-3xl font-bold tabular-nums">{formatMoney(g.saved_cents)}</p>
        <Progress percent={p.percent} label="Progreso" />
        <p className="text-sm text-muted">{p.percent}% de {formatMoney(g.target_cents)} · faltan {formatMoney(p.remainingCents)}</p>
        {g.status === "active" && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          {p.overdue ? "La fecha ya pasó. Ajusta la meta o sigue aportando." : `Ahorra ${formatMoney(p.monthlyContributionCents)} este mes y los ${p.monthsLeft - 1} siguientes para llegar a tiempo.`}</p>}
      </Card>

      <Card><h2 className="mb-3 font-semibold">Registrar aporte</h2><ContributionForm goalId={g.id} today={today} /></Card>

      <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Historial</h2>
        {!contribs?.length && <p className="text-sm text-muted">Aún no hay aportes.</p>}
        {contribs?.map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1"><p className="text-sm">{c.contributed_on}</p>{c.note && <p className="truncate text-xs text-muted">{c.note}</p>}</div>
            <p className={`font-semibold tabular-nums ${c.amount_cents < 0 ? "text-danger" : "text-brand"}`}>{c.amount_cents > 0 ? "+" : "−"}{formatMoney(Math.abs(c.amount_cents))}</p>
            <form action={deleteContribution}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="goal_id" value={g.id} /><button aria-label="Eliminar aporte" className="grid size-10 place-items-center text-muted">🗑</button></form>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-2 pt-2">
        {g.status === "active" && <form action={setGoalStatus}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="paused" /><button className="rounded-lg border border-line px-3 py-2 text-sm">Pausar</button></form>}
        {g.status === "paused" && <form action={setGoalStatus}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="active" /><button className="rounded-lg border border-line px-3 py-2 text-sm">Reanudar</button></form>}
        <form action={deleteGoal}><input type="hidden" name="id" value={g.id} /><button className="rounded-lg px-3 py-2 text-sm text-danger">Eliminar meta</button></form>
      </div>
    </div>
  );
}
