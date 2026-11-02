"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";

export async function setUserDisabled(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(fd.get("id")); const disabled = fd.get("disabled") === "true";
  if (id === user.id) return; // un admin no puede bloquearse a sí mismo
  await supabase.from("profiles").update({ disabled }).eq("id", id);
  await supabase.from("audit_log").insert({ actor_id: user.id, action: disabled ? "user.disable" : "user.enable", entity: "profiles", entity_id: id });
  revalidatePath("/admin/usuarios");
}
