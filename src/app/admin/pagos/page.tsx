import { requireAdmin } from "@/lib/admin/guard";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";

export const metadata = { title: "Pagos" };
const STATUS: Record<string, string> = { APPROVED: "Aprobado", PENDING: "En proceso", DECLINED: "Rechazado", VOIDED: "Anulado", ERROR: "Error" };
const COLOR: Record<string, string> = { APPROVED: "text-brand", DECLINED: "text-danger", ERROR: "text-danger", VOIDED: "text-muted", PENDING: "text-warn" };

export default async function Pagos() {
  const { supabase } = await requireAdmin();
  const [{ data: pays }, { data: subs }] = await Promise.all([
    supabase.from("payments").select("id, reference, amount_cents, status, payment_method, created_at, user_id").order("created_at", { ascending: false }).limit(100),
    supabase.from("subscriptions").select("status"),
  ]);
  const ids = [...new Set((pays ?? []).map((p) => p.user_id).filter(Boolean))];
  const { data: names } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((names ?? []).map((n) => [n.id, n.full_name]));
  const count = (s: string) => (subs ?? []).filter((x) => x.status === s).length;
  const approved = (pays ?? []).filter((p) => p.status === "APPROVED");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Pagos y suscripciones</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Activas", "active"], ["En prueba", "trialing"], ["En mora", "past_due"], ["Vencidas", "expired"]].map(([l, s]) => <Card key={s}><p className="text-xs text-muted">{l}</p><p className="text-2xl font-bold">{count(s)}</p></Card>)}
      </div>
      <Card><p className="text-sm text-muted">Cobrado en los últimos 100 pagos</p><p className="text-2xl font-bold tabular-nums">{formatMoney(approved.reduce((a, p) => a + Number(p.amount_cents), 0))}</p></Card>
      <section className="space-y-2">
        {!pays?.length && <p className="text-sm text-muted">Aún no hay pagos.</p>}
        {pays?.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{p.user_id ? name.get(p.user_id) || "(sin nombre)" : "(cuenta eliminada)"}</p>
              <p className="truncate text-xs text-muted">{new Date(p.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })} · {p.payment_method ?? "—"} · {p.reference}</p></div>
            <div className="text-right"><p className="font-semibold tabular-nums">{formatMoney(Number(p.amount_cents))}</p><p className={`text-xs ${COLOR[p.status] ?? ""}`}>{STATUS[p.status] ?? p.status}</p></div>
          </Card>))}
      </section>
    </div>
  );
}
