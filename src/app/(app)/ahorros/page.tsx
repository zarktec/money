import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { formatMoney } from "@/lib/finance/money";
import { goalProgress } from "@/lib/finance/savings";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Ahorros" };
const STATUS: Record<string, string> = { active: "", completed: "✓ Lograda", paused: "En pausa", canceled: "Cancelada" };

export default async function Ahorros() {
  const supabase = await createClient();
  const { data: goals } = await supabase.from("savings_goals").select("id, name, target_cents, saved_cents, target_date, status").neq("status", "canceled").order("target_date");
  const today = new Date(todayISO() + "T12:00:00");
  const list = (goals ?? []).map((g) => ({ ...g, p: goalProgress(g.target_cents, g.saved_cents, g.target_date, today) }));
  const active = list.filter((g) => g.status === "active");
  const monthly = active.reduce((a, g) => a + g.p.monthlyContributionCents, 0);
  const saved = list.reduce((a, g) => a + g.saved_cents, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Ahorros</h1>
        <Link href="/ahorros/nueva" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nueva meta</Link></header>
      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Ahorrado</p><p className="font-semibold tabular-nums">{formatMoney(saved)}</p></Card>
        <Card><p className="text-xs text-muted">Aporte sugerido / mes</p><p className="font-semibold tabular-nums">{formatMoney(monthly)}</p></Card>
      </div>
      {!list.length && <p className="py-10 text-center text-muted">Crea una meta (viaje, vehículo, vivienda…) y te decimos cuánto ahorrar cada mes.</p>}
      {list.map((g) => (
        <Link key={g.id} href={`/ahorros/${g.id}`}>
          <Card className="mb-3 space-y-2">
            <div className="flex items-start justify-between gap-3"><p className="font-medium">{g.name}</p><p className="text-xs text-muted">{STATUS[g.status]}</p></div>
            <Progress percent={g.p.percent} label={`Progreso de ${g.name}`} />
            <div className="flex justify-between text-xs text-muted">
              <span>{formatMoney(g.saved_cents)} de {formatMoney(g.target_cents)}</span><span>{g.p.percent}%</span>
            </div>
            {g.status === "active" && <p className={`text-sm ${g.p.overdue ? "text-danger" : "text-brand"}`}>
              {g.p.overdue ? `Venció el ${g.target_date}. Faltan ${formatMoney(g.p.remainingCents)}` : `Ahorra ${formatMoney(g.p.monthlyContributionCents)} al mes · ${g.target_date}`}</p>}
          </Card>
        </Link>
      ))}
    </div>
  );
}
