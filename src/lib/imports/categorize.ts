import { normalizeText } from "./parse";

export interface MerchantRule { pattern: string; categoryId: string | null; own: boolean }

/** Categoría por coincidencia del comercio dentro de la descripción. Reglas propias antes que globales; gana el patrón más largo. */
export function categorizeByMerchants(description: string, rules: MerchantRule[]): string | null {
  const text = ` ${normalizeText(description)} `;
  let best: MerchantRule | null = null;
  for (const r of rules) {
    const p = normalizeText(r.pattern);
    if (!p || !r.categoryId) continue;
    // Palabra completa siempre; por subcadena solo patrones largos (los bancos pegan palabras: "COMPRARAPPI"), así "eps" no coincide con "repsol".
    const matches = text.includes(` ${p} `) || (p.length >= 5 && text.includes(p));
    if (!matches) continue;
    if (!best || (r.own && !best.own) || (r.own === best.own && p.length > normalizeText(best.pattern).length)) best = r;
  }
  return best?.categoryId ?? null;
}

/** Busca una categoría por nombre (exacto, luego por contención) sin distinguir tildes ni mayúsculas. */
export function matchCategoryByName(name: string | null | undefined, categories: { id: string; name: string }[]): string | null {
  if (!name) return null;
  const n = normalizeText(name);
  if (!n) return null;
  return categories.find((c) => normalizeText(c.name) === n)?.id
    ?? categories.find((c) => normalizeText(c.name).includes(n) || n.includes(normalizeText(c.name)))?.id ?? null;
}
