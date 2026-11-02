import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthEndpoints { authorize: string; token: string; userinfo: string }
export interface OAuthConfig { clientId: string; clientSecret: string; redirectUri: string; scopes: string[]; endpoints: OAuthEndpoints }

export const GOOGLE_ENDPOINTS: OAuthEndpoints = { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", userinfo: "https://openidconnect.googleapis.com/v1/userinfo" };
export const MICROSOFT_ENDPOINTS: OAuthEndpoints = { authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", userinfo: "https://graph.microsoft.com/v1.0/me" };
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];
export const MICROSOFT_SCOPES = ["offline_access", "Mail.Read", "User.Read"];

/**
 * `state` firmado: ata el flujo OAuth al usuario y a un nonce guardado en cookie, y vence en 10 minutos.
 * Así un atacante no puede hacer que la cuenta de correo de OTRA persona se conecte a la cuenta de la víctima (CSRF de login).
 */
export function makeState(userId: string, provider: string, secret: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const body = `${userId}.${provider}.${nonce}.${now}`;
  return { state: `${body}.${sign(body, secret)}`, nonce };
}

export function verifyState(state: string, nonceCookie: string | undefined, expect: { userId: string; provider: string }, secret: string, now = Date.now()): boolean {
  const parts = state.split(".");
  if (parts.length !== 5) return false;
  const [userId, provider, nonce, ts, sig] = parts;
  const good = sign(`${userId}.${provider}.${nonce}.${ts}`, secret);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return userId === expect.userId && provider === expect.provider && !!nonceCookie && nonce === nonceCookie && now - Number(ts) < 10 * 60_000 && now >= Number(ts);
}
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");

export function authorizeUrl(c: OAuthConfig, state: string, extra: Record<string, string> = {}): string {
  const u = new URL(c.endpoints.authorize);
  u.searchParams.set("client_id", c.clientId); u.searchParams.set("redirect_uri", c.redirectUri); u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", c.scopes.join(" ")); u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

export interface TokenSet { accessToken: string; refreshToken: string | null; expiresIn: number }
async function tokenRequest(c: OAuthConfig, params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(c.endpoints.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) { const e = new Error(j.error ?? `token ${res.status}`) as Error & { revoked?: boolean }; e.revoked = j.error === "invalid_grant"; throw e; }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresIn: j.expires_in ?? 3600 };
}
export const exchangeCode = (c: OAuthConfig, code: string) => tokenRequest(c, { grant_type: "authorization_code", code, redirect_uri: c.redirectUri });
export const refreshAccessToken = (c: OAuthConfig, refreshToken: string) => tokenRequest(c, { grant_type: "refresh_token", refresh_token: refreshToken });

/** Correo de la cuenta conectada (Google: userinfo.email; Microsoft: mail o userPrincipalName). */
export async function fetchAccountEmail(c: OAuthConfig, accessToken: string): Promise<string | null> {
  const res = await fetch(c.endpoints.userinfo, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string; mail?: string; userPrincipalName?: string };
  return (j.email ?? j.mail ?? j.userPrincipalName ?? null)?.toLowerCase() ?? null;
}
