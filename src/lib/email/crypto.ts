import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de secretos (refresh tokens, contraseñas IMAP) con AES-256-GCM.
 * Formato: "v1:" + base64(iv 12 B | tag 16 B | texto cifrado). El prefijo permite rotar el esquema más adelante.
 * `aad` (datos autenticados adicionales) ata el secreto a su dueño: un blob copiado a otra fila no se puede descifrar.
 */
const VERSION = "v1";

export function loadKey(b64 = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY no está configurada");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32)");
  return key;
}

export function encryptSecret(plain: string, aad: string, key = loadKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${VERSION}:${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64")}`;
}

export function decryptSecret(blob: string, aad: string, key = loadKey()): string {
  const [v, data] = blob.split(":");
  if (v !== VERSION || !data) throw new Error("Formato de secreto no soportado");
  const raw = Buffer.from(data, "base64");
  if (raw.length < 29) throw new Error("Secreto corrupto");
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");   // lanza si fue alterado o el aad no coincide
}
