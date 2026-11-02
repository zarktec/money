import { requireAdmin } from "@/lib/admin/guard";
import { Card, Button, Input, Label } from "@/components/ui";
import { savePlan } from "./actions";

export default async function Planes() {
  const { supabase } = await requireAdmin();
  const { data: plans } = await supabase.from("plans").select("*").order("sort_order");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Planes</h1>
      {plans?.map((p) => (
        <Card key={p.id}>
          <form action={savePlan} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <p className="text-xs text-muted">código: {p.code} · {p.interval}</p>
            <div><Label>Nombre</Label><Input name="name" defaultValue={p.name} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Precio (COP)</Label><Input name="price" type="number" min={0} step={1} defaultValue={p.price_cents / 100} inputMode="numeric" /></div>
              <div><Label>Días de prueba</Label><Input name="trial_days" type="number" min={0} defaultValue={p.trial_days} /></div>
            </div>
            <div><Label>Límites (JSON)</Label><Input name="limits" defaultValue={JSON.stringify(p.limits)} className="font-mono text-sm" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="size-5" /> Activo</label>
            <Button className="w-full">Guardar</Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
