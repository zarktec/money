import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Límites del plan vigente: solo cuenta una suscripción activa, en prueba o en mora (cobro rechazado dentro de un periodo ya pagado)
 * con fecha de fin FUTURA. Un checkout sin pagar (pending)
 * o una suscripción vencida no dan derechos; sin suscripción vigente aplican los del plan gratis. Refleja plan_limit() de la base de datos.
 */
export async function getPlanLimits(db: SupabaseClient, userId: string, now = new Date()): Promise<Record<string, unknown>> {
  const { data: sub } = await db.from("subscriptions").select("plan:plans(limits)").eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"]).gt("current_period_end", now.toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let limits: unknown = (Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan)?.limits;
  if (!limits) { const { data: free } = await db.from("plans").select("limits").eq("code", "free").maybeSingle(); limits = free?.limits; }
  return (limits && typeof limits === "object" ? limits : {}) as Record<string, unknown>;
}

export const numericLimit = (limits: Record<string, unknown>, key: string, fallback: number): number => {
  const v = limits[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
};
