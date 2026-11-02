import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { BudgetForm } from "@/components/planning-forms";
import { formatMoney } from "@/lib/finance/money";
import { budgetStatus } from "@/lib/finance/planning";
import { monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import { getFormOptions } from "@/lib/options";
import { copyBudgets, deleteBudget } from "../actions-planning";

export const metadata = { title: "Presupuestos" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const label = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

export default async function Presupuestos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : monthBounds(todayISO()).month;
  const { from, to } = monthBounds(`${month}-01`);

  const supabase = await createClient();
  const [{ data: budgets }, { data: spent }, options] = await Promise.all([
    supabase.from("budgets").select("id, category_id, amount_cents, category:expense_categories(name)").eq("period_month", from),
    supabase.from("transactions").select("category_id, amount_cents").eq("type", "expense").eq("status", "confirmed").gte("occurred_on", from).lte("occurred_on", to),
    getFormOptions(),
  ]);
  const byCat = new Map<string, number>();
  for (const t of spent ?? []) if (t.category_id) byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount_cents);

  const rows = (budgets ?? []).map((b) => {
    const cat = Array.isArray(b.category) ? b.category[0] : b.category;
    return { ...b, name: (cat as { name: string } | null)?.name ?? "Categoría", s: budgetStatus(byCat.get(b.category_id) ?? 0, b.amount_cents), spent: byCat.get(b.category_id) ?? 0 };
  }).sort((a, b) => b.s.percent - a.s.percent);
  const total = rows.reduce((a, r) => a + r.amount_cents, 0);
  const totalSpent = rows.reduce((a, r) => a + r.spent, 0);
  const used = new Set(rows.map((r) => r.category_id));
  const free = options.categories.filter((c) => !used.has(c.id));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Link href={`/presupuestos?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="grid size-11 place-items-center rounded-full border border-line">‹</Link>
        <h1 className="text-lg font-bold capitalize">{label(month)}</h1>
        <Link href={`/presupuestos?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="grid size-11 place-items-center rounded-full border border-line">›</Link>
      </header>
      {rows.length > 0 && <Card><p className="text-sm text-muted">Gastado de lo presupuestado</p><p className="text-2xl font-bold tabular-nums">{formatMoney(totalSpent)} <span className="text-base font-normal text-muted">/ {formatMoney(total)}</span></p></Card>}
      {!rows.length && (
        <Card className="space-y-3 text-center"><p className="text-muted">No hay presupuestos para este mes.</p>
          <form action={copyBudgets}><input type="hidden" name="month" value={month} /><button className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">Copiar los del mes anterior</button></form></Card>
      )}
      {rows.map((r) => (
        <Card key={r.id} className="space-y-2">
          <div className="flex items-start justify-between gap-2"><p className="font-medium">{r.name}</p>
            <form action={deleteBudget}><input type="hidden" name="id" value={r.id} /><button aria-label={`Quitar presupuesto de ${r.name}`} className="text-sm text-muted">✕</button></form></div>
          <Progress percent={r.s.percent} level={r.s.level} label={`Gasto en ${r.name}`} />
          <div className="flex justify-between text-xs"><span className="text-muted">{formatMoney(r.spent)} de {formatMoney(r.amount_cents)}</span>
            <span className={r.s.level === "over" ? "font-semibold text-danger" : r.s.level === "warn" ? "font-semibold text-amber-600" : "text-muted"}>
              {r.s.level === "over" ? `Excedido por ${formatMoney(-r.s.remainingCents)}` : r.s.level === "warn" ? `Cuidado: ${r.s.percent}%` : `Quedan ${formatMoney(r.s.remainingCents)}`}</span></div>
        </Card>
      ))}
      {free.length > 0 && <Card><h2 className="mb-3 font-semibold">Agregar presupuesto</h2><BudgetForm month={month} categories={free} /></Card>}
    </div>
  );
}
