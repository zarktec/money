import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { nextOccurrence, type Frequency } from "@/lib/finance/recurrence";

export const runtime = "nodejs";

/** Diario: convierte reglas vencidas con auto_register en transacciones y avanza next_date. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: rules, error } = await db.from("recurring_rules").select("*").eq("active", true).lte("next_date", today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let created = 0;
  for (const r of rules ?? []) {
    let next: string = r.next_date;
    let guard = 0;
    while (next <= today && guard++ < 24) {
      if (r.auto_register) {
        const { error: e } = await db.from("transactions").insert({
          user_id: r.user_id, type: r.type, amount_cents: r.amount_cents, occurred_on: next, description: r.name,
          account_id: r.account_id, category_id: r.category_id, income_type_id: r.income_type_id, project_id: r.project_id,
          recurring_rule_id: r.id, source: "recurring",
          // Si el monto es estimado, queda pendiente para que el usuario confirme el valor real.
          status: r.amount_is_estimate ? "pending_review" : "confirmed",
          external_id: `rule:${r.id}:${next}`,   // índice único => idempotente si el cron corre dos veces
        });
        if (!e) created++;
      }
      next = nextOccurrence(next, r.frequency as Frequency, r.interval_days);
    }
    if (r.end_date && next > r.end_date) await db.from("recurring_rules").update({ active: false, next_date: next }).eq("id", r.id);
    else await db.from("recurring_rules").update({ next_date: next }).eq("id", r.id);
  }
  return NextResponse.json({ ok: true, rules: rules?.length ?? 0, created });
}
