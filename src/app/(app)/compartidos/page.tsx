import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { computeBalances } from "@/lib/shared/split";

export const metadata = { title: "Gastos compartidos" };

export default async function Compartidos() {
  const supabase = await createClient();
  const [{ data: groups }, { data: members }, { data: exps }, { data: splits }, { data: setts }] = await Promise.all([
    supabase.from("shared_groups").select("id, name").eq("archived", false).order("created_at", { ascending: false }),
    supabase.from("shared_members").select("id, group_id, is_me"),
    supabase.from("shared_expenses").select("id, group_id, paid_by, amount_cents"),
    supabase.from("shared_splits").select("expense_id, member_id, share_cents"),
    supabase.from("shared_settlements").select("group_id, from_member, to_member, amount_cents"),
  ]);
  const rows = (groups ?? []).map((g) => {
    const ms = (members ?? []).filter((m) => m.group_id === g.id), me = ms.find((m) => m.is_me)?.id ?? "";
    const gExp = (exps ?? []).filter((e) => e.group_id === g.id).map((e) => ({ paidBy: e.paid_by as string, amountCents: Number(e.amount_cents), shares: Object.fromEntries((splits ?? []).filter((s) => s.expense_id === e.id).map((s) => [s.member_id as string, Number(s.share_cents)])) }));
    const gSet = (setts ?? []).filter((s) => s.group_id === g.id).map((s) => ({ from: s.from_member as string, to: s.to_member as string, amountCents: Number(s.amount_cents) }));
    return { ...g, mine: computeBalances(ms.map((m) => m.id as string), gExp, gSet)[me] ?? 0 };
  });
  const net = rows.reduce((a, r) => a + r.mine, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Gastos compartidos</h1>
        <Link href="/compartidos/nuevo" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nuevo</Link></header>
      {rows.length > 0 && <Card className={net < 0 ? "border-danger" : "border-brand"}><p className="text-sm text-muted">{net < 0 ? "En total debes" : "En total te deben"}</p><p className={`text-3xl font-bold tabular-nums ${net < 0 ? "text-danger" : "text-brand"}`}>{formatMoney(Math.abs(net))}</p></Card>}
      {!rows.length && <p className="py-10 text-center text-muted">Crea un grupo para un viaje, el apartamento o un asado y lleva la cuenta de quién le debe a quién.</p>}
      {rows.map((g) => (
        <Link key={g.id} href={`/compartidos/${g.id}`}><Card className="mb-3 flex items-center justify-between gap-3"><p className="font-medium">{g.name}</p>
          <p className={`text-sm font-semibold tabular-nums ${g.mine < 0 ? "text-danger" : g.mine > 0 ? "text-brand" : "text-muted"}`}>{g.mine === 0 ? "Al día" : g.mine > 0 ? `Te deben ${formatMoney(g.mine)}` : `Debes ${formatMoney(-g.mine)}`}</p></Card></Link>
      ))}
    </div>
  );
}
