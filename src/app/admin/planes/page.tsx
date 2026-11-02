import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { LimitInput } from "@/components/limit-input";
import { LIMIT_FIELDS, UNLIMITED, priceLabel } from "@/lib/plans";
import { savePlan } from "./actions";

export const metadata = { title: "Planes" };
const INTERVAL: Record<string, string> = { month: "Mensual", year: "Anual", lifetime: "Pago único" };

export default async function Planes({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; plan?: string }> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const { data: plans } = await supabase.from("plans").select("*").order("sort_order");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-bold lg:text-2xl">Planes</h1><p className="text-sm text-muted">Lo que cambies aquí se refleja en la página de precios y en los límites de los usuarios.</p></div>
        <Link href="/precios" className="text-sm font-semibold text-brand hover:underline">Ver página de precios →</Link>
      </div>
      {sp.ok && <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">Plan guardado.</p>}
      {sp.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{sp.error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {plans?.map((p) => {
          const limits = (p.limits && typeof p.limits === "object" ? p.limits : {}) as Record<string, unknown>;
          const feats: string[] = Array.isArray(p.features) ? p.features.filter((f: unknown): f is string => typeof f === "string") : [];
          return (
            <Card key={p.id} className="space-y-5" id={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold">{p.name}</h2><p className="text-sm text-muted">{priceLabel(p.price_cents, p.interval)} · {INTERVAL[p.interval] ?? p.interval}</p></div>
                <div className="flex flex-col items-end gap-1"><Badge tone={p.active ? "good" : "neutral"}>{p.active ? "Visible" : "Oculto"}</Badge><span className="text-[11px] text-muted">código: {p.code}</span></div>
              </div>
              <form action={savePlan} className="space-y-5">
                <input type="hidden" name="id" value={p.id} />

                <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Datos del plan</legend>
                  <div><Label>Nombre</Label><Input name="name" defaultValue={p.name} required maxLength={60} /></div>
                  <div><Label>Descripción corta</Label><Input name="description" defaultValue={p.description ?? ""} maxLength={200} placeholder="Una frase que explique para quién es" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Precio (COP)</Label><Input name="price" inputMode="numeric" defaultValue={Math.round(p.price_cents / 100)} required />
                      <p className="mt-1 text-xs text-muted">{p.interval === "year" ? "Por año" : p.interval === "lifetime" ? "Pago único" : "Por mes"}. 0 = gratis.</p></div>
                    <div><Label>Días de prueba gratis</Label><Input name="trial_days" type="number" min={0} max={365} step={1} inputMode="numeric" defaultValue={p.trial_days} />
                      <p className="mt-1 text-xs text-muted">0 = sin prueba.</p></div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Qué puede usar el usuario</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {LIMIT_FIELDS.map((f) => {
                      const v = limits[f.key];
                      const unlimited = typeof v === "number" && v >= UNLIMITED;
                      return <LimitInput key={f.key} name={f.key} label={f.label} hint={f.hint} value={typeof v === "number" && v >= 0 ? v : 0} unlimited={unlimited} />;
                    })}
                  </div>
                </fieldset>

                <fieldset className="space-y-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Beneficios en la página de precios</legend>
                  <textarea name="features" rows={5} defaultValue={feats.join("\n")} className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" placeholder={"Un beneficio por línea\nLectura de correo con IA"} />
                  <p className="text-xs text-muted">Uno por línea (máximo 12). Los límites de arriba se muestran solos debajo de esta lista.</p>
                </fieldset>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="size-5" /> Visible en la página de precios</label>
                  <label className="flex items-center gap-2 text-sm text-muted">Orden <input name="sort_order" type="number" min={0} max={999} defaultValue={p.sort_order} className="h-9 w-16 rounded-lg border border-line bg-card px-2 text-center" /></label>
                </div>
                <Button className="w-full">Guardar {p.name}</Button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
