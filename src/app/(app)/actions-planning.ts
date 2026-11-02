"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { budgetSchema, contributionSchema, goalSchema, payRuleSchema, projectSchema, type FormState } from "@/lib/forms/schemas";
import { nextOccurrence, type Frequency } from "@/lib/finance/recurrence";
import { shiftMonth, todayISO } from "@/lib/dates";
import { planLimitMessage } from "@/lib/plan-error";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

async function visible(supabase: Supabase, table: "accounts" | "projects" | "expense_categories", id: string | null) {
  if (!id) return true;
  const { data } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  return !!data;
}

const refresh = (...extra: string[]) => ["/inicio", "/ahorros", "/proyectos", "/presupuestos", "/calendario", "/movimientos", "/recurrentes", ...extra].forEach((p) => revalidatePath(p));

// ---------- Metas de ahorro ----------
export async function saveGoal(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = goalSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (v.target_date < todayISO()) return { error: "La fecha de la meta debe ser futura" };
  if (!(await visible(supabase, "projects", v.project_id)) || !(await visible(supabase, "accounts", v.account_id))) return { error: "Selección inválida" };
  const { data, error } = await supabase.from("savings_goals").insert({
    user_id: userId, name: v.name, target_cents: v.target, target_date: v.target_date, project_id: v.project_id, account_id: v.account_id,
  }).select("id").single();
  if (error || !data) return { error: planLimitMessage(error?.message) ?? "No se pudo crear la meta" };
  refresh();
  redirect(`/ahorros/${data.id}`);
}

export async function addContribution(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = contributionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.from("goal_contributions").insert({
    user_id: userId, goal_id: v.goal_id, amount_cents: v.kind === "withdraw" ? -v.amount : v.amount, contributed_on: v.contributed_on, note: v.note,
  });
  if (error) return { error: "No se pudo registrar el aporte" };
  refresh(`/ahorros/${v.goal_id}`);
  return { ok: true };
}

export async function deleteContribution(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("goal_contributions").delete().eq("id", String(fd.get("id")));
  refresh(`/ahorros/${String(fd.get("goal_id"))}`);
}

export async function setGoalStatus(fd: FormData) {
  const { supabase } = await ctx();
  const status = String(fd.get("status"));
  if (!["active", "paused", "canceled"].includes(status)) return;
  await supabase.from("savings_goals").update({ status }).eq("id", String(fd.get("id")));
  refresh(`/ahorros/${String(fd.get("id"))}`);
}

export async function deleteGoal(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("savings_goals").delete().eq("id", String(fd.get("id")));
  refresh();
  redirect("/ahorros");
}

// ---------- Proyectos ----------
export async function saveProject(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = projectSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await supabase.from("projects").insert({
    user_id: userId, name: v.name, description: v.description, budget_cents: v.budget, end_date: v.end_date,
  }).select("id").single();
  if (error || !data) return { error: planLimitMessage(error?.message) ?? "No se pudo crear el proyecto" };
  refresh();
  redirect(`/proyectos/${data.id}`);
}

export async function archiveProject(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("projects").update({ archived: true }).eq("id", String(fd.get("id")));
  refresh();
  redirect("/proyectos");
}

// ---------- Presupuestos ----------
export async function saveBudget(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = budgetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (!(await visible(supabase, "expense_categories", v.category_id))) return { error: "Categoría inválida" };
  const { error } = await supabase.from("budgets").upsert(
    { user_id: userId, category_id: v.category_id, amount_cents: v.amount, period_month: `${v.month}-01` },
    { onConflict: "user_id,category_id,period_month" },
  );
  if (error) return { error: "No se pudo guardar el presupuesto" };
  refresh();
  return { ok: true };
}

export async function deleteBudget(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("budgets").delete().eq("id", String(fd.get("id")));
  refresh();
}

/** Copia los presupuestos del mes anterior al mes indicado, sin pisar los que ya existen. */
export async function copyBudgets(fd: FormData) {
  const { supabase, userId } = await ctx();
  const month = String(fd.get("month"));
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const [{ data: prev }, { data: current }] = await Promise.all([
    supabase.from("budgets").select("category_id, amount_cents").eq("period_month", `${shiftMonth(month, -1)}-01`),
    supabase.from("budgets").select("category_id").eq("period_month", `${month}-01`),
  ]);
  const have = new Set((current ?? []).map((b) => b.category_id));
  const rows = (prev ?? []).filter((b) => !have.has(b.category_id)).map((b) => ({ user_id: userId, category_id: b.category_id, amount_cents: b.amount_cents, period_month: `${month}-01` }));
  if (rows.length) await supabase.from("budgets").insert(rows);
  refresh();
}

// ---------- Vencimientos (calendario) ----------
/**
 * Paga un vencimiento: crea el movimiento y avanza la regla. `due` debe ser el vencimiento mostrado en pantalla:
 * si la regla ya avanzó (doble clic, o el cron ya lo registró) no se hace nada, así nunca se paga el periodo siguiente.
 */
export async function payRule(fd: FormData) {
  const { supabase, userId } = await ctx();
  const parsed = payRuleSchema.safeParse({ id: fd.get("id"), due: fd.get("due"), paid_on: fd.get("paid_on") || todayISO(), amount: fd.get("amount") ?? "" });
  if (!parsed.success) return;
  const v = parsed.data;
  const { data: r } = await supabase.from("recurring_rules").select("*").eq("id", v.id).maybeSingle();
  if (!r || !r.active || r.next_date !== v.due) return;

  // external_id único: si el cron ya registró este vencimiento, el insert falla y solo avanzamos la regla.
  await supabase.from("transactions").insert({
    user_id: userId, type: r.type, amount_cents: v.amount ?? r.amount_cents, occurred_on: v.paid_on, description: r.name,
    account_id: r.account_id, category_id: r.category_id, income_type_id: r.income_type_id, project_id: r.project_id,
    recurring_rule_id: r.id, source: "recurring", status: "confirmed", external_id: `rule:${r.id}:${r.next_date}`,
  });
  await advanceRule(supabase, r);
  refresh();
}

/** Omite un vencimiento sin registrar movimiento. */
export async function skipRule(fd: FormData) {
  const { supabase } = await ctx();
  const { data: r } = await supabase.from("recurring_rules").select("*").eq("id", String(fd.get("id"))).maybeSingle();
  if (!r || !r.active || r.next_date !== String(fd.get("due"))) return;
  await advanceRule(supabase, r);
  refresh();
}

async function advanceRule(supabase: Supabase, r: { id: string; next_date: string; frequency: string; interval_days: number | null; end_date: string | null }) {
  const next = nextOccurrence(r.next_date, r.frequency as Frequency, r.interval_days);
  const ended = !!r.end_date && next > r.end_date;
  await supabase.from("recurring_rules").update({ next_date: next, active: !ended }).eq("id", r.id).eq("next_date", r.next_date);
}

