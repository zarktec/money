import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanLimits } from "@/lib/plan-limits";

export const DEFAULT_AI_LIMIT = 10; // si el plan no define límite, se aplica el del plan gratis

export function monthlyAiLimit(limits: unknown, fallback = DEFAULT_AI_LIMIT): number {
  const v = (limits as { ai_requests_month?: unknown } | null)?.ai_requests_month;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Límite mensual de IA del usuario según su plan vigente; sin suscripción, el del plan gratis. */
export async function aiQuota(db: SupabaseClient, userId: string, now = new Date()) {
  const limits = await getPlanLimits(db, userId, now);
  const limit = monthlyAiLimit(limits);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", start);
  const used = count ?? 0;
  return { used, limit, allowed: used < limit };
}

export async function recordAiUsage(db: SupabaseClient, userId: string, kind: string, inputTokens: number, outputTokens: number, model: string) {
  await db.from("ai_usage").insert({ user_id: userId, kind, input_tokens: inputTokens, output_tokens: outputTokens, model });
}
