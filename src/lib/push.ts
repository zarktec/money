import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload { title: string; body: string; url: string; tag?: string }

/** ¿Hay llaves VAPID? Si no, los envíos se omiten sin error. */
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:soporte@example.com", pub, priv);
  return true;
}

/** Envía a todos los dispositivos del usuario; borra las suscripciones caducadas (404/410). Devuelve cuántos recibieron y si falló algo temporal. */
export async function sendToUser(db: SupabaseClient, userId: string, payload: PushPayload): Promise<{ delivered: number; transient: boolean }> {
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let delivered = 0, transient = false;
  for (const s of subs ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); delivered++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id); else transient = true; }
  }
  return { delivered, transient };
}
