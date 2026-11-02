import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, numericLimit } from "@/lib/plan-limits";
import { authorizeUrl, makeState } from "@/lib/email/providers/oauth";
import { oauthConfig, type OAuthProviderName } from "@/lib/email/service";

export const runtime = "nodejs";
const back = (req: Request, msg: string) => NextResponse.redirect(new URL(`/correo?error=${encodeURIComponent(msg)}`, req.url));

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return NextResponse.json({ error: "Proveedor inválido" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/correo", req.url));

  const cfg = await oauthConfig(provider as OAuthProviderName);
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!cfg || !secret) return back(req, "Esta conexión aún no está configurada.");

  const accountId = new URL(req.url).searchParams.get("account_id") ?? "";
  const { data: acc } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!acc) return back(req, "Elige la cuenta donde se registrarán los movimientos.");

  const limits = await getPlanLimits(createAdminClient(), user.id);
  const { count } = await supabase.from("email_connections").select("id", { count: "exact", head: true }).eq("active", true);
  if ((count ?? 0) >= numericLimit(limits, "email_connections", 0)) return back(req, "Tu plan no incluye más cuentas de correo. Mejora tu plan para conectarlas.");

  const { state, nonce } = makeState(user.id, provider, secret);
  const extra: Record<string, string> = provider === "google" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { prompt: "select_account", response_mode: "query" };
  const res = NextResponse.redirect(authorizeUrl(cfg, state, extra));
  // La cuenta destino y el nonce viajan en una cookie HttpOnly atada a esta redirección; el state firmado la liga al usuario.
  res.cookies.set("em_oauth", JSON.stringify({ nonce, accountId }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/email", maxAge: 600 });
  return res;
}
