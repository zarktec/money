import { headers } from "next/headers";

/** URL pública de la app: la variable de entorno si existe; si no, la del propio request (así los enlaces de los correos nunca salen como "undefined/…"). */
export async function appUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
