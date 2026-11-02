import { requireAdmin } from "@/lib/admin/guard";
import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignPlan, setUserDisabled } from "./actions";

/** Correos desde auth.users (solo con service role; si no está configurada, se omiten). */
async function emailsById(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return m;
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of data?.users ?? []) if (u.email) m.set(u.id, u.email);
  } catch { /* sin correos */ }
  return m;
}

export default async function Usuarios() {
  const { supabase } = await requireAdmin();
  const [{ data: users }, { data: plans }, emails] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, disabled, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("plans").select("id, code, name, interval").order("sort_order"),
    emailsById(),
  ]);
  const ids = (users ?? []).map((u) => u.id);
  const { data: subs } = ids.length
    ? await supabase.from("subscriptions").select("user_id, plan_id, status, current_period_end, created_at").in("user_id", ids).in("status", ["active", "trialing", "past_due"]).order("created_at", { ascending: false })
    : { data: [] };
  const now = Date.now();
  const current = new Map<string, { plan_id: string; end: string | null }>();
  for (const s of subs ?? []) if (!current.has(s.user_id) && s.current_period_end && Date.parse(s.current_period_end) > now) current.set(s.user_id, { plan_id: s.plan_id, end: s.current_period_end });
  const free = plans?.find((p) => p.code === "free");
  const planName = (id?: string) => plans?.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-2">
      <h1 className="mb-3 text-xl font-bold">Usuarios</h1>
      {users?.map((u) => {
        const cur = current.get(u.id);
        return (
          <Card key={u.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.full_name || "(sin nombre)"}</p>
                {emails.get(u.id) && <p className="truncate text-xs text-muted">{emails.get(u.id)}</p>}
                <p className="text-xs text-muted">{u.role} · {new Date(u.created_at).toLocaleDateString("es-CO")}{u.disabled && " · bloqueado"}</p>
                <p className="mt-1 text-sm">Plan: <b>{cur ? planName(cur.plan_id) : planName(free?.id)}</b>
                  {cur?.end && <span className="text-xs text-muted"> · vence {new Date(cur.end).toLocaleDateString("es-CO")}</span>}</p>
              </div>
              <form action={setUserDisabled}>
                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="disabled" value={String(!u.disabled)} />
                <button className="rounded-lg border border-line px-3 py-2 text-sm">{u.disabled ? "Reactivar" : "Bloquear"}</button>
              </form>
            </div>
            <form action={assignPlan} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="user_id" value={u.id} />
              <select name="plan_id" defaultValue={cur?.plan_id ?? free?.id} className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select name="duration" defaultValue="month" className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
                <option value="month">1 mes</option><option value="year">1 año</option><option value="forever">Sin vencimiento</option>
              </select>
              <button className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg">Cambiar plan</button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
