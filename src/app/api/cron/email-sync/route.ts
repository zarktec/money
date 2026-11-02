import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getPlanLimits, numericLimit } from "@/lib/plan-limits";
import { runSync } from "@/lib/email/service";

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 50_000;     // deja margen para cerrar la corrida antes del límite de la función
const MAX_CONNECTIONS = 20;

/** Cada hora: sincroniza las conexiones más atrasadas primero y se detiene a tiempo; las pendientes siguen en la siguiente corrida. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const deadline = Date.now() + BUDGET_MS;
  const { data: conns, error } = await db.from("email_connections").select("id, user_id").eq("active", true).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(MAX_CONNECTIONS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allowed = new Map<string, boolean>();
  let synced = 0, skipped = 0, failed = 0, created = 0;
  for (const c of conns ?? []) {
    if (Date.now() > deadline) break;
    if (!allowed.has(c.user_id)) allowed.set(c.user_id, numericLimit(await getPlanLimits(db, c.user_id), "email_connections", 0) > 0);
    if (!allowed.get(c.user_id)) { skipped++; continue; }      // bajó de plan: no se sincroniza
    try {
      const r = await runSync(c.id, { deadline, maxAi: 10 });
      if ("skipped" in r) skipped++; else { synced++; created += r.created; }
    } catch (e) { failed++; console.error("email-sync", c.id, (e as Error).name); }   // sin mensajes que puedan filtrar contenido del correo
  }
  return NextResponse.json({ ok: true, synced, skipped, failed, created });
}
