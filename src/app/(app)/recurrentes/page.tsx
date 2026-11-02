import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { monthlyEquivalent, monthlyProvision, type Frequency } from "@/lib/finance/recurrence";
import { FREQUENCY_LABELS } from "@/lib/forms/schemas";
import { deleteRule, toggleRule } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fijos y recurrentes" };

export default async function Recurrentes() {
  const supabase = await createClient();
  const { data: rules } = await supabase.from("recurring_rules").select("*").order("next_date");
  const active = (rules ?? []).filter((r) => r.active);
  const monthly = (t: string) => active.filter((r) => r.type === t).reduce((a, r) => a + monthlyEquivalent(r.amount_cents, r.frequency as Frequency), 0);
  const provisions = active.filter((r) => r.type === "expense").reduce((a, r) => a + monthlyProvision(r.amount_cents, r.frequency as Frequency), 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Fijos</h1>
        <Link href="/recurrentes/nueva" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nuevo</Link></header>
      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Ingresos fijos / mes</p><p className="font-semibold tabular-nums">{formatMoney(monthly("income"))}</p></Card>
        <Card><p className="text-xs text-muted">Egresos fijos / mes</p><p className="font-semibold tabular-nums">{formatMoney(monthly("expense"))}</p></Card>
      </div>
      {provisions > 0 && <Card className="border-brand text-sm">Provisiones para pagos no mensuales: <strong>{formatMoney(provisions)}</strong> cada mes.</Card>}
      {!rules?.length && <p className="py-10 text-center text-muted">Agrega arriendo, servicios, suscripciones o tu salario para que la app los tenga en cuenta.</p>}
      {rules?.map((r) => (
        <Card key={r.id} className={cn("space-y-2", !r.active && "opacity-60")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-medium">{r.name}</p>
              <p className="text-xs text-muted">{FREQUENCY_LABELS[r.frequency as keyof typeof FREQUENCY_LABELS] ?? r.frequency} · próximo {r.next_date}{r.amount_is_estimate && " · aprox."}</p></div>
            <p className={cn("font-semibold tabular-nums", r.type === "income" ? "text-brand" : "")}>{formatMoney(r.amount_cents)}</p>
          </div>
          {r.type === "expense" && monthlyProvision(r.amount_cents, r.frequency as Frequency) > 0 &&
            <p className="text-xs text-brand">Aparta {formatMoney(monthlyProvision(r.amount_cents, r.frequency as Frequency))} / mes</p>}
          <div className="flex gap-2">
            <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={String(!r.active)} />
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm">{r.active ? "Pausar" : "Reanudar"}</button></form>
            <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="rounded-lg px-3 py-1.5 text-sm text-danger">Eliminar</button></form>
          </div>
        </Card>
      ))}
    </div>
  );
}
