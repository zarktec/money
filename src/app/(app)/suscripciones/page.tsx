import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { detectDuplicateCharges, detectRecurring, type ChargeLite } from "@/lib/email/subscriptions";
import { addDaysISO, todayISO } from "@/lib/dates";
import { createRuleFromCandidate } from "../actions-email";

export const metadata = { title: "Suscripciones detectadas" };
const CADENCE = { weekly: "cada semana", monthly: "cada mes", annual: "cada año" } as const;
const PER_MONTH = { weekly: 52 / 12, monthly: 1, annual: 1 / 12 } as const;

export default async function Suscripciones() {
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: txs }, { data: rules }] = await Promise.all([
    supabase.from("transactions").select("id, amount_cents, occurred_on, description, merchant, account_id, category_id").eq("type", "expense").eq("status", "confirmed").gte("occurred_on", addDaysISO(today, -400)).limit(3000),
    supabase.from("recurring_rules").select("name").eq("active", true),
  ]);
  const charges: (ChargeLite & { accountId: string | null; categoryId: string | null })[] = (txs ?? []).map((t) => ({ id: t.id, amountCents: Number(t.amount_cents), date: t.occurred_on, merchant: t.merchant, description: t.description, accountId: t.account_id, categoryId: t.category_id }));
  const byId = new Map(charges.map((c) => [c.id, c]));
  const cands = detectRecurring(charges, (rules ?? []).map((r) => r.name));
  const dups = detectDuplicateCharges(charges.filter((c) => c.date >= addDaysISO(today, -45)));
  const monthly = cands.reduce((a, c) => a + c.amountCents * PER_MONTH[c.cadence], 0);

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Suscripciones detectadas</h1><p className="text-sm text-muted">Cobros que se repiten en tus movimientos y que aún no registraste como fijo.</p></header>
      {cands.length > 0 && <Card className="bg-brand text-brand-fg"><p className="text-sm opacity-80">Estas suscripciones suman aprox.</p><p className="text-3xl font-bold tabular-nums">{formatMoney(Math.round(monthly))}<span className="text-base font-normal"> / mes</span></p></Card>}
      {!cands.length && <p className="py-8 text-center text-muted">No encontramos cobros recurrentes nuevos. Aparecen cuando un comercio te cobra el mismo valor al menos 3 veces seguidas con ritmo regular.</p>}

      {cands.map((c) => {
        const last = byId.get(c.lastId);
        return (
          <Card key={c.key} className="space-y-2">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="text-xs text-muted">{CADENCE[c.cadence]} · {c.occurrences} cobros · próximo ~{c.nextDate}</p></div>
              <p className="font-semibold tabular-nums">{formatMoney(c.amountCents)}</p></div>
            {c.priceChange && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">⚠️ Subió de {formatMoney(c.priceChange.fromCents)} a {formatMoney(c.priceChange.toCents)}.</p>}
            {last?.accountId && (
              <form action={createRuleFromCandidate}>
                <input type="hidden" name="name" value={c.name} /><input type="hidden" name="amount_cents" value={c.amountCents} /><input type="hidden" name="cadence" value={c.cadence} />
                <input type="hidden" name="next_date" value={c.nextDate} /><input type="hidden" name="account_id" value={last.accountId} /><input type="hidden" name="category_id" value={last.categoryId ?? ""} />
                <button className="h-10 w-full rounded-lg border border-brand text-sm font-semibold text-brand">Agregar a mis fijos</button>
              </form>)}
          </Card>
        );
      })}

      {dups.length > 0 && <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Posibles cobros duplicados (últimos 45 días)</h2>
        {dups.map((d) => <Card key={d.name + d.dates[0]} className="border-amber-400 p-3"><p className="font-medium">{d.name}</p><p className="text-sm text-muted">{formatMoney(d.amountCents)} cobrado en {d.dates.join(" y ")}. Si no fue intencional, pide el reembolso.</p></Card>)}</section>}
    </div>
  );
}
