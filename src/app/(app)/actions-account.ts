"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/email/crypto";
import { secretAad } from "@/lib/email/service";
import type { FormState } from "@/lib/forms/schemas";

/**
 * Derecho de supresión (Ley 1581). Exige escribir el correo de la cuenta. Borra el usuario de Auth y, por las claves foráneas,
 * todos sus datos; los pagos se conservan anonimizados por obligación contable (lo hace la base de datos).
 * Antes revoca el acceso a Gmail para que no quede un permiso vivo en Google.
 */
export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const typed = String(fd.get("confirm") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) return { error: "Escribe tu correo exactamente como aparece para confirmar." };

  const admin = createAdminClient();
  const { data: conns } = await admin.from("email_connections").select("provider, email, secret_encrypted").eq("user_id", user.id);
  for (const c of conns ?? []) {
    if (c.provider !== "gmail") continue;
    try {
      const token = JSON.parse(decryptSecret(c.secret_encrypted, secretAad(user.id, c.email))).refreshToken as string;
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
    } catch { /* si no se pudo revocar, el usuario puede hacerlo desde su cuenta de Google */ }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "No se pudo eliminar la cuenta. Inténtalo de nuevo o escríbenos." };
  await supabase.auth.signOut().catch(() => {});
  redirect("/?cuenta=eliminada");
}
