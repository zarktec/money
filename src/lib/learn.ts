import type { SupabaseClient } from "@supabase/supabase-js";
import { merchantKey } from "@/lib/email/subscriptions";

/**
 * Aprendizaje: cuando el usuario confirma un movimiento detectado automáticamente con una categoría, se recuerda esa
 * categoría para ese comercio y la próxima vez se aplica sola (sin gastar IA). La regla del usuario pesa más que las globales.
 */
export async function learnMerchantRule(supabase: SupabaseClient, userId: string, description: string | null, categoryId: string | null): Promise<void> {
  if (!description || !categoryId) return;
  const key = merchantKey({ description });
  if (key.length < 4 || key.length > 40) return;           // claves muy cortas o larguísimas darían falsos positivos
  const { data: existing } = await supabase.from("merchants").select("id, category_id").eq("user_id", userId).eq("match_pattern", key).maybeSingle();
  if (existing) { if (existing.category_id !== categoryId) await supabase.from("merchants").update({ category_id: categoryId }).eq("id", existing.id); return; }
  await supabase.from("merchants").insert({ user_id: userId, name: description.slice(0, 60), match_pattern: key, category_id: categoryId });
}
