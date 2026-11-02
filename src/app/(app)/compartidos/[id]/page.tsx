import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SettlementForm, SharedExpenseForm } from "@/components/shared-forms";
import { formatMoney } from "@/lib/finance/money";
import { computeBalances, simplifyDebts } from "@/lib/shared/split";
import { getFormOptions } from "@/lib/options";
import { todayISO } from "@/lib/dates";
import { archiveGroup, deleteSettlement, deleteSharedExpense } from "../../actions-shared";

export const metadata = { title: "Grupo" };

export default async function Grupo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: g } = await supabase.from("shared_groups").select("id, name").eq("id", id).maybeSingle();
  if (!g) notFound();
  const [{ data: members }, { data: exps }, { data: splits }, { data: setts }, o] = await Promise.all([
    supabase.from("shared_members").select("id, name, is_me").eq("group_id", id).order("is_me", { ascending: false }).order("created_at"),
    supabase.from("shared_expenses").select("id, description, amount_cents, paid_by, expense_date").eq("group_id", id).order("expense_date", { ascending: false }).limit(100),
    supabase.from("shared_splits").select("expense_id, member_id, share_cents").eq("group_id", id),
    supabase.from("shared_settlements").select("id, from_member, to_member, amount_cents, settled_on").eq("group_id", id).order("settled_on", { ascending: false }).limit(50),
    getFormOptions(),
  ]);
  const ms = (members ?? []) as { id: string; name: string; is_me: boolean }[];
  const name = (mid: string) => ms.find((m) => m.id === mid)?.name ?? "?";
  const expenses = (exps ?? []).map((e) => ({ paidBy: e.paid_by as string, amountCents: Number(e.amount_cents), shares: Object.fromEntries((splits ?? []).filter((s) => s.expense_id === e.id).map((s) => [s.member_id as string, Number(s.share_cents)])) }));
  const settlements = (setts ?? []).map((s) => ({ from: s.from_member as string, to: s.to_member as string, amountCents: Number(s.amount_cents) }));
  const balances = computeBalances(ms.map((m) => m.id), expenses, settlements);
  const plan = simplifyDebts(balances);
  const today = todayISO();

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">{g.name}</h1><p className="text-sm text-muted">{ms.map((m) => m.name).join(" · ")}</p></header>

      <Card className="space-y-2"><h2 className="font-semibold">Cómo van las cuentas</h2>
        {ms.map((m) => { const b = balances[m.id] ?? 0; return <div key={m.id} className="flex justify-between text-sm"><span>{m.name}</span><span className={`tabular-nums ${b < 0 ? "text-danger" : b > 0 ? "text-brand" : "text-muted"}`}>{b === 0 ? "al día" : b > 0 ? `le deben ${formatMoney(b)}` : `debe ${formatMoney(-b)}`}</span></div>; })}
      </Card>

      {plan.length > 0 && <Card className="space-y-2 border-brand"><h2 className="font-semibold">Para dejar todo en cero</h2>
        {plan.map((t) => <p key={t.from + t.to} className="text-sm"><strong>{name(t.from)}</strong> le paga <strong className="tabular-nums">{formatMoney(t.amountCents)}</strong> a <strong>{name(t.to)}</strong></p>)}
        <p className="text-xs text-muted">Son los pagos mínimos necesarios. Cuando lo hagan, regístralo abajo.</p></Card>}
      {!plan.length && expenses.length > 0 && <p className="rounded-xl bg-brand/10 px-3 py-2 text-center text-sm text-brand">Todo está saldado 🎉</p>}

      <Card><h2 className="mb-3 font-semibold">Agregar un gasto</h2>
        <SharedExpenseForm groupId={id} members={ms} accounts={o.accounts} categories={o.categories} today={today} /></Card>

      <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Gastos</h2>
        {!exps?.length && <p className="text-sm text-muted">Aún no hay gastos.</p>}
        {exps?.map((e) => (
          <Card key={e.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="truncate font-medium">{e.description}</p><p className="text-xs text-muted">{e.expense_date} · pagó {name(e.paid_by)}</p></div>
            <p className="font-semibold tabular-nums">{formatMoney(Number(e.amount_cents))}</p>
            <form action={deleteSharedExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="group_id" value={id} /><button aria-label={`Eliminar ${e.description}`} className="grid size-10 place-items-center text-muted">🗑</button></form>
          </Card>))}</section>

      <Card><h2 className="mb-3 font-semibold">Registrar un pago entre ustedes</h2><SettlementForm groupId={id} members={ms} today={today} defaults={plan[0] ? { from: plan[0].from, to: plan[0].to, amount: String(plan[0].amountCents / 100) } : undefined} /></Card>
      {!!setts?.length && <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Pagos registrados</h2>
        {setts.map((s) => (<Card key={s.id} className="flex items-center justify-between gap-3 p-3"><p className="text-sm">{name(s.from_member)} → {name(s.to_member)} <span className="text-xs text-muted">· {s.settled_on}</span></p>
          <p className="font-semibold tabular-nums">{formatMoney(Number(s.amount_cents))}</p>
          <form action={deleteSettlement}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="group_id" value={id} /><button aria-label="Eliminar pago" className="grid size-10 place-items-center text-muted">🗑</button></form></Card>))}</section>}

      <form action={archiveGroup}><input type="hidden" name="id" value={id} /><button className="rounded-lg px-3 py-2 text-sm text-danger">Archivar grupo</button></form>
    </div>
  );
}
