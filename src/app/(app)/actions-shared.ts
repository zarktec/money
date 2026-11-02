"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseMoneyInput } from "@/lib/finance/money";
import { splitEqually, validateShares } from "@/lib/shared/split";
import type { FormState } from "@/lib/forms/schemas";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}
const refresh = (id?: string) => ["/compartidos", id ? `/compartidos/${id}` : "", "/movimientos", "/inicio"].filter(Boolean).forEach((p) => revalidatePath(p));
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export async function saveGroup(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const name = String(fd.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Ponle un nombre al grupo" };
  const others = [...new Set(String(fd.get("members") ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean))].filter((n) => n.toLowerCase() !== "yo");
  if (!others.length) return { error: "Agrega al menos a una persona más" };
  if (others.length > 19 || others.some((n) => n.length > 60)) return { error: "Máximo 20 personas, con nombres de hasta 60 letras" };

  const { data: g, error } = await supabase.from("shared_groups").insert({ user_id: userId, name }).select("id").single();
  if (error || !g) return { error: "No se pudo crear el grupo" };
  const { error: me } = await supabase.from("shared_members").insert([{ group_id: g.id, user_id: userId, name: "Yo", is_me: true }, ...others.map((n) => ({ group_id: g.id, user_id: userId, name: n }))]);
  if (me) { await supabase.from("shared_groups").delete().eq("id", g.id); return { error: "No se pudo crear el grupo" }; }
  refresh();
  redirect(`/compartidos/${g.id}`);
}

const MESSAGES: [RegExp, string][] = [
  [/no suman/i, "Las partes no suman el total"], [/valor debe ser positivo/i, "El valor debe ser mayor que cero"],
  [/Cuenta inválida|Categoría inválida/i, "Cuenta o categoría inválida"], [/Grupo no encontrado/i, "Grupo no encontrado"],
];

export async function addSharedExpense(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await ctx();
  const groupId = String(fd.get("group_id") ?? "");
  const description = String(fd.get("description") ?? "").trim();
  const amount = parseMoneyInput(String(fd.get("amount") ?? ""));
  const date = iso.safeParse(String(fd.get("date") ?? ""));
  const paidBy = String(fd.get("paid_by") ?? "");
  if (!description) return { error: "Describe el gasto" };
  if (!amount || amount <= 0) return { error: "Ingresa un valor válido" };
  if (!date.success) return { error: "Fecha inválida" };

  const { data: members } = await supabase.from("shared_members").select("id").eq("group_id", groupId);
  const ids = (members ?? []).map((m) => m.id as string);
  if (!ids.includes(paidBy)) return { error: "Elige quién pagó" };

  let shares: Record<string, number>;
  if (fd.get("split_mode") === "custom") {
    shares = {};
    for (const id of ids) { const raw = String(fd.get(`share_${id}`) ?? "").trim(); if (!raw) continue; const c = parseMoneyInput(raw); if (c === null) return { error: "Hay una parte con un valor inválido" }; if (c > 0) shares[id] = c; }
    const problem = validateShares(amount, shares);
    if (problem) return { error: problem };
  } else {
    const chosen = fd.getAll("participants").map(String).filter((id) => ids.includes(id));
    if (!chosen.length) return { error: "Elige entre quiénes se divide" };
    shares = splitEqually(amount, chosen);
  }

  const mine = fd.get("record_mine") === "on";
  const accountId = String(fd.get("account_id") ?? "") || null;
  if (mine && !accountId) return { error: "Elige la cuenta para registrar tu parte" };
  const { error } = await supabase.rpc("create_shared_expense", {
    p_group: groupId, p_description: description, p_amount: amount, p_paid_by: paidBy, p_date: date.data, p_shares: shares,
    p_create_tx: mine, p_account: accountId, p_category: String(fd.get("category_id") ?? "") || null,
  });
  if (error) return { error: MESSAGES.find(([re]) => re.test(error.message))?.[1] ?? "No se pudo guardar el gasto" };
  refresh(groupId);
  return { ok: true };
}

export async function deleteSharedExpense(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.rpc("delete_shared_expense", { p_expense: String(fd.get("id")) });
  refresh(String(fd.get("group_id")));
}

export async function addSettlement(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const groupId = String(fd.get("group_id") ?? "");
  const from = String(fd.get("from") ?? ""), to = String(fd.get("to") ?? "");
  const amount = parseMoneyInput(String(fd.get("amount") ?? ""));
  const date = iso.safeParse(String(fd.get("date") ?? ""));
  if (!from || !to || from === to) return { error: "Elige quién le pagó a quién" };
  if (!amount || amount <= 0) return { error: "Ingresa un valor válido" };
  if (!date.success) return { error: "Fecha inválida" };
  const { error } = await supabase.from("shared_settlements").insert({ group_id: groupId, user_id: userId, from_member: from, to_member: to, amount_cents: amount, settled_on: date.data });
  if (error) return { error: "No se pudo registrar el pago" };
  refresh(groupId);
  return { ok: true };
}

export async function deleteSettlement(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("shared_settlements").delete().eq("id", String(fd.get("id")));
  refresh(String(fd.get("group_id")));
}

export async function archiveGroup(fd: FormData) {
  const { supabase } = await ctx();
  await supabase.from("shared_groups").update({ archived: true }).eq("id", String(fd.get("id")));
  refresh();
  redirect("/compartidos");
}
