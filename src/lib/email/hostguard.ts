import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Direcciones que un servidor público jamás debe contactar por orden de un usuario (SSRF): privadas, loopback, link-local, metadatos de nube… */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));      // IPv4 mapeada
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");   // únicas locales, link-local, multicast
  }
  return true; // lo que no es una IP válida no se acepta
}

export class HostError extends Error {}
type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (h) => (await lookup(h, { all: true })).map((r) => r.address);

/**
 * Valida un servidor IMAP indicado por el usuario y devuelve la IP ya resuelta para conectarse a ESA IP
 * (con SNI = nombre original): así un DNS que cambie después de validar no puede redirigirnos a la red interna.
 */
export async function resolvePublicHost(host: string, resolve: Resolver = defaultResolver): Promise<{ host: string; ip: string }> {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || /[\s/@:?#]/.test(h)) throw new HostError("Servidor inválido");
  if (h === "localhost" || /\.(local|internal|localdomain|lan|home|corp)$/.test(h)) throw new HostError("El servidor debe ser público");
  const addrs = isIP(h) ? [h] : await resolve(h).catch(() => []);
  if (!addrs.length) throw new HostError("No se pudo resolver el servidor");
  if (addrs.some(isPrivateAddress)) throw new HostError("El servidor debe ser público");
  return { host: h, ip: addrs[0] };
}

export const IMAP_PORT = 993; // solo TLS implícito
