import { monthBounds, todayISO } from "@/lib/dates";
import { loadTransactions } from "@/lib/export/data";
import { buildMonthlyPdf } from "@/lib/export/pdf";
import { badRequest, download, requireUser, unauthorized } from "@/lib/export/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const month = new URL(req.url).searchParams.get("month") ?? monthBounds(todayISO()).month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return badRequest("Mes inválido (usa AAAA-MM)");
  const { from, to } = monthBounds(`${month}-01`);
  const [transactions, { data: profile }] = await Promise.all([loadTransactions(supabase, from, to), supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()]);
  const pdf = await buildMonthlyPdf({ userName: profile?.full_name || user.email || "", month, transactions });
  return download(new Uint8Array(pdf), `money-informe-${month}.pdf`, "application/pdf");
}
