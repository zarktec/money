import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthlyEquivalent, type Frequency } from "@/lib/finance/recurrence";
import { upcomingEvents, budgetStatus, type RuleLite } from "@/lib/finance/planning";
import { goalProgress } from "@/lib/finance/savings";
import { monthsToPayOff } from "@/lib/finance/debts";
import { merchantKey } from "@/lib/email/subscriptions";
import { normalizeText } from "@/lib/imports/parse";
import { addDaysISO } from "@/lib/dates";
import { selectAll } from "@/lib/db-page";

/** Solo lectura. El modelo elige entre estas consultas; no escribe SQL ni modifica nada. Los montos salen en pesos enteros. */
const pesos = (cents: number) => Math.round(cents / 100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa fechas YYYY-MM-DD");
const range = z.object({ from: date, to: date }).refine((r) => r.from <= r.to, "from debe ser anterior o igual a to").refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= 800, "El rango máximo es de 800 días");

export interface ToolCtx { db: SupabaseClient; today: string }
type Handler = (args: unknown, c: ToolCtx) => Promise<unknown>;
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; strict: true; handler: Handler }

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const D = { type: "string", description: "Fecha YYYY-MM-DD" };

async function categoryNames(db: SupabaseClient) { const { data } = await db.from("expense_categories").select("id, name"); return new Map<string, string>((data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])); }
async function txs(db: SupabaseClient, from: string, to: string) {
  type Row = { type: string; amount_cents: number; occurred_on: string; description: string | null; merchant: string | null; category_id: string | null };
  return selectAll<Row>((a, b) => db.from("transactions").select("type, amount_cents, occurred_on, description, merchant, category_id")
    .eq("status", "confirmed").neq("type", "transfer").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on").order("id").range(a, b));
}

export const TOOLS: ToolDef[] = [
  {
    name: "spending_by_category", strict: true,
    description: "Total de egresos (o ingresos) agrupados por categoría en un rango de fechas. Úsala para '¿en qué gasté más?' o '¿cuánto gasté en restaurantes?'.",
    input_schema: obj({ from: D, to: D, type: { type: "string", enum: ["expense", "income"], description: "expense (por defecto) o income" } }, ["from", "to", "type"]),
    handler: async (a, c) => {
      const r = range.extend({ type: z.enum(["expense", "income"]) }).parse(a);
      const names = await categoryNames(c.db);
      const by = new Map<string, { total: number; count: number }>();
      for (const t of await txs(c.db, r.from, r.to)) if (t.type === r.type) { const k = (t.category_id && names.get(t.category_id)) || "Sin categoría"; const e = by.get(k) ?? { total: 0, count: 0 }; e.total += t.amount_cents; e.count++; by.set(k, e); }
      const rows = [...by].map(([category, v]) => ({ category, total_cop: pesos(v.total), count: v.count })).sort((x, y) => y.total_cop - x.total_cop);
      return { from: r.from, to: r.to, type: r.type, total_cop: rows.reduce((s, x) => s + x.total_cop, 0), categories: rows.slice(0, 20), more_categories: Math.max(rows.length - 20, 0) };
    },
  },
  {
    name: "top_merchants", strict: true,
    description: "Los comercios o descripciones donde más se gastó en un rango (agrupa por nombre).",
    input_schema: obj({ from: D, to: D, limit: { type: "integer", description: "Cuántos devolver, 1 a 15" } }, ["from", "to", "limit"]),
    handler: async (a, c) => {
      const r = range.extend({ limit: z.number().int().min(1).max(15) }).parse(a);
      const by = new Map<string, { name: string; total: number; count: number }>();
      for (const t of await txs(c.db, r.from, r.to)) if (t.type === "expense") { const k = merchantKey({ merchant: t.merchant, description: t.description }) || "sin descripción"; const e = by.get(k) ?? { name: (t.merchant || t.description || "Sin descripción").trim(), total: 0, count: 0 }; e.total += t.amount_cents; e.count++; by.set(k, e); }
      return { merchants: [...by.values()].map((v) => ({ name: v.name, total_cop: pesos(v.total), count: v.count })).sort((x, y) => y.total_cop - x.total_cop).slice(0, r.limit) };
    },
  },
  {
    name: "search_transactions", strict: true,
    description: "Busca movimientos concretos por texto (en la descripción) y/o rango de valor. Úsala para '¿cuánto le he pagado a Rappi?' o '¿cuál fue mi gasto más grande?'.",
    input_schema: obj({ from: D, to: D, text: { type: "string", description: "Texto a buscar en la descripción; cadena vacía si no aplica" }, min_cop: { type: "integer", description: "Valor mínimo en pesos; 0 si no aplica" }, limit: { type: "integer", description: "1 a 20" } }, ["from", "to", "text", "min_cop", "limit"]),
    handler: async (a, c) => {
      const r = range.extend({ text: z.string().max(80), min_cop: z.number().int().min(0), limit: z.number().int().min(1).max(20) }).parse(a);
      const needle = normalizeText(r.text);
      const rows = (await txs(c.db, r.from, r.to)).filter((t) => (!needle || normalizeText(`${t.description ?? ""} ${t.merchant ?? ""}`).includes(needle)) && t.amount_cents >= r.min_cop * 100);
      const names = await categoryNames(c.db);
      const sorted = rows.sort((x, y) => y.amount_cents - x.amount_cents);
      return { matches: sorted.length, total_cop: pesos(sorted.reduce((s, t) => s + (t.type === "expense" ? t.amount_cents : 0), 0)), top: sorted.slice(0, r.limit).map((t) => ({ date: t.occurred_on, type: t.type, description: (t.description ?? "").slice(0, 80), amount_cop: pesos(t.amount_cents), category: (t.category_id && names.get(t.category_id)) || null })) };
    },
  },
  {
    name: "monthly_summary", strict: true,
    description: "Ingresos, egresos, balance y tasa de ahorro mes a mes de los últimos N meses (incluye el actual).",
    input_schema: obj({ months: { type: "integer", description: "1 a 12" } }, ["months"]),
    handler: async (a, c) => {
      const { months } = z.object({ months: z.number().int().min(1).max(12) }).parse(a);
      const [y, m] = c.today.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10);
      const by = new Map<string, { income: number; expense: number }>();
      for (const t of await txs(c.db, start, c.today)) { const k = t.occurred_on.slice(0, 7); const e = by.get(k) ?? { income: 0, expense: 0 }; e[t.type as "income" | "expense"] += t.amount_cents; by.set(k, e); }
      return { months: [...by].sort().map(([month, v]) => ({ month, income_cop: pesos(v.income), expense_cop: pesos(v.expense), net_cop: pesos(v.income - v.expense), savings_rate_pct: v.income > 0 ? Math.round(((v.income - v.expense) / v.income) * 100) : null })) };
    },
  },
  {
    name: "account_balances", strict: true, description: "Saldo actual de cada cuenta del usuario y el total.", input_schema: obj({}, []),
    handler: async (_a, c) => {
      const [{ data: accs }, { data: bal }] = await Promise.all([c.db.from("accounts").select("id, name, type").eq("archived", false), c.db.from("account_balances").select("account_id, balance_cents")]);
      const b = new Map((bal ?? []).map((x: { account_id: string; balance_cents: number }) => [x.account_id, Number(x.balance_cents)]));
      const rows = (accs ?? []).map((x: { id: string; name: string; type: string }) => ({ name: x.name, type: x.type, balance_cop: pesos(b.get(x.id) ?? 0) }));
      return { accounts: rows, total_cop: rows.reduce((s: number, r: { balance_cop: number }) => s + r.balance_cop, 0) };
    },
  },
  {
    name: "upcoming_bills", strict: true,
    description: "Pagos e ingresos fijos que vencen en los próximos N días.",
    input_schema: obj({ days: { type: "integer", description: "1 a 60" } }, ["days"]),
    handler: async (a, c) => {
      const { days } = z.object({ days: z.number().int().min(1).max(60) }).parse(a);
      const { data } = await c.db.from("recurring_rules").select("id, name, type, amount_cents, amount_is_estimate, frequency, interval_days, next_date, end_date, remind_days_before, active").eq("active", true);
      const ev = upcomingEvents((data ?? []) as RuleLite[], c.today, addDaysISO(c.today, days), 4);
      return { events: ev.slice(0, 30).map((e) => ({ date: e.date, name: e.name, type: e.type, amount_cop: pesos(e.amountCents), estimated: e.estimate, overdue: e.overdue })) };
    },
  },
  {
    name: "budget_status", strict: true,
    description: "Cómo va cada presupuesto por categoría en un mes (YYYY-MM): límite, gastado, porcentaje y alerta.",
    input_schema: obj({ month: { type: "string", description: "Mes YYYY-MM" } }, ["month"]),
    handler: async (a, c) => {
      const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(a);
      const from = `${month}-01`, to = `${month}-31`;
      const [{ data: bs }, names, spent] = await Promise.all([c.db.from("budgets").select("category_id, amount_cents").eq("period_month", from), categoryNames(c.db), txs(c.db, from, to)]);
      const by = new Map<string, number>(); for (const t of spent) if (t.type === "expense" && t.category_id) by.set(t.category_id, (by.get(t.category_id) ?? 0) + t.amount_cents);
      return { month, budgets: (bs ?? []).map((b: { category_id: string; amount_cents: number }) => { const s = budgetStatus(by.get(b.category_id) ?? 0, Number(b.amount_cents)); return { category: names.get(b.category_id) ?? "?", limit_cop: pesos(Number(b.amount_cents)), spent_cop: pesos(by.get(b.category_id) ?? 0), percent: s.percent, level: s.level }; }) };
    },
  },
  {
    name: "debts_summary", strict: true, description: "Deudas activas: saldo, tasa E.A., cuota, cuotas restantes con el plan actual y total.", input_schema: obj({}, []),
    handler: async (_a, c) => {
      const { data } = await c.db.from("debts").select("name, balance_cents, annual_rate, installment_cents, next_due_date").eq("active", true);
      const rows = (data ?? []).map((d: { name: string; balance_cents: number; annual_rate: number | null; installment_cents: number | null; next_due_date: string | null }) => {
        const plan = d.installment_cents ? monthsToPayOff(Number(d.balance_cents), Number(d.annual_rate ?? 0), Number(d.installment_cents)) : null;
        return { name: d.name, balance_cop: pesos(Number(d.balance_cents)), annual_rate_ea_pct: d.annual_rate, installment_cop: d.installment_cents ? pesos(Number(d.installment_cents)) : null, months_left: plan && !plan.neverPaid ? plan.months : null, payment_does_not_cover_interest: plan?.neverPaid ?? false, next_due_date: d.next_due_date };
      });
      return { debts: rows, total_cop: rows.reduce((s: number, r: { balance_cop: number }) => s + r.balance_cop, 0) };
    },
  },
  {
    name: "goals_summary", strict: true, description: "Metas de ahorro activas: ahorrado, objetivo, fecha y cuota mensual sugerida.", input_schema: obj({}, []),
    handler: async (_a, c) => {
      const { data } = await c.db.from("savings_goals").select("name, target_cents, saved_cents, target_date").eq("status", "active");
      const now = new Date(c.today + "T12:00:00");
      return { goals: (data ?? []).map((g: { name: string; target_cents: number; saved_cents: number; target_date: string }) => { const p = goalProgress(Number(g.target_cents), Number(g.saved_cents), g.target_date, now); return { name: g.name, saved_cop: pesos(Number(g.saved_cents)), target_cop: pesos(Number(g.target_cents)), target_date: g.target_date, percent: p.percent, suggested_monthly_cop: pesos(p.monthlyContributionCents), overdue: p.overdue }; }) };
    },
  },
  {
    name: "fixed_commitments", strict: true, description: "Ingresos y egresos fijos registrados, en equivalente mensual.", input_schema: obj({}, []),
    handler: async (_a, c) => {
      const { data } = await c.db.from("recurring_rules").select("name, type, amount_cents, frequency, interval_days").eq("active", true);
      const rows = (data ?? []).map((r: { name: string; type: string; amount_cents: number; frequency: string; interval_days: number | null }) => ({ name: r.name, type: r.type, monthly_cop: pesos(monthlyEquivalent(Number(r.amount_cents), r.frequency as Frequency, r.interval_days)) }));
      const sum = (t: string) => rows.filter((r: { type: string }) => r.type === t).reduce((s: number, r: { monthly_cop: number }) => s + r.monthly_cop, 0);
      return { items: rows.slice(0, 40), monthly_income_cop: sum("income"), monthly_expense_cop: sum("expense") };
    },
  },
];

const MAX_RESULT_CHARS = 8000;
/** Ejecuta una herramienta pedida por el modelo. Nunca lanza: los errores vuelven como texto para que el modelo pueda corregirse. */
export async function runTool(name: string, args: unknown, c: ToolCtx): Promise<{ content: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: `Herramienta desconocida: ${name}`, isError: true };
  try {
    const out = JSON.stringify(await tool.handler(args, c));
    return { content: out.length > MAX_RESULT_CHARS ? out.slice(0, MAX_RESULT_CHARS) + '… [resultado recortado]' : out, isError: false };
  } catch (e) {
    if (e instanceof z.ZodError) return { content: `Argumentos inválidos: ${e.issues.map((i) => i.message).join("; ")}`, isError: true };
    return { content: "No se pudo consultar ese dato.", isError: true };
  }
}

/** Definiciones para la API (sin el handler). */
export const apiTools = () => TOOLS.map(({ name, description, input_schema, strict }) => ({ name, description, input_schema: input_schema as { type: "object" }, strict }));
