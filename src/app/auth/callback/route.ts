import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Destino de los enlaces del correo (confirmar cuenta, recuperar contraseña). El código se canjea por una sesión; si falla, se avisa. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const expired = NextResponse.redirect(`${origin}/login?error=enlace`);
  if (!code) return expired;
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return expired;
  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"))}`);
}
