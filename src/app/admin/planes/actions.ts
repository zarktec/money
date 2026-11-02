"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { parsePlanForm } from "@/lib/plan-form";

export async function savePlan(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const { data: current } = await supabase.from("plans").select("id, limits").eq("id", id).maybeSingle();
  if (!current) redirect("/admin/planes?error=" + encodeURIComponent("El plan no existe."));
  const r = parsePlanForm(fd, current.limits);
  if (!r.ok) redirect(`/admin/planes?error=${encodeURIComponent(r.error)}&plan=${id}`);
  const { error } = await supabase.from("plans").update({
    name: r.value.name, description: r.value.description, price_cents: r.value.price_cents, trial_days: r.value.trial_days, active: r.value.active,
    sort_order: r.value.sort_order, limits: r.value.limits as never, features: r.value.features as never,
  }).eq("id", id);
  if (error) redirect(`/admin/planes?error=${encodeURIComponent("No se pudo guardar el plan.")}&plan=${id}`);
  await supabase.from("audit_log").insert({ actor_id: user.id, action: "plan.update", entity: "plans", entity_id: id });
  revalidatePath("/admin/planes"); revalidatePath("/precios");
  redirect(`/admin/planes?ok=${id}`);
}
