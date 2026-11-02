import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { formatMoney } from "@/lib/finance/money";
import { budgetStatus } from "@/lib/finance/planning";

export const metadata = { title: "Proyectos" };

export default async function Proyectos() {
  const supabase = await createClient();
  const [{ data: projects }, { data: spent }] = await Promise.all([
    supabase.from("projects").select("id, name, budget_cents, end_date").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("transactions").select("project_id, amount_cents").eq("type", "expense").eq("status", "confirmed").not("project_id", "is", null),
  ]);
  const byProject = new Map<string, number>();
  for (const t of spent ?? []) byProject.set(t.project_id, (byProject.get(t.project_id) ?? 0) + t.amount_cents);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Proyectos</h1>
        <Link href="/proyectos/nuevo" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nuevo</Link></header>
      {!projects?.length && <p className="py-10 text-center text-muted">Agrupa los gastos de un viaje, una remodelación o un negocio para ver cuánto llevas.</p>}
      {projects?.map((p) => {
        const s = byProject.get(p.id) ?? 0;
        const b = p.budget_cents ? budgetStatus(s, p.budget_cents) : null;
        return (
          <Link key={p.id} href={`/proyectos/${p.id}`}><Card className="mb-3 space-y-2">
            <p className="font-medium">{p.name}</p>
            {b ? (<><Progress percent={b.percent} level={b.level} label={`Gasto de ${p.name}`} />
              <p className="text-xs text-muted">{formatMoney(s)} de {formatMoney(p.budget_cents)} · {b.percent}%</p></>)
              : <p className="text-xs text-muted">Gastado: {formatMoney(s)}</p>}
          </Card></Link>
        );
      })}
    </div>
  );
}
