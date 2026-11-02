import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { ACCOUNT_TYPES } from "@/components/simple-forms";
import { archiveAccount } from "../actions";

export const metadata = { title: "Cuentas" };

export default async function Cuentas() {
  const supabase = await createClient();
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from("accounts").select("id, name, type").eq("archived", false).order("created_at"),
    supabase.from("account_balances").select("account_id, balance_cents"),
  ]);
  const bal = new Map((balances ?? []).map((b) => [b.account_id, Number(b.balance_cents)]));
  const total = (accounts ?? []).reduce((a, x) => a + (bal.get(x.id) ?? 0), 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Cuentas</h1>
        <Link href="/cuentas/nueva" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nueva</Link></header>
      <Card><p className="text-sm text-muted">Saldo total</p><p className="text-3xl font-bold tabular-nums">{formatMoney(total)}</p></Card>
      {accounts?.map((a) => (
        <Card key={a.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="text-xs text-muted">{ACCOUNT_TYPES[a.type]}</p></div>
          <p className={`font-semibold tabular-nums ${(bal.get(a.id) ?? 0) < 0 ? "text-danger" : ""}`}>{formatMoney(bal.get(a.id) ?? 0)}</p>
          <form action={archiveAccount}><input type="hidden" name="id" value={a.id} /><button aria-label="Archivar cuenta" className="grid size-10 place-items-center rounded-full text-muted">🗄</button></form>
        </Card>
      ))}
    </div>
  );
}
