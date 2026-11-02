/** Los montos viajan siempre como enteros en unidades menores (centavos). */
export type Cents = number;

export const toCents = (amount: number): Cents => Math.round(amount * 100);
export const fromCents = (cents: Cents): number => cents / 100;

export function formatMoney(cents: Cents, currency = "COP", locale = "es-CO"): string {
  const digits = currency === "COP" ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fromCents(cents));
}

/** Interpreta texto de usuario ("1.250.000", "1,250,000.50", "$ 45 mil") a centavos. */
export function parseMoneyInput(input: string): Cents | null {
  let s = input.trim().toLowerCase().replace(/[$\s]|cop/g, "");
  let mult = 1;
  if (/(mil|k)$/.test(s)) { mult = 1_000; s = s.replace(/(mil|k)$/, ""); }
  else if (/(millones|millon|m)$/.test(s)) { mult = 1_000_000; s = s.replace(/(millones|millon|m)$/, ""); }
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  if (sep >= 0) {
    const decimals = s.length - sep - 1;
    if (decimals === 3 || decimals === 0) s = s.replace(/[.,]/g, "");         // separador de miles
    else s = s.slice(0, sep).replace(/[.,]/g, "") + "." + s.slice(sep + 1);   // decimal
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? toCents(n * mult) : null;
}
