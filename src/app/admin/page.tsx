import { requireAdmin } from "@/lib/admin/guard";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [users, active, rev] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("payments").select("amount_cents").eq("status", "APPROVED").gte("created_at", since),
  ]);
  const revenue = (rev.data ?? []).reduce((a, p) => a + p.amount_cents, 0);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card><p className="text-sm text-muted">Usuarios</p><p className="text-3xl font-bold">{users.count ?? 0}</p></Card>
      <Card><p className="text-sm text-muted">Suscripciones activas</p><p className="text-3xl font-bold">{active.count ?? 0}</p></Card>
      <Card><p className="text-sm text-muted">Ingresos 30 días</p><p className="text-3xl font-bold">{formatMoney(revenue)}</p></Card>
    </div>
  );
}
