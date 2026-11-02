import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface Option { id: string; name: string; color?: string | null }
export interface FormOptions {
  accounts: Option[]; categories: Option[]; incomeTypes: Option[]; platforms: Option[]; banks: Option[]; projects: Option[];
}

/** Listas para los selectores. RLS limita categorías a las globales + las propias. */
export async function getFormOptions(): Promise<FormOptions> {
  const supabase = await createClient();
  const [a, c, i, p, b, pr] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("archived", false).order("created_at"),
    supabase.from("expense_categories").select("id, name, color").eq("active", true).order("sort_order").order("name"),
    supabase.from("income_types").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("subscription_platforms").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("banks").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("projects").select("id, name").eq("archived", false).order("created_at"),
  ]);
  return { accounts: a.data ?? [], categories: c.data ?? [], incomeTypes: i.data ?? [], platforms: p.data ?? [], banks: b.data ?? [], projects: pr.data ?? [] };
}
