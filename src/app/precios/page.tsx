import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlanActions } from "@/components/plan-actions";
import { describeLimits, priceLabel, yearlySavingsPercent } from "@/lib/plans";

export const metadata = { title: "Planes y precios" };
export const revalidate = 0;

export default async function Precios() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: plans } = await supabase.from("plans").select("id, code, name, description, price_cents, interval, trial_days, limits, features").eq("active", true).order("sort_order");
  const [{ data: subs }, { data: trials }] = user ? await Promise.all([
    supabase.from("subscriptions").select("plan_id, status, current_period_end").in("status", ["active", "trialing", "past_due"]).gt("current_period_end", new Date().toISOString()),
    supabase.from("subscriptions").select("plan_id").not("trial_started_at", "is", null),
  ]) : [{ data: [] }, { data: [] }];
  const current = new Set((subs ?? []).map((s) => s.plan_id));
  const hadTrial = new Set((trials ?? []).map((s) => s.plan_id));
  const monthly = (plans ?? []).find((p) => p.interval === "month" && p.price_cents > 0);

  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 px-4 py-8">
      <header className="space-y-1 text-center"><h1 className="text-3xl font-bold">Planes y precios</h1><p className="text-muted">Empieza gratis. Mejora cuando lo necesites.</p></header>
      {(plans ?? []).map((p) => {
        const isFree = p.price_cents <= 0, mine = current.has(p.id) || (isFree && !(subs ?? []).length && !!user);
        const save = p.interval === "year" && monthly ? yearlySavingsPercent(monthly.price_cents, p.price_cents) : 0;
        const feats: string[] = Array.isArray(p.features) ? p.features : [];
        return (
          <section key={p.id} className={`space-y-3 rounded-2xl border bg-card p-5 ${mine ? "border-brand" : "border-line"}`}>
            <div className="flex items-start justify-between gap-2"><div><h2 className="text-xl font-bold">{p.name}</h2>{p.description && <p className="text-sm text-muted">{p.description}</p>}</div>
              {mine && <span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">Tu plan</span>}
              {!mine && save > 0 && <span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">Ahorras {save}%</span>}</div>
            <p className="text-3xl font-bold tabular-nums">{priceLabel(p.price_cents, p.interval)}</p>
            <ul className="space-y-1 text-sm">{[...feats, ...describeLimits(p.limits)].map((f) => <li key={f} className="flex gap-2"><span className="text-brand">✓</span><span>{f}</span></li>)}</ul>
            {isFree ? (mine ? null : <Link href={user ? "/inicio" : "/registro"} className="block rounded-xl border border-line py-3 text-center font-semibold">{user ? "Ir a la app" : "Empezar gratis"}</Link>)
              : mine ? <Link href="/cuenta/suscripcion" className="block rounded-xl border border-line py-3 text-center font-semibold">Administrar mi plan</Link>
              : user ? <PlanActions planCode={p.code} trialDays={p.trial_days} canTrial={!hadTrial.has(p.id)} />
              : <Link href={`/registro`} className="block rounded-xl bg-brand py-3 text-center font-semibold text-brand-fg">{p.trial_days > 0 ? `Crear cuenta y probar ${p.trial_days} días` : "Crear cuenta"}</Link>}
          </section>
        );
      })}
      <p className="text-center text-xs text-muted">Precios en pesos colombianos. Pagos seguros con Wompi. La prueba gratis no pide tarjeta.</p>
      <p className="flex justify-center gap-4 text-xs text-muted"><Link href="/privacidad" className="underline">Privacidad</Link><Link href="/terminos" className="underline">Términos</Link></p>
    </main>
  );
}
