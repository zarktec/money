"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function ownSub(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // La lectura pasa por RLS: solo existe si es del usuario.
  const { data } = await supabase.from("subscriptions").select("id, status").eq("id", id).maybeSingle();
  return data;
}
const refresh = () => ["/cuenta/suscripcion", "/precios", "/inicio"].forEach((p) => revalidatePath(p));

/** Cancelar = no renovar: conserva los beneficios hasta el final del periodo ya pagado. */
export async function cancelAtPeriodEnd(fd: FormData) {
  const s = await ownSub(String(fd.get("id")));
  if (!s || !["active", "trialing", "past_due"].includes(s.status)) return;
  await createAdminClient().from("subscriptions").update({ cancel_at_period_end: true }).eq("id", s.id);
  refresh();
}

export async function resumeSubscription(fd: FormData) {
  const s = await ownSub(String(fd.get("id")));
  if (!s) return;
  await createAdminClient().from("subscriptions").update({ cancel_at_period_end: false }).eq("id", s.id);
  refresh();
}
