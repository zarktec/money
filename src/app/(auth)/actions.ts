"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState { error?: string; info?: string }

const safeNext = (n: FormDataEntryValue | null) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/inicio");

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) return { error: "Correo o contraseña incorrectos" };
  redirect(safeNext(fd.get("next")));
}

export async function register(_: AuthState, fd: FormData): Promise<AuthState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres" };
  if (fd.get("consent") !== "on") return { error: "Debes aceptar el tratamiento de datos personales (Ley 1581 de 2012)" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(fd.get("email")), password,
    options: { data: { full_name: String(fd.get("name") ?? "") }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (data.user) await supabase.from("profiles").update({ data_consent_at: new Date().toISOString() }).eq("id", data.user.id);
  if (!data.session) return { info: "Revisa tu correo para confirmar la cuenta." };
  redirect("/inicio");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
