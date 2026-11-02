import Link from "next/link";
import { addMonths, endOfMonth, format, parse, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { confirmAllPending, confirmTransaction, deleteTransaction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Movimientos" };

/** Un join de PostgREST llega como objeto o como arreglo según la relación. */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type Named = { name: string };
const FILTERS = [["", "Todos"], ["expense", "Egresos"], ["income", "Ingresos"], ["transfer", "Transf."], ["pending", "Por revisar"]] as const;

export default async function Movimientos({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? parse(sp.mes!, "yyyy-MM", new Date()) : parse(todayISO(), "yyyy-MM-dd", new Date());
  const mes = format(month, "yyyy-MM");
  const tipo = sp.tipo ?? "";

  const supabase = await createClient();
  let q = supabase.from("transactions")
    .select("id, type, amount_cents, occurred_on, description, status, source, notes, account:accounts!transactions_account_id_fkey(name), category:expense_categories(name), income_type:income_types(name)")
    .gte("occurred_on", format(startOfMonth(month), "yyyy-MM-dd")).lte("occurred_on", format(endOfMonth(month), "yyyy-MM-dd"))
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (tipo === "pending") q = q.eq("status", "pending_review");
  else if (tipo) q = q.eq("type", tipo);
  const { data: rows } = await q;

  const groups = new Map<string, typeof rows>();
  for (const r of rows ?? []) groups.set(r.occurred_on, [...(groups.get(r.occurred_on) ?? []), r]);
  const href = (m: string, t = tipo) => `/movimientos?mes=${m}${t ? `&tipo=${t}` : ""}`;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Link href={href(format(addMonths(month, -1), "yyyy-MM"))} aria-label="Mes anterior" className="grid size-11 place-items-center rounded-full border border-line">‹</Link>
        <h1 className="text-lg font-bold capitalize">{format(month, "LLLL yyyy", { locale: es })}</h1>
        <Link href={href(format(addMonths(month, 1), "yyyy-MM"))} aria-label="Mes siguiente" className="grid size-11 place-items-center rounded-full border border-line">›</Link>
      </header>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([v, l]) => <Link key={v} href={href(mes, v)} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm", tipo === v ? "bg-brand text-brand-fg" : "border border-line")}>{l}</Link>)}
      </div>

      {tipo === "pending" && !!rows?.length && (
        <form action={confirmAllPending}><button className="h-11 w-full rounded-xl border border-brand font-semibold text-brand">Confirmar los {rows.length} movimientos</button></form>
      )}

      {!rows?.length && <p className="py-10 text-center text-muted">No hay movimientos en este periodo.</p>}

      {[...groups.entries()].map(([day, items]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase text-muted">{format(parse(day, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM", { locale: es })}</h2>
          {items!.map((t) => {
            const label = t.description || one<Named>(t.category)?.name || one<Named>(t.income_type)?.name || (t.type === "transfer" ? "Transferencia" : "Sin descripción");
            const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
            return (
              <Card key={t.id} className={cn("flex items-center gap-3 p-3", t.status === "pending_review" && "border-warn/60")}>
                <Link href={`/movimientos/${t.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{label}</p>
                  <p className="truncate text-xs text-muted">{one<Named>(t.account)?.name}{t.status === "pending_review" && ` · ${t.source === "email" ? "📧 del correo" : "por revisar"}`}</p>
                  {t.status === "pending_review" && t.notes && <p className="truncate text-xs text-muted/80">{t.notes}</p>}
                </Link>
                <p className={cn("font-semibold tabular-nums", t.type === "income" ? "text-brand" : t.type === "expense" ? "text-danger" : "")}>{sign}{formatMoney(t.amount_cents)}</p>
                {t.status === "pending_review" && <form action={confirmTransaction}><input type="hidden" name="id" value={t.id} /><button aria-label="Confirmar" className="grid size-10 place-items-center rounded-full bg-brand text-brand-fg">✓</button></form>}
                <form action={deleteTransaction}><input type="hidden" name="id" value={t.id} /><button aria-label="Eliminar" className="grid size-10 place-items-center rounded-full text-muted">🗑</button></form>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
