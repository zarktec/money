import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/dates";
import { aiModel, extractTransactions, type AiClient } from "@/lib/ai/extract";
import { aiQuota, recordAiUsage } from "@/lib/ai/usage";
import type { MerchantRule } from "@/lib/imports/categorize";
import { decryptSecret, encryptSecret } from "./crypto";
import { GOOGLE_ENDPOINTS, GOOGLE_SCOPES, MICROSOFT_ENDPOINTS, MICROSOFT_SCOPES, refreshAccessToken, type OAuthConfig } from "./providers/oauth";
import { GmailProvider } from "./providers/gmail";
import { OutlookProvider } from "./providers/outlook";
import { ImapProvider } from "./providers/imap";
import { ProviderAuthError, type MailProvider } from "./providers/types";
import { syncMailbox, type SyncContext, type SyncStats } from "./sync";

export type OAuthProviderName = "google" | "microsoft";
export const DB_PROVIDER = { google: "gmail", microsoft: "outlook" } as const;

/** Credenciales OAuth de la app (variables de entorno). null si el proveedor no está configurado. */
export function oauthConfig(p: OAuthProviderName): OAuthConfig | null {
  const id = p === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
  const secret = p === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (!id || !secret || !app) return null;
  return { clientId: id, clientSecret: secret, redirectUri: `${app}/api/email/${p}/callback`, scopes: p === "google" ? GOOGLE_SCOPES : MICROSOFT_SCOPES, endpoints: p === "google" ? GOOGLE_ENDPOINTS : MICROSOFT_ENDPOINTS };
}

/** El secreto se ata a su dueño y cuenta: un blob copiado a otra fila no descifra. */
export const secretAad = (userId: string, email: string) => `email:${userId}:${email.toLowerCase()}`;
export const sealSecret = (userId: string, email: string, data: object) => encryptSecret(JSON.stringify(data), secretAad(userId, email));

interface ConnRow { id: string; user_id: string; provider: "gmail" | "outlook" | "imap"; email: string; secret_encrypted: string; default_account_id: string | null; last_sync_at: string | null; active: boolean }

async function buildProvider(c: ConnRow): Promise<MailProvider> {
  const secret = JSON.parse(decryptSecret(c.secret_encrypted, secretAad(c.user_id, c.email)));
  if (c.provider === "imap") return new ImapProvider(secret);
  const name: OAuthProviderName = c.provider === "gmail" ? "google" : "microsoft";
  const cfg = oauthConfig(name);
  if (!cfg) throw new Error(`${name} no está configurado`);
  try {
    const t = await refreshAccessToken(cfg, secret.refreshToken);
    return c.provider === "gmail" ? new GmailProvider(t.accessToken) : new OutlookProvider(t.accessToken);
  } catch (e) {
    if ((e as { revoked?: boolean }).revoked) throw new ProviderAuthError("Token revocado");
    throw e;
  }
}

export async function loadSyncContext(db: SupabaseClient, userId: string): Promise<SyncContext> {
  const [banks, platforms, accounts, cats, merchants] = await Promise.all([
    db.from("banks").select("id, sender_domains").eq("active", true),
    db.from("subscription_platforms").select("sender_domains").eq("active", true),
    db.from("accounts").select("id, bank_id").eq("user_id", userId).eq("archived", false),
    db.from("expense_categories").select("id, name").eq("active", true).or(`user_id.is.null,user_id.eq.${userId}`),
    db.from("merchants").select("match_pattern, category_id, user_id").or(`user_id.is.null,user_id.eq.${userId}`),
  ]);
  const known = [...(banks.data ?? []), ...(platforms.data ?? [])].flatMap((r: { sender_domains: string[] }) => r.sender_domains ?? []);
  return {
    today: todayISO(), knownDomains: [...new Set(known)],
    banks: (banks.data ?? []).map((b: { id: string; sender_domains: string[] }) => ({ id: b.id, sender_domains: b.sender_domains ?? [] })),
    accounts: accounts.data ?? [], categories: cats.data ?? [],
    rules: (merchants.data ?? []).map((m: { match_pattern: string; category_id: string | null; user_id: string | null }): MerchantRule => ({ pattern: m.match_pattern, categoryId: m.category_id, own: !!m.user_id })),
  };
}

/** Sincroniza una conexión. Usa service role: es una tarea del servidor que actúa en nombre del dueño ya verificado. */
export async function runSync(connectionId: string, opts: { maxList?: number; maxAi?: number; deadline?: number; db?: SupabaseClient } = {}): Promise<SyncStats | { skipped: string }> {
  const db = opts.db ?? createAdminClient();
  const { data: c } = await db.from("email_connections").select("id, user_id, provider, email, secret_encrypted, default_account_id, last_sync_at, active").eq("id", connectionId).maybeSingle();
  if (!c || !c.active) return { skipped: "inactiva" };
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: "IA no configurada" };

  let provider: MailProvider;
  try { provider = await buildProvider(c as ConnRow); }
  catch (e) {
    if (e instanceof ProviderAuthError) { await db.from("email_connections").update({ active: false, last_error: "Tu cuenta de correo necesita reconectarse." }).eq("id", c.id); return { skipped: "credencial revocada" }; }
    await db.from("email_connections").update({ last_error: "No se pudo conectar con el proveedor. Se reintentará." }).eq("id", c.id);
    throw e;
  }

  const client = new Anthropic() as unknown as AiClient;
  const ctx = await loadSyncContext(db, c.user_id);
  return syncMailbox({
    db, provider, now: new Date(),
    extract: (input) => extractTransactions(client, input),
    quota: {
      remaining: async () => { const q = await aiQuota(db, c.user_id); return Math.max(q.limit - q.used, 0); },
      record: (i, o) => recordAiUsage(db, c.user_id, "email", i, o, aiModel()),
    },
  }, c as ConnRow, ctx, { maxList: opts.maxList ?? 60, maxAi: opts.maxAi ?? 10, deadline: opts.deadline });
}
