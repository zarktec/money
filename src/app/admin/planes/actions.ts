"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";

export async function savePlan(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(fd.get("id"));
  const price = Math.round(Number(fd.get("price")) * 100);
  if (!Number.isFinite(price) || price < 0) return;
  let limits: unknown;
  try { limits = JSON.parse(String(fd.get("limits") || "{}")); } catch { return; }
  await supabase.from("plans").update({
    name: String(fd.get("name")), price_cents: price, trial_days: Number(fd.get("trial_days") || 0),
    active: fd.get("active") === "on", limits: limits as never,
  }).eq("id", id);
  await supabase.from("audit_log").insert({ actor_id: user.id, action: "plan.update", entity: "plans", entity_id: id });
  revalidatePath("/admin/planes");
}
