import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { integritySignature, newReference } from "@/lib/wompi";
import { getIntegration } from "@/lib/integrations/store";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { planCode } = (await req.json().catch(() => ({}))) as { planCode?: string };
  if (!planCode) return NextResponse.json({ error: "planCode requerido" }, { status: 400 });

  // El precio SIEMPRE se lee del servidor; nunca se confía en el cliente.
  const { data: plan } = await supabase.from("plans").select("id, code, price_cents, currency, active").eq("code", planCode).single();
  if (!plan || !plan.active || plan.price_cents <= 0) return NextResponse.json({ error: "Plan no disponible" }, { status: 400 });

  const wompi = await getIntegration("wompi");
  if (!wompi.public_key || !wompi.integrity_secret) return NextResponse.json({ error: "El cobro aún no está configurado." }, { status: 503 });

  const reference = newReference(user.id, plan.code);
  const admin = createAdminClient();
  // Renovación: si ya tiene una suscripción vigente de ESTE plan, el pago se asocia a ella y el webhook suma el nuevo periodo al final
  // del actual (no se pierden días). Si no, se usa (o crea) una suscripción 'pending': checkout sin pagar, que nunca da derechos.
  const { data: vigente } = await admin.from("subscriptions").select("id").eq("user_id", user.id).eq("plan_id", plan.id)
    .in("status", ["active", "trialing", "past_due"]).gt("current_period_end", new Date().toISOString()).limit(1).maybeSingle();
  const { data: existing } = vigente ? { data: null } : await admin.from("subscriptions").select("id").eq("user_id", user.id).eq("plan_id", plan.id).eq("status", "pending").limit(1).maybeSingle();
  const sub = vigente ?? existing ?? (await admin.from("subscriptions").insert({ user_id: user.id, plan_id: plan.id, status: "pending" }).select("id").single()).data;
  const { error } = await admin.from("payments").insert({
    user_id: user.id, subscription_id: sub?.id, reference, amount_cents: plan.price_cents, currency: plan.currency, status: "PENDING",
  });
  if (error) return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 500 });

  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", wompi.public_key);
  url.searchParams.set("currency", plan.currency);
  url.searchParams.set("amount-in-cents", String(plan.price_cents));
  url.searchParams.set("reference", reference);
  url.searchParams.set("signature:integrity", integritySignature(reference, plan.price_cents, plan.currency, wompi.integrity_secret));
  url.searchParams.set("redirect-url", `${process.env.NEXT_PUBLIC_APP_URL}/cuenta/suscripcion?ref=${reference}`);
  if (user.email) url.searchParams.set("customer-data:email", user.email);
  return NextResponse.json({ url: url.toString(), reference });
}
