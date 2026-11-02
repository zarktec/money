import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/email/crypto";
import { integrationAad, maskSecret, providerDef, type ProviderId } from "./registry";

export type Resolved = Record<string, string | undefined>;
export type Source = "panel" | "env" | "default" | "none";
export interface FieldState { key: string; label: string; secret: boolean; source: Source; preview?: string; error?: string; help?: string; placeholder?: string }
export interface Described { values: Resolved; fields: FieldState[]; tableReady: boolean; ready: boolean }

type Env = Record<string, string | undefined>;
interface Row { provider: string; key: string; value: string; is_secret: boolean }

/**
 * Valor efectivo de cada campo: el del panel si existe; si no, la variable de entorno; si no, el valor por defecto.
 * Si la tabla aún no existe (migración sin ejecutar) o un secreto no se puede descifrar, se usa la variable de entorno: nada se cae.
 */
export async function resolveIntegration(db: SupabaseClient, provider: ProviderId, env: Env = process.env): Promise<Described> {
  const def = providerDef(provider)!;
  const { data, error } = await db.from("integration_settings").select("provider, key, value, is_secret").eq("provider", provider);
  const rows = new Map(((error ? [] : data) as Row[] ?? []).map((r) => [r.key, r]));
  const values: Resolved = {};
  const fields: FieldState[] = def.fields.map((f) => {
    const base = { key: f.key, label: f.label, secret: f.secret, help: f.help, placeholder: f.placeholder };
    const row = rows.get(f.key);
    let fail: string | undefined;
    if (row) {
      try {
        const v = row.is_secret ? decryptSecret(row.value, integrationAad(provider, f.key)) : row.value;
        values[f.key] = v;
        return { ...base, source: "panel" as const, preview: f.secret ? maskSecret(v) : v };
      } catch { fail = "No se pudo descifrar el valor guardado (¿cambió TOKEN_ENCRYPTION_KEY?). Vuelve a guardarlo."; }
    }
    const fromEnv = env[f.env]?.trim();
    if (fromEnv) { values[f.key] = fromEnv; return { ...base, source: "env" as const, preview: f.secret ? maskSecret(fromEnv) : fromEnv, error: fail }; }
    if (f.default) { values[f.key] = f.default; return { ...base, source: "default" as const, preview: f.default, error: fail }; }
    return { ...base, source: "none" as const, error: fail };
  });
  return { values, fields, tableReady: !error, ready: def.required.every((k) => !!values[k]) };
}

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; values: Resolved }>();
export const clearIntegrationCache = () => cache.clear();

/** Credenciales de una integración para usarlas en el servidor (con una caché corta: se consulta en cada pago o conexión). */
export async function getIntegration(provider: ProviderId): Promise<Resolved> {
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;
  let values: Resolved;
  try { values = (await resolveIntegration(createAdminClient(), provider)).values; }
  catch {
    // Sin service role o sin base: solo variables de entorno.
    values = {};
    for (const f of providerDef(provider)!.fields) { const v = process.env[f.env]?.trim() ?? f.default; if (v) values[f.key] = v; }
  }
  cache.set(provider, { at: Date.now(), values });
  return values;
}

export class IntegrationError extends Error {}

/** Guarda los campos que traen valor (vacío = no cambiar). Valida cada uno y cifra los secretos. */
export async function saveIntegration(db: SupabaseClient, provider: ProviderId, input: Record<string, string>, actorId: string, key?: string): Promise<string[]> {
  const def = providerDef(provider);
  if (!def) throw new IntegrationError("Integración desconocida.");
  const rows: (Row & { updated_by: string; updated_at: string })[] = [];
  for (const f of def.fields) {
    const v = (input[f.key] ?? "").trim();
    if (!v) continue;
    if (v.length > 2000) throw new IntegrationError(`${f.label}: valor demasiado largo.`);
    const bad = f.validate?.(v);
    if (bad) throw new IntegrationError(bad);
    let stored = v;
    if (f.secret) {
      try { stored = encryptSecret(v, integrationAad(provider, f.key), key ? Buffer.from(key, "base64") : undefined); }
      catch (e) { throw new IntegrationError(e instanceof Error && /TOKEN_ENCRYPTION_KEY/.test(e.message) ? "Falta TOKEN_ENCRYPTION_KEY en Vercel: sin ella no se pueden guardar secretos." : "No se pudo cifrar el secreto."); }
    }
    rows.push({ provider, key: f.key, value: stored, is_secret: f.secret, updated_by: actorId, updated_at: new Date().toISOString() });
  }
  if (!rows.length) return [];
  const { error } = await db.from("integration_settings").upsert(rows, { onConflict: "provider,key" });
  if (error) throw new IntegrationError(/relation|does not exist|schema cache/i.test(error.message) ? "Falta ejecutar la migración 0010_integration_settings.sql en Supabase." : "No se pudo guardar.");
  clearIntegrationCache();
  return rows.map((r) => r.key);
}

/** Quita el valor del panel: el campo vuelve a usar la variable de entorno (si existe). */
export async function clearIntegrationField(db: SupabaseClient, provider: ProviderId, fieldKey: string): Promise<void> {
  const def = providerDef(provider);
  if (!def?.fields.some((f) => f.key === fieldKey)) throw new IntegrationError("Campo desconocido.");
  await db.from("integration_settings").delete().eq("provider", provider).eq("key", fieldKey);
  clearIntegrationCache();
}
