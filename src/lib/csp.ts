/**
 * Content-Security-Policy con nonce por petición. `strict-dynamic` deja ejecutar solo los scripts que lleven el nonce (los de Next)
 * y los que estos carguen; cualquier script inyectado por un atacante queda bloqueado. Los estilos permiten 'unsafe-inline'
 * porque Tailwind y Next los inyectan en línea (el riesgo de estilos es mucho menor que el de scripts).
 */
export function buildCsp(nonce: string, opts: { dev?: boolean; supabaseUrl?: string } = {}): string {
  let supabase = "https://*.supabase.co wss://*.supabase.co";
  try { if (opts.supabaseUrl) { const u = new URL(opts.supabaseUrl); supabase = `${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`; } } catch { /* URL inválida: se usa el comodín */ }
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, ...(opts.dev ? ["ws:", "http:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Los botones «Conectar Gmail/Outlook» envían un formulario que redirige a Google/Microsoft: Chrome aplica form-action también a esa redirección.
    "form-action": ["'self'", "https://accounts.google.com", "https://login.microsoftonline.com"],
    "frame-ancestors": ["'none'"],
  };
  const out = Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) out.push("upgrade-insecure-requests");
  return out.join("; ");
}

/** Nonce aleatorio de 128 bits (base64). Funciona en el runtime Edge del middleware. */
export const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
