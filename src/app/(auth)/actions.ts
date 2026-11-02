"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { appUrl } from "@/lib/app-url";

/** `email` y `name` se devuelven para rellenar de nuevo el formulario: React 19 lo vacía después de cada acción y el usuario no debe reescribir todo tras un error. */
export interface AuthState { error?: string; info?: string; email?: string; name?: string }

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(fd.get("email") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(fd.get("password") ?? "") });
  if (error) return { error: "Correo o contraseña incorrectos", email };
  redirect(safeNext(fd.get("next")));
}

export async function register(_: AuthState, fd: FormData): Promise<AuthState> {
  const password = String(fd.get("password") ?? "");
  const keep = { email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? "") };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres", ...keep };
  if (fd.get("consent") !== "on") return { error: "Debes aceptar los términos y el tratamiento de datos personales (Ley 1581 de 2012)", ...keep };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(fd.get("email")), password,
    options: { data: { full_name: String(fd.get("name") ?? "") }, emailRedirectTo: `${await appUrl()}/auth/callback` },
  });
  if (error) return { error: error.message, ...keep };
  if (data.user) await supabase.from("profiles").update({ data_consent_at: new Date().toISOString() }).eq("id", data.user.id);
  if (!data.session) return { info: "Revisa tu correo para confirmar la cuenta." };
  redirect("/inicio");
}

/**
 * Pide el enlace para crear una contraseña nueva. SIEMPRE responde lo mismo, exista o no el correo: así nadie puede usar este
 * formulario para averiguar quién tiene cuenta. El enlace vuelve a /auth/callback y de ahí a /cuenta/clave.
 */
export async function requestPasswordReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Escribe un correo válido.", email };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await appUrl()}/auth/callback?next=${encodeURIComponent("/cuenta/clave")}` }).catch(() => {});
  return { info: "Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam. Si no llega en unos minutos, espera un poco antes de pedirlo otra vez." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
