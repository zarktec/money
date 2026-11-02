import { Card } from "@/components/ui";
import { AssetForm } from "@/components/insight-forms";
import { formatMoney } from "@/lib/finance/money";
import { netWorth } from "@/lib/finance/networth";
import { loadSnapshot } from "@/lib/insights";
import { ASSET_KINDS } from "@/lib/forms/schemas";
import { deleteAsset } from "../actions-insights";

export const metadata = { title: "Patrimonio" };

export default async function Patrimonio() {
  const s = await loadSnapshot();
  const n = netWorth({ accountBalances: s.accounts.map((a) => ({ balanceCents: a.balanceCents })), assets: s.assets, debts: s.debts });
  const row = (label: string, v: number, neg = false) => <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><span className={`tabular-nums ${neg ? "text-danger" : ""}`}>{neg ? "−" : ""}{formatMoney(v)}</span></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Patrimonio</h1>
      <Card className={n.netCents < 0 ? "bg-danger text-white" : "bg-brand text-brand-fg"}>
        <p className="text-sm opacity-80">Patrimonio neto</p><p className="mt-1 text-4xl font-bold tabular-nums">{formatMoney(n.netCents)}</p>
        <p className="mt-2 text-xs opacity-80">Lo que tienes menos lo que debes</p>
      </Card>
      <Card className="space-y-2"><div className="flex justify-between font-semibold"><span>Activos</span><span className="tabular-nums">{formatMoney(n.assetsCents)}</span></div>
        {row("Cuentas y efectivo", n.accountAssets)}{row("Bienes registrados", n.manualAssets)}</Card>
      <Card className="space-y-2"><div className="flex justify-between font-semibold"><span>Pasivos</span><span className="tabular-nums">{formatMoney(n.liabilitiesCents)}</span></div>
        {row("Deudas", n.debts)}{row("Tarjetas y cuentas en rojo", n.accountLiabilities)}
        <p className="pt-1 text-xs text-muted">Registra cada obligación en un solo lado: las tarjetas como cuenta con saldo negativo, los préstamos en «Deudas».</p></Card>

      <Card><h2 className="mb-3 font-semibold">Agregar un bien</h2><AssetForm /></Card>
      <section className="space-y-2">{s.assets.map((a) => (
        <Card key={a.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="text-xs text-muted">{ASSET_KINDS[a.kind]}</p></div>
          <p className="font-semibold tabular-nums">{formatMoney(a.valueCents)}</p>
          <form action={deleteAsset}><input type="hidden" name="id" value={a.id} /><button aria-label={`Eliminar ${a.name}`} className="grid size-10 place-items-center text-muted">🗑</button></form>
        </Card>))}</section>
    </div>
  );
}
