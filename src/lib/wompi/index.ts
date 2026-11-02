import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const WOMPI_API = process.env.WOMPI_API_URL ?? "https://sandbox.wompi.co/v1";

/** Firma de integridad para el Web Checkout: SHA256(reference + amountInCents + currency + integritySecret). */
export function integritySignature(reference: string, amountInCents: number, currency: string): string {
  return sha256(`${reference}${amountInCents}${currency}${process.env.WOMPI_INTEGRITY_SECRET}`);
}

export interface WompiEvent {
  event: string;
  data: { transaction?: { id: string; reference: string; status: string; amount_in_cents: number; currency: string; payment_method_type?: string; payment_source_id?: number | null; customer_email?: string } } & Record<string, unknown>;
  environment: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at: string;
}

const getPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);

/** Verifica el checksum del evento: SHA256(valores de signature.properties + timestamp + events secret). */
export function verifyEvent(evt: WompiEvent, secret = process.env.WOMPI_EVENTS_SECRET): boolean {
  if (!secret || !evt?.signature?.checksum) return false;
  const values = evt.signature.properties.map((p) => String(getPath(evt.data, p) ?? "")).join("");
  const expected = sha256(`${values}${evt.timestamp}${secret}`);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(evt.signature.checksum.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Referencia única y trazable por usuario/plan. */
export const newReference = (userId: string, planCode: string) =>
  `money-${planCode}-${userId.slice(0, 8)}-${Date.now()}`;
