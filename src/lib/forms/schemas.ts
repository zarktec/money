import { z } from "zod";
import { parseMoneyInput } from "@/lib/finance/money";

export const FREQUENCIES = ["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"] as const;
export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  weekly: "Cada semana", biweekly: "Cada 2 semanas", monthly: "Cada mes", bimonthly: "Cada 2 meses",
  quarterly: "Cada trimestre", semiannual: "Cada semestre", annual: "Cada año",
};

const emptyToNull = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional().transform((v) => v ?? null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const amount = z.string().transform((s, ctx) => {
  const c = parseMoneyInput(s);
  if (c === null || c <= 0) { ctx.addIssue({ code: "custom", message: "Ingresa un monto válido" }); return z.NEVER; }
  return c;
});

export const txSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount,
  occurred_on: isoDate,
  account_id: z.string().min(1, "Elige una cuenta"),
  to_account_id: emptyToNull,
  category_id: emptyToNull,
  income_type_id: emptyToNull,
  project_id: emptyToNull,
  description: emptyToNull,
  notes: emptyToNull,
  repeat: z.enum(["none", ...FREQUENCIES]).default("none"),
}).superRefine((v, ctx) => {
  if (v.type === "transfer") {
    if (!v.to_account_id) ctx.addIssue({ code: "custom", message: "Elige la cuenta destino", path: ["to_account_id"] });
    else if (v.to_account_id === v.account_id) ctx.addIssue({ code: "custom", message: "Origen y destino deben ser distintos", path: ["to_account_id"] });
  }
});

export const ruleSchema = z.object({
  type: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Ponle un nombre"),
  amount,
  amount_is_estimate: z.string().optional().transform((v) => v === "on"),
  frequency: z.enum(FREQUENCIES),
  next_date: isoDate,
  account_id: z.string().min(1, "Elige una cuenta"),
  category_id: emptyToNull,
  income_type_id: emptyToNull,
  platform_id: emptyToNull,
  auto_register: z.string().optional().transform((v) => v === "on"),
  remind_days_before: z.coerce.number().int().min(0).max(30).default(3),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la cuenta").max(60),
  type: z.enum(["cash", "checking", "savings", "credit_card", "wallet", "investment", "other"]),
  bank_id: emptyToNull,
  opening_balance: z.string().optional().transform((s, ctx) => {
    if (!s || !s.trim()) return 0;
    const neg = s.trim().startsWith("-");
    const c = parseMoneyInput(s.replace("-", ""));
    if (c === null) { ctx.addIssue({ code: "custom", message: "Saldo inicial inválido" }); return z.NEVER; }
    return neg ? -c : c;
  }),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  essential: z.string().optional().transform((v) => v === "on"),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la meta").max(80),
  target: amount,
  target_date: isoDate,
  project_id: emptyToNull,
  account_id: emptyToNull,
});

export const contributionSchema = z.object({
  goal_id: z.string().min(1),
  kind: z.enum(["deposit", "withdraw"]).default("deposit"),
  amount,
  contributed_on: isoDate,
  note: emptyToNull,
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al proyecto").max(80),
  description: emptyToNull,
  budget: z.string().optional().transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const c = parseMoneyInput(s);
    if (c === null || c <= 0) { ctx.addIssue({ code: "custom", message: "Presupuesto inválido" }); return z.NEVER; }
    return c;
  }),
  end_date: emptyToNull,
});

export const budgetSchema = z.object({
  category_id: z.string().min(1, "Elige una categoría"),
  amount,
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const payRuleSchema = z.object({
  id: z.string().min(1),
  due: isoDate,
  paid_on: isoDate,
  amount: z.string().optional().transform((s, ctx) => {
    if (!s || !s.trim()) return null;           // vacío = usar el monto de la regla
    const c = parseMoneyInput(s);
    if (c === null || c <= 0) { ctx.addIssue({ code: "custom", message: "Monto inválido" }); return z.NEVER; }
    return c;
  }),
});

export interface FormState { error?: string; ok?: boolean }
