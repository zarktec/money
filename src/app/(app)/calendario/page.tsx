import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { upcomingEvents, type RuleLite } from "@/lib/finance/planning";
import { addDaysISO, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { payRule, skipRule } from "../actions-planning";

export const metadata = { title: "Calendario" };
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayLabel = (iso: string, today: string) => {
  if (iso === today) return "Hoy";
  if (iso === addDaysISO(today, 1)) return "Mañana";
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export default async function Calendario() {
  const today = todayISO();
  const supabase = await createClient();
  const { data: rules } = await supabase.from("recurring_rules")
    .select("id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active").eq("active", true);
  const events = upcomingEvents((rules ?? []) as RuleLite[], today, addDaysISO(today, 45), 4);
  const groups = new Map<string, typeof events>();
  for (const e of events) { const k = e.overdue ? "overdue" : e.date; groups.set(k, [...(groups.get(k) ?? []), e]); }
  const next = (id: string) => rules?.find((r) => r.id === id)?.next_date;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calendario</h1>
      <p className="text-sm text-muted">Lo que vence en los próximos 45 días.</p>
      {!events.length && <p className="py-10 text-center text-muted">No hay vencimientos próximos. Agrega tus fijos en «Fijos y recurrentes».</p>}
      {[...groups.entries()].map(([k, items]) => (
        <section key={k} className="space-y-2">
          <h2 className={cn("text-xs font-semibold uppercase", k === "overdue" ? "text-danger" : "text-muted")}>{k === "overdue" ? "Vencidos" : dayLabel(k, today)}</h2>
          {items.map((e) => {
            // Solo el vencimiento actual de cada regla se puede pagar; los futuros son informativos.
            const payable = e.date === next(e.ruleId) && e.date <= addDaysISO(today, 7);
            return (
              <Card key={`${e.ruleId}:${e.date}`} className={cn("space-y-2 p-3", e.overdue && "border-danger")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-medium">{e.name}</p>
                    <p className="text-xs text-muted">{e.type === "income" ? "Ingreso" : "Egreso"}{e.estimate && " · valor aproximado"}{e.overdue && ` · venció el ${e.date}`}</p></div>
                  <p className={cn("font-semibold tabular-nums", e.type === "income" && "text-brand")}>{formatMoney(e.amountCents)}</p>
                </div>
                {payable && (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={payRule} className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="id" value={e.ruleId} /><input type="hidden" name="due" value={e.date} />
                      {e.estimate && <input name="amount" inputMode="decimal" placeholder="Valor real" aria-label="Valor real" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-sm" />}
                      <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">{e.type === "income" ? "Ya llegó" : "Pagado"}</button>
                    </form>
                    <form action={skipRule}><input type="hidden" name="id" value={e.ruleId} /><input type="hidden" name="due" value={e.date} /><button className="h-10 rounded-lg px-3 text-sm text-muted">Omitir</button></form>
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
