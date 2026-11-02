"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountSchema, categorySchema, ruleSchema, txSchema, type FormState } from "@/lib/forms/schemas";
import { monthlyProvision, nextOccurrence, type Frequency } from "@/lib/finance/recurrence";
import { learnMerchantRule } from "@/lib/learn";
import { planLimitMessage } from "@/lib/plan-error";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/** RLS no valida claves foráneas: confirmamos que los ids referenciados son visibles para este usuario. */
async function assertVisible(supabase: Supabase, table: "accounts" | "expense_categories" | "income_types" | "projects", ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return true;
  const { data } = await supabase.from(table).select("id").in("id", wanted);
  return (data?.length ?? 0) === wanted.length;
}

const refresh = () => ["/inicio", "/movimientos", "/cuentas", "/recurrentes"].forEach((p) => revalidatePath(p));

// ---------- Movimientos ----------
export async function saveTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = txSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const id = String(fd.get("id") ?? "");

  const ok = (await assertVisible(supabase, "accounts", [v.account_id, v.to_account_id]))
    && (await assertVisible(supabase, "expense_categories", [v.category_id]))
    && (await assertVisible(supabase, "income_types", [v.income_type_id]))
    && (await assertVisible(supabase, "projects", [v.project_id]));
  if (!ok) return { error: "Selección inválida" };

  const row = {
    type: v.type, amount_cents: v.amount, occurred_on: v.occurred_on, description: v.description, notes: v.notes,
    account_id: v.account_id,
    to_account_id: v.type === "transfer" ? v.to_account_id : null,
    category_id: v.type === "expense" ? v.category_id : null,
    income_type_id: v.type === "income" ? v.income_type_id : null,
    project_id: v.project_id,
  };

  if (id) {
    const { data: prev } = await supabase.from("transactions").select("source").eq("id", id).maybeSingle();
    const { error } = await supabase.from("transactions").update({ ...row, status: "confirmed" }).eq("id", id);
    if (error) return { error: "No se pudo guardar" };
    if (v.type === "expense" && prev && !["manual", "recurring"].includes(prev.source)) await learnMerchantRule(supabase, userId, v.description, row.category_id);
  } else {
    const { data: tx, error } = await supabase.from("transactions").insert({ ...row, user_id: userId, source: "manual" }).select("id").single();
    if (error || !tx) return { error: "No se pudo guardar" };

    // "Se repite": crea la regla recurrente enlazada; la próxima fecha ya excluye este registro.
    if (v.repeat !== "none" && v.type !== "transfer") {
      const freq = v.repeat as Frequency;
      const { data: rule } = await supabase.from("recurring_rules").insert({
        user_id: userId, type: v.type, name: v.description ?? (v.type === "income" ? "Ingreso recurrente" : "Gasto recurrente"),
        amount_cents: v.amount, frequency: freq, first_date: v.occurred_on, next_date: nextOccurrence(v.occurred_on, freq),
        account_id: v.account_id, category_id: row.category_id, income_type_id: row.income_type_id, project_id: v.project_id,
        provision_enabled: v.type === "expense" && monthlyProvision(v.amount, freq) > 0, auto_register: false,
      }).select("id").single();
      if (rule) await supabase.from("transactions").update({ recurring_rule_id: rule.id }).eq("id", tx.id);
    }
  }
  refresh();
  redirect("/movimientos");
}

export async function confirmTransaction(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = String(fd.get("id"));
  const { data: t } = await supabase.from("transactions").select("description, category_id, source, type").eq("id", id).maybeSingle();
  await supabase.from("transactions").update({ status: "confirmed" }).eq("id", id);
  if (t && t.type === "expense" && !["manual", "recurring"].includes(t.source)) await learnMerchantRule(supabase, userId, t.description, t.category_id);
  refresh();
}

/** Confirma de una vez todo lo pendiente de revisión (RLS limita a los del usuario). No aprende reglas: no se revisó categoría por categoría. */
export async function confirmAllPending() {
  const { supabase } = await ctx();
  await supabase.from("transactions").update({ status: "confirmed" }).eq("status", "pending_review");
  refresh();
}

export async function deleteTransaction(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("transactions").delete().eq("id", String(fd.get("id")));
  refresh();
}

// ---------- Cuentas ----------
export async function saveAccount(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = accountSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.from("accounts").insert({
    user_id: userId, name: v.name, type: v.type, bank_id: v.bank_id, opening_balance_cents: v.opening_balance,
  });
  if (error) return { error: planLimitMessage(error.message) ?? "No se pudo crear la cuenta" };
  refresh();
  redirect("/cuentas");
}

export async function archiveAccount(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("accounts").update({ archived: true }).eq("id", String(fd.get("id")));
  refresh();
}

// ---------- Recurrentes ----------
export async function saveRule(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = ruleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const ok = (await assertVisible(supabase, "accounts", [v.account_id])) && (await assertVisible(supabase, "expense_categories", [v.category_id]))
    && (await assertVisible(supabase, "income_types", [v.income_type_id]));
  if (!ok) return { error: "Selección inválida" };
  const { error } = await supabase.from("recurring_rules").insert({
    user_id: userId, type: v.type, name: v.name, amount_cents: v.amount, amount_is_estimate: v.amount_is_estimate,
    frequency: v.frequency, first_date: v.next_date, next_date: v.next_date, account_id: v.account_id,
    category_id: v.type === "expense" ? v.category_id : null, income_type_id: v.type === "income" ? v.income_type_id : null,
    platform_id: v.platform_id, auto_register: v.auto_register, remind_days_before: v.remind_days_before,
    provision_enabled: v.type === "expense" && monthlyProvision(v.amount, v.frequency) > 0,
  });
  if (error) return { error: "No se pudo guardar" };
  refresh();
  redirect("/recurrentes");
}

export async function toggleRule(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("recurring_rules").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  refresh();
}

export async function deleteRule(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("recurring_rules").delete().eq("id", String(fd.get("id")));
  refresh();
}

// ---------- Categorías propias ----------
export async function saveCategory(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = categorySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.from("expense_categories").insert({ user_id: userId, name: parsed.data.name, color: parsed.data.color, essential: parsed.data.essential });
  if (error) return { error: "No se pudo crear la categoría" };
  revalidatePath("/categorias");
  return { ok: true };
}

export async function deleteCategory(fd: FormData) {
  const { supabase, userId } = await ctx();
  await supabase.from("expense_categories").delete().eq("id", String(fd.get("id"))).eq("user_id", userId);
  revalidatePath("/categorias");
}
