import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Prueba gratis sin tarjeta: una sola vez por usuario y plan (la base de datos lo garantiza con un índice único). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado", 401);
  const { planCode } = (await req.json().catch(() => ({}))) as { planCode?: string };
  if (!planCode) return fail("planCode requerido", 400);

  const { data: plan } = await supabase.from("plans").select("id, trial_days, price_cents, active").eq("code", planCode).maybeSingle();
  if (!plan || !plan.active || plan.price_cents <= 0 || plan.trial_days <= 0) return fail("Este plan no tiene prueba gratis", 400);

  // Quien ya tiene un plan de pago vigente no necesita una prueba.
  const { data: vigente } = await supabase.from("subscriptions").select("id").in("status", ["active", "trialing", "past_due"]).gt("current_period_end", new Date().toISOString()).limit(1).maybeSingle();
  if (vigente) return fail("Ya tienes un plan activo.", 409);

  const now = new Date();
  const { error } = await createAdminClient().from("subscriptions").insert({
    user_id: user.id, plan_id: plan.id, status: "trialing", trial_started_at: now.toISOString(),
    current_period_start: now.toISOString(), current_period_end: addDays(now, plan.trial_days).toISOString(),
  });
  if (error) return fail(error.code === "23505" ? "Ya usaste la prueba gratis de este plan." : "No se pudo activar la prueba.", error.code === "23505" ? 409 : 500);
  return NextResponse.json({ ok: true });
}
