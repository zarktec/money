import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, fetchAccountEmail, verifyState } from "@/lib/email/providers/oauth";
import { DB_PROVIDER, oauthConfig, sealSecret, type OAuthProviderName } from "@/lib/email/service";

export const runtime = "nodejs";
const back = (req: Request, msg: string, ok = false) => {
  const res = NextResponse.redirect(new URL(ok ? "/correo?conectado=1" : `/correo?error=${encodeURIComponent(msg)}`, req.url));
  res.cookies.delete({ name: "em_oauth", path: "/api/email" });   // el nonce es de un solo uso
  return res;
};

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return NextResponse.json({ error: "Proveedor inválido" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, "No autorizaste el acceso al correo.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/correo", req.url));

  const cfg = oauthConfig(provider as OAuthProviderName), secret = process.env.OAUTH_STATE_SECRET;
  if (!cfg || !secret) return back(req, "Esta conexión aún no está configurada.");

  let cookie: { nonce?: string; accountId?: string } = {};
  try { cookie = JSON.parse((await cookies()).get("em_oauth")?.value ?? "{}"); } catch { /* cookie corrupta */ }
  const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code");
  if (!code || !verifyState(state, cookie.nonce, { userId: user.id, provider }, secret)) return back(req, "La solicitud de conexión no es válida o venció. Inténtalo de nuevo.");

  const { data: acc } = await supabase.from("accounts").select("id").eq("id", cookie.accountId ?? "").maybeSingle();
  if (!acc) return back(req, "La cuenta elegida ya no existe.");

  try {
    const tokens = await exchangeCode(cfg, code);
    if (!tokens.refreshToken) return back(req, "El proveedor no entregó permiso permanente. Revoca el acceso de Money en tu cuenta e inténtalo de nuevo.");
    const email = await fetchAccountEmail(cfg, tokens.accessToken);
    if (!email) return back(req, "No se pudo leer el correo de la cuenta.");
    const db = createAdminClient();
    const { error } = await db.from("email_connections").upsert({
      user_id: user.id, provider: DB_PROVIDER[provider], email, secret_encrypted: sealSecret(user.id, email, { refreshToken: tokens.refreshToken }),
      default_account_id: acc.id, active: true, last_error: null, last_sync_at: null,
    }, { onConflict: "user_id,email" });
    if (error) return back(req, "No se pudo guardar la conexión.");
    return back(req, "", true);
  } catch { return back(req, "No se pudo completar la conexión. Inténtalo de nuevo."); }
}
