import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

const PUBLIC = ["/", "/login", "/registro", "/recuperar", "/precios", "/privacidad", "/terminos", "/auth"];
const isPublic = (p: string) => PUBLIC.some((x) => p === x || (x !== "/" && p.startsWith(x + "/")));

const NOT_CONFIGURED = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Money</title>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 1.25rem;text-align:center;color:#0f172a"><h1>Money</h1>
<p>La aplicación aún no está configurada: falta conectar la base de datos.</p><p style="color:#64748b;font-size:.9rem">Si eres el administrador, revisa las variables de entorno del despliegue.</p></body></html>`;

export async function middleware(req: NextRequest) {
  // Sin Supabase configurado todo fallaría con un error confuso: se muestra un aviso claro (sin detalles internos).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new NextResponse(NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  // CSP con nonce por petición: se envía al navegador y TAMBIÉN en la petición, para que Next ponga el nonce en sus scripts.
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const withCsp = (r: NextResponse) => { r.headers.set("content-security-policy", csp); return r; };

  let res = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        requestHeaders.set("cookie", req.headers.get("cookie") ?? "");        // la petición que ve la app ya lleva la sesión renovada
        res = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(url));
  }
  if (user && (pathname === "/login" || pathname === "/registro")) {
    const url = req.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return withCsp(NextResponse.redirect(url));
  }
  return withCsp(res);
}

export const config = {
  matcher: ["/((?!api/wompi/webhook|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
