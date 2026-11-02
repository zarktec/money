import { LIMIT_FIELDS, UNLIMITED } from "./plans";

export interface PlanInput {
  name: string; description: string | null; price_cents: number; trial_days: number; active: boolean; sort_order: number;
  limits: Record<string, unknown>; features: string[];
}
type Form = { get(k: string): FormDataEntryValue | null };
export type PlanParse = { ok: true; value: PlanInput } | { ok: false; error: string };

const plain = (raw: FormDataEntryValue | null) => { const t = String(raw ?? "").trim(); return t === "" ? NaN : Number(t); };
/** Acepta separadores de miles colombianos («19.900», «$ 1 000»). */
const whole = (raw: FormDataEntryValue | null) => { const t = String(raw ?? "").replace(/[\s.$]/g, "").replace(",", "."); return t === "" ? NaN : Number(t); };

/**
 * Convierte el formulario del plan en datos válidos. Los límites que el formulario no maneja se conservan tal cual
 * (para no borrar claves que otra parte del sistema haya agregado).
 */
export function parsePlanForm(fd: Form, existingLimits: unknown): PlanParse {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "El nombre del plan es obligatorio." };
  if (name.length > 60) return { ok: false, error: "El nombre no puede pasar de 60 caracteres." };
  const description = String(fd.get("description") ?? "").trim();
  if (description.length > 200) return { ok: false, error: "La descripción no puede pasar de 200 caracteres." };

  const pesos = whole(fd.get("price"));
  if (!Number.isFinite(pesos) || pesos < 0 || pesos > 100_000_000) return { ok: false, error: "El precio debe ser un valor en pesos entre 0 y 100.000.000." };
  const trial = plain(fd.get("trial_days"));
  const trialDays = Number.isNaN(trial) ? 0 : trial;
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return { ok: false, error: "Los días de prueba deben ser un número entero entre 0 y 365." };
  const order = plain(fd.get("sort_order"));
  const sortOrder = Number.isNaN(order) ? 0 : order;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) return { ok: false, error: "El orden debe ser un número entero entre 0 y 999." };

  const limits: Record<string, unknown> = existingLimits && typeof existingLimits === "object" && !Array.isArray(existingLimits) ? { ...(existingLimits as Record<string, unknown>) } : {};
  for (const f of LIMIT_FIELDS) {
    if (fd.get(`${f.key}__unlimited`) === "on") { limits[f.key] = UNLIMITED; continue; }
    const n = whole(fd.get(`limit_${f.key}`));
    if (!Number.isInteger(n) || n < 0 || n >= UNLIMITED) return { ok: false, error: `${f.label}: escribe un número entero desde 0 (o marca «Ilimitado»).` };
    limits[f.key] = n;
  }

  const features = String(fd.get("features") ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (features.length > 12) return { ok: false, error: "Máximo 12 beneficios." };
  if (features.some((f) => f.length > 100)) return { ok: false, error: "Cada beneficio puede tener hasta 100 caracteres." };

  return { ok: true, value: { name, description: description || null, price_cents: Math.round(pesos * 100), trial_days: trialDays, active: fd.get("active") === "on", sort_order: sortOrder, limits, features } };
}
