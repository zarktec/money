import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError, type ExtractInput } from "@/lib/ai/extract";
import { toDrafts, type Extraction } from "@/lib/ai/schema";
import { categorizeByMerchants, type MerchantRule } from "@/lib/imports/categorize";
import { hashAll } from "@/lib/imports/dedupe";
import { findDuplicate } from "./duplicates";
import { isKnownSender, senderDomain, shouldProcessEmail } from "./filter";
import { ProviderAuthError, type MailProvider } from "./providers/types";

export interface SyncConnection { id: string; user_id: string; email: string; default_account_id: string | null; last_sync_at: string | null }
export interface SyncContext {
  today: string;
  knownDomains: string[];
  banks: { id: string; sender_domains: string[] }[];
  accounts: { id: string; bank_id: string | null }[];
  categories: { id: string; name: string }[];
  rules: MerchantRule[];
}
export interface SyncDeps {
  db: SupabaseClient;
  provider: MailProvider;
  extract: (i: ExtractInput) => Promise<{ extraction: Extraction; inputTokens: number; outputTokens: number }>;
  /** Cuántas llamadas de IA le quedan al usuario este mes, y cómo registrar el consumo. */
  quota: { remaining: () => Promise<number>; record: (inputTokens: number, outputTokens: number) => Promise<void> };
  now: Date;
}
export interface SyncOptions { maxList: number; maxAi: number; deadline?: number }
export interface SyncStats { listed: number; alreadyLogged: number; ignored: number; processed: number; created: number; duplicates: number; errors: number; quotaExhausted: boolean; incomplete: boolean; authError: boolean }

export const FIRST_SYNC_DAYS = 14;
export const MAX_LOOKBACK_DAYS = 30;
export const MIN_CONFIDENCE = 0.5;
const DAY = 86_400_000;

/** Desde cuándo leer: un día antes de la última sincronización (solapamiento de seguridad), nunca más de 30 días atrás. */
export function syncSince(lastSyncAt: string | null, now: Date): Date {
  const floor = now.getTime() - MAX_LOOKBACK_DAYS * DAY;
  const t = lastSyncAt ? Date.parse(lastSyncAt) - DAY : now.getTime() - FIRST_SYNC_DAYS * DAY;
  return new Date(Math.max(t, floor));
}

/** Cuenta destino: la del banco que envía el correo, si el usuario tiene una; si no, la predeterminada de la conexión. */
export function pickAccount(from: string, banks: SyncContext["banks"], accounts: SyncContext["accounts"], defaultAccountId: string | null): string | null {
  const domain = senderDomain(from);
  const bank = banks.find((b) => isKnownSender(domain, b.sender_domains));
  const byBank = bank ? accounts.find((a) => a.bank_id === bank.id) : undefined;
  return byBank?.id ?? defaultAccountId;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function syncMailbox(deps: SyncDeps, conn: SyncConnection, ctx: SyncContext, opts: SyncOptions): Promise<SyncStats> {
  const { db, provider } = deps;
  const stats: SyncStats = { listed: 0, alreadyLogged: 0, ignored: 0, processed: 0, created: 0, duplicates: 0, errors: 0, quotaExhausted: false, incomplete: false, authError: false };
  const log: { user_id: string; connection_id: string; message_id: string; sender: string; subject: string; received_at: string; outcome: string; transaction_id?: string | null; confidence?: number | null }[] = [];
  const base = (m: { id: string; from: string; subject: string; receivedAt: string }, outcome: string, extra: object = {}) =>
    log.push({ user_id: conn.user_id, connection_id: conn.id, message_id: m.id, sender: clip(m.from, 200), subject: clip(m.subject, 200), received_at: m.receivedAt, outcome, ...extra });

  try {
    const metas = await provider.list(syncSince(conn.last_sync_at, deps.now), opts.maxList);
    stats.listed = metas.length;
    const { data: seen } = metas.length ? await db.from("email_ingest_log").select("message_id").eq("user_id", conn.user_id).in("message_id", metas.map((m) => m.id)) : { data: [] };
    const done = new Set((seen ?? []).map((r: { message_id: string }) => r.message_id));
    let aiLeft = Math.min(opts.maxAi, await deps.quota.remaining());

    for (const m of metas) {
      if (done.has(m.id)) { stats.alreadyLogged++; continue; }
      const decision = shouldProcessEmail(m, ctx.knownDomains);
      if (!decision.process) { stats.ignored++; base(m, "ignored"); continue; }
      if (aiLeft <= 0 || (opts.deadline && Date.now() > opts.deadline)) { stats.incomplete = true; stats.quotaExhausted ||= aiLeft <= 0; continue; } // sin registrar: se reintenta luego

      stats.processed++;
      try {
        const full = await provider.read(m.id);
        const r = await deps.extract({ mode: "email", from: full.from, subject: full.subject, body: full.body, today: full.receivedAt.slice(0, 10), categories: ctx.categories.map((c) => c.name) });
        aiLeft--;
        await deps.quota.record(r.inputTokens, r.outputTokens);
        const drafts = toDrafts(r.extraction, { today: ctx.today, categories: ctx.categories }).rows.filter((d) => d.confidence === null || d.confidence >= MIN_CONFIDENCE);
        if (!drafts.length) { base(m, "ignored"); stats.ignored++; stats.processed--; continue; }

        const accountId = pickAccount(full.from, ctx.banks, ctx.accounts, conn.default_account_id);
        if (!accountId) { stats.errors++; base(m, "error"); continue; }

        const dates = drafts.map((d) => d.date).sort();
        const lo = new Date(Date.parse(dates[0]) - DAY).toISOString().slice(0, 10), hi = new Date(Date.parse(dates[dates.length - 1]) + DAY).toISOString().slice(0, 10);
        const { data: existing } = await db.from("transactions").select("id, type, amount_cents, occurred_on, description, merchant").eq("user_id", conn.user_id).gte("occurred_on", lo).lte("occurred_on", hi);
        const pool = (existing ?? []).map((t: { id: string; type: string; amount_cents: number; occurred_on: string; description: string | null; merchant: string | null }) => ({ id: t.id, type: t.type, amountCents: t.amount_cents, date: t.occurred_on, description: t.description, merchant: t.merchant }));

        const fresh = drafts.filter((d) => { const dup = findDuplicate({ type: d.type, amountCents: d.amountCents, date: d.date, description: d.description }, pool); if (dup) stats.duplicates++; else pool.push({ id: "new", type: d.type, amountCents: d.amountCents, date: d.date, description: d.description, merchant: null }); return !dup; });
        if (!fresh.length) { base(m, "duplicate"); continue; }

        const hashes = hashAll(fresh.map((d) => ({ accountId, date: d.date, type: d.type, amountCents: d.amountCents, description: d.description })));
        const rows = fresh.map((d, i) => ({
          user_id: conn.user_id, type: d.type, amount_cents: d.amountCents, occurred_on: d.date, description: d.description, notes: clip(`Correo de ${full.from} — ${full.subject}`, 300),
          account_id: accountId, category_id: d.type === "expense" ? d.categoryId ?? categorizeByMerchants(d.description, ctx.rules) : null,
          source: "email", status: "pending_review", external_id: `email:${m.id}:${i}`, dedupe_hash: hashes[i],
        }));
        const { data: ins, error } = await db.from("transactions").insert(rows).select("id");
        if (error) { stats.errors++; base(m, "error"); continue; }
        stats.created += rows.length;
        base(m, "extracted", { transaction_id: ins?.[0]?.id ?? null, confidence: Math.max(...fresh.map((d) => d.confidence ?? 0)) });
      } catch (e) {
        if (e instanceof ProviderAuthError) throw e;
        if (e instanceof AiError) { stats.errors++; base(m, "error"); continue; }     // contenido que la IA no pudo leer: se anota y se sigue
        throw e;                                                                         // error transitorio (red, límite): se corta la corrida y se reintenta
      }
    }
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      stats.authError = true;
      await db.from("email_connections").update({ active: false, last_error: "Tu cuenta de correo necesita reconectarse." }).eq("id", conn.id);
    } else {
      await flush(db, log);
      await db.from("email_connections").update({ last_error: "No se pudo sincronizar. Se reintentará automáticamente.", last_stats: stats }).eq("id", conn.id);
      throw e;
    }
  } finally { await provider.close?.(); }

  await flush(db, log);
  if (!stats.authError) {
    // Si quedó trabajo pendiente (cuota o tiempo) NO se avanza la fecha: el próximo ciclo vuelve a mirar esa ventana.
    await db.from("email_connections").update({ ...(stats.incomplete ? {} : { last_sync_at: deps.now.toISOString() }), last_error: stats.quotaExhausted ? "Llegaste al límite mensual de análisis con IA." : null, last_stats: stats }).eq("id", conn.id);
  }
  return stats;
}

async function flush(db: SupabaseClient, log: object[]) {
  if (log.length) await db.from("email_ingest_log").upsert(log, { onConflict: "user_id,message_id", ignoreDuplicates: true });
}
