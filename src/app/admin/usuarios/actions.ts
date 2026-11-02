"use server";
import { revalidatePath } from "next/cache";
import { addMonths, addYears } from "date-fns";
import { requireAdmin } from "@/lib/admin/guard";

export async function setUserDisabled(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(fd.get("id")); const disabled = fd.get("disabled") === "true";
  if (id === user.id) return; // un admin no puede bloquearse a sí mismo
  await supabase.from("profiles").update({ disabled }).eq("id", id);
  await supabase.from("audit_log").insert({ actor_id: user.id, action: disabled ? "user.disable" : "user.enable", entity: "profiles", entity_id: id });
  revalidatePath("/admin/usuarios");
}

const DURATIONS = { month: (d: Date) => addMonths(d, 1), year: (d: Date) => addYears(d, 1), forever: (d: Date) => addYears(d, 100) } as const;

/**
 * Cambia el plan de un usuario a mano (cortesía, soporte, pruebas). Cierra sus suscripciones vigentes y, si el plan no es el gratuito,
 * crea una activa con la duración elegida. Sin tarjeta guardada, así que no se renueva sola: al vencer vuelve al plan gratuito.
 */
export async function assignPlan(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const userId = String(fd.get("user_id")); const planId = String(fd.get("plan_id"));
  const dur = String(fd.get("duration")) as keyof typeof DURATIONS;
  if (!userId || !planId || !(dur in DURATIONS)) return;
  const { data: plan } = await supabase.from("plans").select("id, code").eq("id", planId).single();
  if (!plan) return;
  const now = new Date();
  await supabase.from("subscriptions").update({ status: "canceled", cancel_at_period_end: false })
    .eq("user_id", userId).in("status", ["active", "trialing", "past_due", "pending"]);
  if (plan.code !== "free") {
    await supabase.from("subscriptions").insert({
      user_id: userId, plan_id: plan.id, status: "active",
      current_period_start: now.toISOString(), current_period_end: DURATIONS[dur](now).toISOString(),
    });
  }
  await supabase.from("audit_log").insert({ actor_id: user.id, action: "user.plan_change", entity: "profiles", entity_id: userId, meta: { plan: plan.code, duration: dur } } as never);
  revalidatePath("/admin/usuarios");
}
