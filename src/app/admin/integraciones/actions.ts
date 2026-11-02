"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearIntegrationField, IntegrationError, saveIntegration } from "@/lib/integrations/store";
import { providerDef, type ProviderId } from "@/lib/integrations/registry";

const to = (q: string) => redirect(`/admin/integraciones?${q}`);

/** Guarda las credenciales de un proveedor. Los campos vacíos no se tocan. En la auditoría queda QUÉ campos cambiaron, nunca sus valores. */
export async function saveIntegrationAction(fd: FormData) {
  const { user } = await requireAdmin();
  const provider = String(fd.get("provider") ?? "");
  const def = providerDef(provider);
  if (!def) return to("error=" + encodeURIComponent("Integración desconocida."));
  const input: Record<string, string> = {};
  for (const f of def.fields) input[f.key] = String(fd.get(f.key) ?? "");
  let saved: string[];
  try { saved = await saveIntegration(createAdminClient(), provider as ProviderId, input, user.id); }
  catch (e) { return to(`error=${encodeURIComponent(e instanceof IntegrationError ? e.message : "No se pudo guardar.")}&p=${provider}`); }
  if (!saved.length) return to(`info=${encodeURIComponent("No escribiste ningún valor nuevo.")}&p=${provider}`);
  await createAdminClient().from("audit_log").insert({ actor_id: user.id, action: "integration.update", entity: "integration_settings", entity_id: provider, meta: { fields: saved } });
  to(`ok=${provider}`);
}

export async function clearIntegrationAction(fd: FormData) {
  const { user } = await requireAdmin();
  const provider = String(fd.get("provider") ?? ""), key = String(fd.get("key") ?? "");
  try { await clearIntegrationField(createAdminClient(), provider as ProviderId, key); }
  catch (e) { return to(`error=${encodeURIComponent(e instanceof IntegrationError ? e.message : "No se pudo quitar.")}`); }
  await createAdminClient().from("audit_log").insert({ actor_id: user.id, action: "integration.clear", entity: "integration_settings", entity_id: provider, meta: { field: key } });
  to(`ok=${provider}`);
}
