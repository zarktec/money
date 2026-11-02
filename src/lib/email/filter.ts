import { normalizeText } from "@/lib/imports/parse";

export interface EmailMeta { from: string; subject: string; snippet?: string; listUnsubscribe?: boolean }

/** Dominio del remitente: "Bancolombia <alertas@notificaciones.bancolombia.com.co>" → notificaciones.bancolombia.com.co */
export function senderDomain(from: string): string {
  const m = from.match(/<([^>]+)>/)?.[1] ?? from;
  return (m.split("@")[1] ?? "").trim().toLowerCase().replace(/[>\s].*$/, "");
}
export const isKnownSender = (domain: string, known: string[]) => !!domain && known.some((d) => domain === d || domain.endsWith("." + d));

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));
// Palabras ya normalizadas (sin tildes, minúsculas). "Fuertes" bastan por sí solas; "débiles" requieren un remitente conocido.
const STRONG = ["comprobante", "recibo de", "factura", "compra aprobada", "compra exitosa", "transaccion", "pago exitoso", "pago recibido", "pago aprobado", "cobro", "debito", "transferencia", "abono", "retiro", "tu suscripcion", "renovacion", "consumo"];
const WEAK = ["pago", "compra", "recibo", "suscripcion", "renov", "factura", "enviaste", "recibiste", "total"];
const NEGATIVE = ["oferta", "descuento", "promocion", "promo", "newsletter", "boletin", "aprovecha", "black friday", "cyber", "gana ", "sorteo", "encuesta", "te invitamos", "no te pierdas", "% off", "cupon"];
const SECURITY = ["codigo de verificacion", "codigo de seguridad", "clave dinamica", "otp", "restablec", "cambio de contrasena", "inicio de sesion", "nuevo dispositivo", "verifica tu"];
const FUTURE = ["recordatorio", "vence el", "proxima factura", "proximo pago", "pago pendiente", "fecha limite"];

/**
 * Decide si un correo merece gastar una llamada de IA. Es el filtro que mantiene el costo bajo y la privacidad alta:
 * la gran mayoría del buzón (promociones, códigos, conversaciones) nunca sale de aquí.
 */
export function shouldProcessEmail(m: EmailMeta, knownDomains: string[]): { process: boolean; reason: string } {
  const subject = normalizeText(m.subject);
  const text = `${subject} ${normalizeText(m.snippet ?? "")}`;
  if (has(subject, SECURITY)) return { process: false, reason: "seguridad" };
  const known = isKnownSender(senderDomain(m.from), knownDomains);
  const strong = has(text, STRONG), negative = has(subject, NEGATIVE);
  if (negative && !(known && strong)) return { process: false, reason: "promocional" };
  if (m.listUnsubscribe && !strong) return { process: false, reason: "boletín" };
  if (has(subject, FUTURE) && !has(text, ["aprobad", "exitos", "realizad", "recibid"])) return { process: false, reason: "pago futuro" };
  if (known && (strong || has(text, WEAK))) return { process: true, reason: "remitente conocido" };
  if (strong) return { process: true, reason: "palabras de transacción" };
  return { process: false, reason: "sin señales" };
}
