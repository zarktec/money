import { addDaysISO, todayISO } from "@/lib/dates";
import { loadAccounts, loadTransactions } from "@/lib/export/data";
import { buildWorkbook } from "@/lib/export/excel";
import { badRequest, download, requireUser, unauthorized } from "@/lib/export/http";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Excel de movimientos del rango (por defecto, el último año). Los datos del propio usuario salen por RLS. */
export async function GET(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams;
  const to = q.get("to") ?? todayISO(), from = q.get("from") ?? addDaysISO(to, -365);
  if (!ISO.test(from) || !ISO.test(to) || from > to) return badRequest("Rango de fechas inválido");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 1100) return badRequest("El rango máximo es de 3 años");
  const [transactions, accounts] = await Promise.all([loadTransactions(supabase, from, to), loadAccounts(supabase)]);
  const buf = await buildWorkbook({ from, to, transactions, accounts });
  return download(new Uint8Array(buf), `money-movimientos-${from}_${to}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
