import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/db-page";

export interface ExportTx { date: string; type: "income" | "expense" | "transfer"; amountCents: number; account: string; toAccount: string; category: string; description: string; status: string; source: string; project: string }
export interface ExportAccount { name: string; type: string; balanceCents: number }

const names = async (db: SupabaseClient, table: string) => new Map<string, string>(((await db.from(table).select("id, name")).data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));

/** Movimientos del rango con los nombres ya resueltos (cuenta, categoría, proyecto). Pagina para no perder filas pasadas las 1.000. */
export async function loadTransactions(db: SupabaseClient, from: string, to: string): Promise<ExportTx[]> {
  const [acc, cat, inc, prj] = await Promise.all([names(db, "accounts"), names(db, "expense_categories"), names(db, "income_types"), names(db, "projects")]);
  type Row = { type: ExportTx["type"]; amount_cents: number; occurred_on: string; account_id: string | null; to_account_id: string | null; category_id: string | null; income_type_id: string | null; project_id: string | null; description: string | null; status: string; source: string };
  const rows = await selectAll<Row>((a, b) => db.from("transactions").select("type, amount_cents, occurred_on, account_id, to_account_id, category_id, income_type_id, project_id, description, status, source")
    .gte("occurred_on", from).lte("occurred_on", to).order("occurred_on").order("id").range(a, b));
  return rows.map((r) => ({
    date: r.occurred_on, type: r.type, amountCents: Number(r.amount_cents), account: (r.account_id && acc.get(r.account_id)) || "", toAccount: (r.to_account_id && acc.get(r.to_account_id)) || "",
    category: (r.category_id && cat.get(r.category_id)) || (r.income_type_id && inc.get(r.income_type_id)) || "", description: r.description ?? "", status: r.status, source: r.source, project: (r.project_id && prj.get(r.project_id)) || "",
  }));
}

export async function loadAccounts(db: SupabaseClient): Promise<ExportAccount[]> {
  const [{ data: accs }, { data: bal }] = await Promise.all([db.from("accounts").select("id, name, type").eq("archived", false).order("created_at"), db.from("account_balances").select("account_id, balance_cents")]);
  const b = new Map((bal ?? []).map((x: { account_id: string; balance_cents: number }) => [x.account_id, Number(x.balance_cents)]));
  return (accs ?? []).map((a: { id: string; name: string; type: string }) => ({ name: a.name, type: a.type, balanceCents: b.get(a.id) ?? 0 }));
}

/**
 * Tablas del respaldo completo. Las que contienen secretos se leen con columnas EXPLÍCITAS (nunca `*`): jamás deben salir
 * tokens de correo, la fuente de pago de Wompi ni el cuerpo crudo de los eventos de pago.
 */
export const BACKUP_TABLES: { table: string; columns: string; ownerCol: string }[] = [
  { table: "profiles", columns: "id, full_name, country, currency, locale, timezone, month_start_day, created_at, data_consent_at", ownerCol: "id" },
  { table: "accounts", columns: "*", ownerCol: "user_id" }, { table: "expense_categories", columns: "*", ownerCol: "user_id" }, { table: "merchants", columns: "*", ownerCol: "user_id" },
  { table: "transactions", columns: "*", ownerCol: "user_id" }, { table: "recurring_rules", columns: "*", ownerCol: "user_id" }, { table: "budgets", columns: "*", ownerCol: "user_id" },
  { table: "savings_goals", columns: "*", ownerCol: "user_id" }, { table: "goal_contributions", columns: "*", ownerCol: "user_id" }, { table: "projects", columns: "*", ownerCol: "user_id" },
  { table: "debts", columns: "*", ownerCol: "user_id" }, { table: "debt_payments", columns: "*", ownerCol: "user_id" }, { table: "assets", columns: "*", ownerCol: "user_id" },
  { table: "shared_groups", columns: "*", ownerCol: "user_id" }, { table: "shared_members", columns: "*", ownerCol: "user_id" }, { table: "shared_expenses", columns: "*", ownerCol: "user_id" },
  { table: "assistant_conversations", columns: "*", ownerCol: "user_id" }, { table: "assistant_messages", columns: "*", ownerCol: "user_id" },
  { table: "shared_splits", columns: "*", ownerCol: "user_id" }, { table: "shared_settlements", columns: "*", ownerCol: "user_id" }, { table: "import_batches", columns: "*", ownerCol: "user_id" },
  { table: "email_connections", columns: "id, provider, email, created_at, last_sync_at, active", ownerCol: "user_id" },
  { table: "subscriptions", columns: "id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at", ownerCol: "user_id" },
  { table: "payments", columns: "id, reference, amount_cents, currency, status, payment_method, created_at", ownerCol: "user_id" },
];

export async function loadBackup(db: SupabaseClient, userId: string) {
  const entries = await Promise.all(BACKUP_TABLES.map(async (t) => [t.table, await selectAll<Record<string, unknown>>((a, b) => db.from(t.table).select(t.columns).eq(t.ownerCol, userId).order("id").range(a, b) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>)] as const));
  return { app: "Money", version: 1, generatedAt: new Date().toISOString(), note: "Respaldo de tus datos. Los montos están en centavos.", data: Object.fromEntries(entries) };
}
