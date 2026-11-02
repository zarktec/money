import { formatMoney } from "@/lib/finance/money";

/** «Ilimitado» se guarda como un tope muy alto: así la base de datos y el código (que comparan contra un número) funcionan igual. */
export const UNLIMITED = 1_000_000;

/** Límites que el administrador puede configurar por plan, en el orden en que se muestran. */
export const LIMIT_FIELDS = [
  { key: "accounts", label: "Cuentas", hint: "Cuentas de dinero (efectivo, banco, tarjeta…)" },
  { key: "projects", label: "Proyectos", hint: "Proyectos activos" },
  { key: "goals", label: "Metas de ahorro", hint: "Metas activas al mismo tiempo" },
  { key: "email_connections", label: "Cuentas de correo", hint: "Gmail, Outlook o IMAP conectadas. 0 = sin lectura de correo" },
  { key: "ai_requests_month", label: "Consultas con IA al mes", hint: "Recibos, extractos, correo y asistente. Tienen costo por uso" },
] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const LABELS: Record<string, (n: number) => string | null> = {
  accounts: (n) => (n >= UNLIMITED ? "Cuentas ilimitadas" : plural(n, "cuenta", "cuentas")),
  projects: (n) => (n >= UNLIMITED ? "Proyectos ilimitados" : plural(n, "proyecto", "proyectos")),
  goals: (n) => (n >= UNLIMITED ? "Metas de ahorro ilimitadas" : plural(n, "meta de ahorro activa", "metas de ahorro activas")),
  email_connections: (n) => (n >= UNLIMITED ? "Lectura de correo: cuentas ilimitadas (Gmail, Outlook o IMAP)" : n > 0 ? `Lectura de correo: ${plural(n, "cuenta", "cuentas")} (Gmail, Outlook o IMAP)` : null),
  ai_requests_month: (n) => (n >= UNLIMITED ? "Consultas con IA ilimitadas (recibos, extractos, correo y asistente)" : `${n} consultas con IA al mes (recibos, extractos, correo y asistente)`),
};

/** Límites de un plan en frases para mostrar. Las claves desconocidas se ignoran; 0 en correo no se muestra. */
export function describeLimits(limits: Record<string, unknown> | null | undefined): string[] {
  return Object.entries(LABELS).flatMap(([k, f]) => { const v = limits?.[k]; const t = typeof v === "number" && v >= 0 ? f(v) : null; return t ? [t] : []; });
}

export const priceLabel = (cents: number, interval: string, currency = "COP") =>
  cents <= 0 ? "Gratis" : `${formatMoney(cents, currency)} / ${interval === "year" ? "año" : interval === "lifetime" ? "único pago" : "mes"}`;

/** Ahorro del plan anual frente a pagar 12 meses del mensual, en %. 0 si no hay ahorro. */
export const yearlySavingsPercent = (monthlyCents: number, yearlyCents: number) =>
  monthlyCents > 0 && yearlyCents > 0 ? Math.max(0, Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100)) : 0;
