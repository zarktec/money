import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";

/** Diario: marca como vencidas las suscripciones cuyo periodo terminó. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const { data, error } = await db.from("subscriptions").update({ status: "expired" })
    .in("status", ["active", "trialing", "past_due"]).lt("current_period_end", new Date().toISOString()).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expired: data?.length ?? 0 });
}
