import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_AI_LIMIT = 10; // si el plan no define límite, se aplica el del plan gratis

export function monthlyAiLimit(limits: unknown, fallback = DEFAULT_AI_LIMIT): number {
  const v = (limits as { ai_requests_month?: unknown } | null)?.ai_requests_month;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Límite mensual de IA del usuario según su plan vigente (activo o en prueba); sin suscripción, el del plan gratis. */
export async function aiQuota(db: SupabaseClient, userId: string, now = new Date()) {
  const { data: sub } = await db.from("subscriptions").select("plan:plans(limits)").eq("user_id", userId)
    .in("status", ["active", "trialing"]).or(`current_period_end.is.null,current_period_end.gt.${now.toISOString()}`)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let limits: unknown = (Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan)?.limits;
  if (!limits) { const { data: free } = await db.from("plans").select("limits").eq("code", "free").maybeSingle(); limits = free?.limits; }
  const limit = monthlyAiLimit(limits);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", start);
  const used = count ?? 0;
  return { used, limit, allowed: used < limit };
}

export async function recordAiUsage(db: SupabaseClient, userId: string, kind: string, inputTokens: number, outputTokens: number, model: string) {
  await db.from("ai_usage").insert({ user_id: userId, kind, input_tokens: inputTokens, output_tokens: outputTokens, model });
}
