import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Correo al que enviar los avisos de la app, o null si el usuario los apagó, está bloqueado o no se puede resolver. */
export async function emailFor(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data: p } = await db.from("profiles").select("email_notifications, disabled").eq("id", userId).maybeSingle();
    if (!p || p.disabled || p.email_notifications === false) return null;
    const { data } = await db.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch { return null; }
}
