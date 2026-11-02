import { requireAdmin } from "@/lib/admin/guard";
import { Card } from "@/components/ui";
import { setUserDisabled } from "./actions";

export default async function Usuarios() {
  const { supabase } = await requireAdmin();
  const { data: users } = await supabase.from("profiles").select("id, full_name, role, disabled, created_at").order("created_at", { ascending: false }).limit(200);
  return (
    <div className="space-y-2">
      <h1 className="mb-3 text-xl font-bold">Usuarios</h1>
      {users?.map((u) => (
        <Card key={u.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate font-medium">{u.full_name || "(sin nombre)"}</p>
            <p className="text-xs text-muted">{u.role} · {new Date(u.created_at).toLocaleDateString("es-CO")}{u.disabled && " · bloqueado"}</p></div>
          <form action={setUserDisabled}>
            <input type="hidden" name="id" value={u.id} /><input type="hidden" name="disabled" value={String(!u.disabled)} />
            <button className="rounded-lg border border-line px-3 py-2 text-sm">{u.disabled ? "Reactivar" : "Bloquear"}</button>
          </form>
        </Card>
      ))}
    </div>
  );
}
