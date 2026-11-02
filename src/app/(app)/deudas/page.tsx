import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { Progress } from "@/components/progress";
import { formatMoney } from "@/lib/finance/money";
import { monthsToPayOff } from "@/lib/finance/debts";

export const metadata = { title: "Deudas" };

export default async function Deudas() {
  const supabase = await createClient();
  const { data: debts } = await supabase.from("debts").select("id, name, principal_cents, balance_cents, annual_rate, installment_cents, next_due_date, active").order("active", { ascending: false }).order("balance_cents", { ascending: false });
  const live = (debts ?? []).filter((d) => d.active);
  const total = live.reduce((a, d) => a + Number(d.balance_cents), 0);
  const monthly = live.reduce((a, d) => a + Number(d.installment_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">Deudas</h1>
        <Link href="/deudas/nueva" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">+ Nueva</Link></header>
      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Total que debes</p><p className="font-semibold tabular-nums">{formatMoney(total)}</p></Card>
        <Card><p className="text-xs text-muted">Cuotas al mes</p><p className="font-semibold tabular-nums">{formatMoney(monthly)}</p></Card>
      </div>
      {live.length > 1 && <Link href="/deudas/simulador"><Card className="border-brand"><p className="font-semibold">Simulador de pago</p><p className="text-sm text-muted">Compara avalancha vs. bola de nieve y mira cuándo quedas libre.</p></Card></Link>}
      {!debts?.length && <p className="py-10 text-center text-muted">Registra tus préstamos y créditos para ver cuándo los terminas y cuánto pagas en intereses.</p>}
      {debts?.map((d) => {
        const paid = d.principal_cents > 0 ? Math.round(((Number(d.principal_cents) - Number(d.balance_cents)) / Number(d.principal_cents)) * 100) : 0;
        const plan = d.active && d.installment_cents ? monthsToPayOff(Number(d.balance_cents), Number(d.annual_rate ?? 0), Number(d.installment_cents)) : null;
        return (
          <Link key={d.id} href={`/deudas/${d.id}`}><Card className={`mb-3 space-y-2 ${d.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3"><p className="font-medium">{d.name}</p><p className="font-semibold tabular-nums">{formatMoney(Number(d.balance_cents))}</p></div>
            <Progress percent={Math.max(paid, 0)} label={`Pagado de ${d.name}`} />
            <p className="text-xs text-muted">
              {!d.active ? "Saldada" : plan?.neverPaid ? <span className="text-danger">La cuota no alcanza a cubrir los intereses</span>
                : plan ? `${paid}% pagado · faltan ${plan.months} cuotas` : `${paid}% pagado`}
            </p>
          </Card></Link>
        );
      })}
    </div>
  );
}
