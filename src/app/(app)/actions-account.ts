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

/** Cambio de contraseña (también es el destino del enlace de recuperación). Al cambiarla se cierran las demás sesiones abiertas. */
export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const password = String(fd.get("password") ?? ""), confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password.length > 72) return { error: "La contraseña no puede superar los 72 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same|different|igual/i.test(error.message)) return { error: "La nueva contraseña debe ser distinta de la actual." };
    if (/weak|short|characters/i.test(error.message)) return { error: "Esa contraseña es muy débil. Usa una más larga y variada." };
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }
  await supabase.auth.signOut({ scope: "others" }).catch(() => {});
  return { ok: true };
}
