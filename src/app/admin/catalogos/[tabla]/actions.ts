"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { CATALOGS } from "@/lib/admin/catalogs";

function build(def: (typeof CATALOGS)[string], fd: FormData) {
  const row: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = fd.get(f.name);
    if (f.type === "bool") row[f.name] = v === "on";
    else if (f.type === "array") row[f.name] = String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "number") row[f.name] = v === "" || v == null ? null : Number(v);
    else row[f.name] = String(v ?? "").trim() || null;
  }
  return row;
}

export async function saveCatalogRow(slug: string, fd: FormData) {
  const def = CATALOGS[slug]; if (!def) return;
  const { supabase, user } = await requireAdmin();
  const row = build(def, fd);
  if (!row.name) return;
  const id = String(fd.get("id") ?? "");
  const q = id ? supabase.from(def.table).update(row).eq("id", id) : supabase.from(def.table).insert(def.table === "expense_categories" ? { ...row, user_id: null } : row);
  await q;
  await supabase.from("audit_log").insert({ actor_id: user.id, action: id ? "catalog.update" : "catalog.create", entity: def.table, entity_id: id || null });
  revalidatePath(`/admin/catalogos/${slug}`);
}

export async function toggleCatalogRow(slug: string, fd: FormData) {
  const def = CATALOGS[slug]; if (!def) return;
  const { supabase } = await requireAdmin();
  await supabase.from(def.table).update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath(`/admin/catalogos/${slug}`);
}
