import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Exige super_admin. Para el resto responde 404 (no revela que /admin existe). */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: p } = await supabase.from("profiles").select("role, disabled").eq("id", user.id).single();
  if (p?.role !== "super_admin" || p.disabled) notFound();
  return { supabase, user };
}
