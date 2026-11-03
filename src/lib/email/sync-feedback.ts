import type { SyncStats } from "./sync";

export type SyncCode = "ok" | "empty" | "ia" | "reconectar" | "cuota" | "parcial" | "error";
export interface SyncFeedback { code: SyncCode; n?: number; i?: number }

/** Resume el resultado de «Sincronizar ahora» en un código corto (va en la URL; el texto se arma al mostrarlo, así la URL no puede usarse para escribir mensajes). */
export function syncFeedback(r: SyncStats | { skipped: string } | Error): SyncFeedback {
  if (r instanceof Error) return { code: r.name === "ProviderAuthError" ? "reconectar" : "error" };
  if ("skipped" in r) return { code: /IA/.test(r.skipped) ? "ia" : "reconectar" };
  if (r.authError) return { code: "reconectar" };
  if (r.quotaExhausted) return { code: "cuota", n: r.created };
  if (r.incomplete) return { code: "parcial", n: r.created, i: r.ignored };
  if (r.created === 0 && r.processed === 0 && r.ignored === 0) return { code: "empty" };
  return { code: "ok", n: r.created, i: r.ignored };
}

export function syncText(code: string, n = 0, i = 0): { tone: "ok" | "warn" | "error"; text: string } | null {
  const mov = `${n} movimiento${n === 1 ? "" : "s"} nuevo${n === 1 ? "" : "s"}`;
  switch (code) {
    case "ok": return { tone: "ok", text: `Listo: ${mov} para revisar y ${i} correo${i === 1 ? "" : "s"} descartado${i === 1 ? "" : "s"}.` };
    case "empty": return { tone: "ok", text: "Revisamos tu correo y no hay mensajes nuevos de movimientos." };
    case "parcial": return { tone: "warn", text: `Leímos una parte del correo (${mov}). Vuelve a pulsar «Sincronizar ahora» para seguir con el resto.` };
    case "cuota": return { tone: "warn", text: `Llegaste al límite mensual de consultas con IA de tu plan (${mov}). Los correos pendientes se leerán cuando se renueve o mejores tu plan.` };
    case "ia": return { tone: "error", text: "La lectura con IA aún no está configurada en este sitio (falta la clave de Anthropic). Avísale al administrador." };
    case "reconectar": return { tone: "error", text: "Tu cuenta de correo necesita reconectarse. Desconéctala y vuelve a conectarla." };
    case "error": return { tone: "error", text: "No pudimos conectar con tu proveedor de correo. Inténtalo de nuevo en unos minutos." };
    default: return null;
  }
}
