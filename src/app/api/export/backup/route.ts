import { todayISO } from "@/lib/dates";
import { loadBackup } from "@/lib/export/data";
import { download, requireUser, unauthorized } from "@/lib/export/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Respaldo completo (derecho de acceso y portabilidad, Ley 1581): todos los datos del usuario, sin secretos. */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const backup = await loadBackup(supabase, user.id);
  return download(JSON.stringify(backup, null, 2), `money-respaldo-${todayISO()}.json`, "application/json; charset=utf-8");
}
