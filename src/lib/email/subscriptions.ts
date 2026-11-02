import { normalizeText } from "@/lib/imports/parse";

export interface ChargeLite { id: string; amountCents: number; date: string; merchant?: string | null; description?: string | null }
export type Cadence = "weekly" | "monthly" | "annual";
export interface RecurringCandidate {
  key: string; name: string; cadence: Cadence; amountCents: number; occurrences: number; lastId: string; lastDate: string; nextDate: string;
  priceChange: { fromCents: number; toCents: number } | null;
}
export interface DuplicateCharge { name: string; amountCents: number; dates: string[] }

const days = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const addDays = (iso: string, n: number) => new Date((days(iso) + n) * 86_400_000).toISOString().slice(0, 10);

/** Clave estable del comercio: primeras palabras significativas, sin números ni referencias. */
export function merchantKey(c: Pick<ChargeLite, "merchant" | "description">): string {
  return normalizeText(c.merchant || c.description || "").split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 3).join(" ");
}

function cadenceOf(gap: number): Cadence | null {
  if (gap >= 6 && gap <= 8) return "weekly";
  if (gap >= 26 && gap <= 35) return "monthly";
  if (gap >= 350 && gap <= 380) return "annual";
  return null;
}

/**
 * Cobros que se repiten con un ritmo regular y un valor estable. Excluye los que el usuario ya registró como fijo.
 * Señala subidas de precio (el último cobro difiere más de 5 % del típico).
 */
export function detectRecurring(charges: ChargeLite[], knownRuleNames: string[] = []): RecurringCandidate[] {
  const known = knownRuleNames.map((n) => normalizeText(n)).filter(Boolean);
  const groups = new Map<string, ChargeLite[]>();
  for (const c of charges) { const k = merchantKey(c); if (k) groups.set(k, [...(groups.get(k) ?? []), c]); }
  const out: RecurringCandidate[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;
    if (known.some((n) => n.includes(key) || key.includes(n))) continue;
    const gaps = sorted.slice(1).map((c, i) => days(c.date) - days(sorted[i].date));
    const cadence = cadenceOf(median(gaps));
    if (!cadence || (cadence !== "annual" && sorted.length < 3)) continue;
    const regular = gaps.filter((g) => cadenceOf(g) === cadence).length / gaps.length;
    if (regular < 0.7) continue;
    // La estabilidad se exige sobre los cobros ANTERIORES: así una subida de precio no sirve de excusa para aceptar
    // compras con montos que ya eran dispares (p. ej. el mercado).
    const prior = sorted.slice(0, -1);
    const typical = median(prior.map((c) => c.amountCents));
    const priorStable = prior.filter((c) => Math.abs(c.amountCents - typical) / typical <= 0.15).length / prior.length;
    if (priorStable < 0.7) continue;
    const last = sorted[sorted.length - 1];
    const drift = Math.abs(last.amountCents - typical) / typical;
    if (drift > 0.5) continue;               // un salto así no es una subida de precio: es otra cosa
    const changed = drift > 0.05;
    const step = cadence === "weekly" ? 7 : cadence === "monthly" ? 30 : 365;
    out.push({
      key, name: (sorted[0].merchant || sorted[0].description || key).trim(), cadence, amountCents: last.amountCents, occurrences: sorted.length,
      lastId: last.id, lastDate: last.date, nextDate: addDays(last.date, step), priceChange: changed ? { fromCents: Math.round(typical), toCents: last.amountCents } : null,
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

/** Mismo comercio y mismo valor en menos de 4 días: posible cobro duplicado. */
export function detectDuplicateCharges(charges: ChargeLite[]): DuplicateCharge[] {
  const byKey = new Map<string, ChargeLite[]>();
  for (const c of charges) { const k = `${merchantKey(c)}|${c.amountCents}`; if (merchantKey(c)) byKey.set(k, [...(byKey.get(k) ?? []), c]); }
  const out: DuplicateCharge[] = [];
  for (const list of byKey.values()) {
    const s = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const close = s.filter((c, i) => (i > 0 && days(c.date) - days(s[i - 1].date) < 4) || (i < s.length - 1 && days(s[i + 1].date) - days(c.date) < 4));
    if (close.length >= 2) out.push({ name: (close[0].merchant || close[0].description || "").trim(), amountCents: close[0].amountCents, dates: close.map((c) => c.date) });
  }
  return out;
}
