"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assetSchema, debtPaymentSchema, debtSchema, type FormState } from "@/lib/forms/schemas";
import { splitPayment } from "@/lib/finance/debts";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}
const refresh = (...extra: string[]) => ["/inicio", "/deudas", "/patrimonio", "/proyeccion", "/salud", "/movimientos", "/cuentas", "/calendario", ...extra].forEach((p) => revalidatePath(p));

// ---------- Deudas ----------
export async function saveDebt(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = debtSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const balance = v.balance ?? v.principal;
  const { data, error } = await supabase.from("debts").insert({
    user_id: userId, name: v.name, kind: v.kind, creditor: v.creditor, bank_id: v.bank_id,
    principal_cents: v.principal, balance_cents: balance, annual_rate: v.annual_rate, installment_cents: v.installment,
    total_installments: v.total_installments, due_day: v.due_day, next_due_date: v.next_due_date, active: balance > 0,
  }).select("id").single();
  if (error || !data) return { error: "No se pudo guardar la deuda" };
  refresh();
  redirect(`/deudas/${data.id}`);
}

export async function payDebt(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await ctx();
  const parsed = debtPaymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data: debt } = await supabase.from("debts").select("id, balance_cents, annual_rate, active").eq("id", v.debt_id).maybeSingle();
  if (!debt || !debt.active) return { error: "Deuda no encontrada" };
  const split = splitPayment(Number(debt.balance_cents), Number(debt.annual_rate ?? 0), v.amount);
  const { data: cat } = await supabase.from("expense_categories").select("id").is("user_id", null).eq("name", "Deudas y créditos").limit(1).maybeSingle();
  // Una sola transacción en la base de datos: el saldo, el egreso y el detalle del pago se guardan juntos o no se guarda nada.
  const { error } = await supabase.rpc("register_debt_payment", {
    p_debt: debt.id, p_amount: v.amount, p_paid_on: v.paid_on, p_account: v.account_id, p_category: cat?.id ?? null,
    p_interest: split.interestCents, p_principal: split.principalCents, p_expected_balance: debt.balance_cents,
  });
  if (error) return { error: error.message.includes("cambió") ? "El saldo cambió, actualiza la página e inténtalo de nuevo" : "No se pudo registrar el pago" };
  refresh(`/deudas/${debt.id}`);
  return { ok: true };
}

export async function closeDebt(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("debts").update({ active: false }).eq("id", String(fd.get("id")));
  refresh();
  redirect("/deudas");
}

export async function deleteDebt(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("debts").delete().eq("id", String(fd.get("id")));
  refresh();
  redirect("/deudas");
}

// ---------- Bienes ----------
export async function saveAsset(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = assetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.from("assets").insert({ user_id: userId, name: parsed.data.name, kind: parsed.data.kind, value_cents: parsed.data.value });
  if (error) return { error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

export async function deleteAsset(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("assets").delete().eq("id", String(fd.get("id")));
  refresh();
}

