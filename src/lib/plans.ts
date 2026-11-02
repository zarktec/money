import { formatMoney } from "@/lib/finance/money";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const LABELS: Record<string, (n: number) => string | null> = {
  accounts: (n) => plural(n, "cuenta", "cuentas"),
  projects: (n) => plural(n, "proyecto", "proyectos"),
  goals: (n) => plural(n, "meta de ahorro activa", "metas de ahorro activas"),
  email_connections: (n) => (n > 0 ? `Lectura de correo: ${plural(n, "cuenta", "cuentas")} (Gmail, Outlook o IMAP)` : null),
  ai_requests_month: (n) => `${n} consultas con IA al mes (recibos, extractos, correo y asistente)`,
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
