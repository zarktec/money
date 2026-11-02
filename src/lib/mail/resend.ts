import "server-only";

export interface MailInput { to: string; subject: string; html: string; text: string; idempotencyKey?: string }
export type MailResult = { ok: true; id: string } | { ok: false; transient: boolean; error: string };

/** ¿Están las variables de Resend? Si no, los envíos se omiten sin error. */
export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

/** Dirección a la que se escriben los avisos para darse de baja. */
const unsubscribeUrl = () => `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/cuenta/notificaciones`;

/**
 * Envía un correo por la API de Resend (sin SDK: una sola llamada HTTP).
 * `transient` = vale la pena reintentar (límite de uso, caída de Resend o de red); un rechazo permanente (dirección inválida, dominio sin verificar) no.
 * `idempotencyKey` evita enviar dos veces si el mismo envío se repite.
 */
export async function sendMail(m: MailInput): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, transient: false, error: "Resend no configurado" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl()}>` },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && body.id) return { ok: true, id: body.id };
    return { ok: false, transient: res.status === 429 || res.status >= 500, error: `${res.status} ${body.message ?? ""}`.trim() };
  } catch (e) {
    return { ok: false, transient: true, error: e instanceof Error ? e.message : "error de red" };
  }
}
