#!/usr/bin/env node
// Prueba de humo en un navegador real (Chromium, tamaño de celular) contra un servidor ya levantado.
// Uso: node scripts/smoke.mjs [URL_BASE] [carpeta_capturas]   — requiere Playwright instalado (no es dependencia del proyecto).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright no es dependencia del proyecto: se busca en el proyecto y, si no, en la instalación global (CommonJS respeta NODE_PATH).
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { console.error("Falta Playwright: npm i -D playwright (o instálalo globalmente)."); process.exit(2); } }

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "./smoke-shots";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✔" : "✘"} ${name}${!ok && detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: "es-CO" });
const page = await ctx.newPage();

const problems = [];
page.on("console", (m) => { const t = m.text(); if (m.type() === "error" || /Content Security Policy|Refused to/i.test(t)) problems.push(`[console ${m.type()}] ${t}`); });
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

const PAGES = [["/", "inicio"], ["/login", "login"], ["/registro", "registro"], ["/recuperar", "recuperar"], ["/precios", "precios"], ["/privacidad", "privacidad"], ["/terminos", "terminos"]];
for (const [path, name] of PAGES) {
  problems.length = 0;
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  check(`${path}: responde 200`, res?.status() === 200, `status ${res?.status()}`);
  const h = res?.headers() ?? {};
  check(`${path}: CSP con nonce, sin unsafe-inline en scripts`, /script-src[^;]*'nonce-[^']+'/.test(h["content-security-policy"] ?? "") && !/script-src[^;]*unsafe-inline/.test(h["content-security-policy"] ?? ""), h["content-security-policy"]);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  check(`${path}: sin errores de consola ni violaciones de CSP`, problems.length === 0, problems.join(" | "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${path}: sin desplazamiento horizontal en móvil`, overflow <= 0, `${overflow}px`);
}

// Cabeceras fijas
const h = (await page.goto(BASE + "/login")).headers();
check("cabecera HSTS", /max-age=\d+/.test(h["strict-transport-security"] ?? ""));
check("cabecera X-Frame-Options DENY", h["x-frame-options"] === "DENY");
check("cabecera nosniff", h["x-content-type-options"] === "nosniff");
check("cabecera Referrer-Policy", !!h["referrer-policy"]);
check("cabecera Permissions-Policy (cámara cerrada, micrófono propio)", /camera=\(\)/.test(h["permissions-policy"] ?? "") && /microphone=\(self\)/.test(h["permissions-policy"] ?? ""));
check("no revela X-Powered-By", !h["x-powered-by"]);

// La CSP REALMENTE bloquea código inyectado. Se simula un XSS de verdad: se altera la respuesta HTML de la página para añadirle un
// script en línea, un manejador onerror y un script externo, todos SIN nonce. (page.evaluate no sirve para esto: el protocolo de
// depuración está exento de la CSP.)
{
  const violations = [];
  await page.exposeFunction("__report", (v) => violations.push(v));
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => window.__report(`${e.violatedDirective}`)); });
  await page.route(BASE + "/login", async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace("</body>", '<script>window.__xss=1</script><img src="x" onerror="window.__xss2=1"><script src="https://evil.example/x.js"></script></body>');
    const headers = { ...resp.headers() }; delete headers["content-length"];
    await route.fulfill({ response: resp, body, headers });
  });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  const ran = await page.evaluate(() => ({ inline: window.__xss === 1, handler: window.__xss2 === 1 }));
  await page.unroute(BASE + "/login");
  check("XSS simulado: el script en línea sin nonce NO se ejecuta", ran.inline === false);
  check("XSS simulado: el manejador onerror en línea NO se ejecuta", ran.handler === false);
  check("XSS simulado: el navegador registró las violaciones de CSP", violations.some((v) => v.startsWith("script-src")), violations.join(","));
  check("XSS simulado: la app sigue funcionando (sus scripts con nonce se ejecutaron)", await page.evaluate(() => document.scripts.length > 0 && typeof self.__next_f !== "undefined"));
}
problems.length = 0;

// Hidratación e interacción de punta a punta (server actions) bajo la CSP
problems.length = 0;
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "alguien@ejemplo.co");
await page.fill('input[name="password"]', "contraseña-incorrecta");
await page.click('button:has-text("Ingresar")');
const loginErr = await page.waitForSelector('form [role="alert"]', { timeout: 8000 }).then((e) => e.textContent()).catch(() => null);
check("login: el formulario se hidrata y la acción del servidor responde", /incorrectos/.test(loginErr ?? ""), String(loginErr));
check("login: tras el error el correo escrito se conserva", (await page.inputValue('input[name="email"]')) === "alguien@ejemplo.co");
await page.screenshot({ path: `${OUT}/login-error.png`, fullPage: true });

await page.goto(BASE + "/recuperar", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "alguien@ejemplo.co");
await page.click('button:has-text("Enviar enlace")');
const info = await page.waitForSelector('[role="status"]', { timeout: 8000 }).then((e) => e.textContent()).catch(() => null);
check("recuperar: responde con el mensaje genérico (no revela si el correo existe)", /Si ese correo tiene una cuenta/.test(info ?? ""), String(info));
await page.screenshot({ path: `${OUT}/recuperar-ok.png`, fullPage: true });

// Rutas protegidas y redirecciones
await page.goto(BASE + "/inicio", { waitUntil: "networkidle" });
check("ruta protegida sin sesión → /login?next=/inicio", page.url().includes("/login") && page.url().includes("next=%2Finicio"), page.url());
await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
check("/admin sin sesión → login", page.url().includes("/login"), page.url());
await page.goto(BASE + "/auth/callback?code=x&next=https%3A%2F%2Fevil.com", { waitUntil: "networkidle" });
check("callback con código inválido y next malicioso → /login con aviso, sin salir del sitio", page.url().startsWith(BASE + "/login") && /venció|ya se usó/.test(await page.textContent("body")), page.url());
const api = await page.request.get(BASE + "/api/export/backup", { maxRedirects: 0 });
check("API protegida sin sesión no entrega datos", api.status() !== 200, String(api.status()));
const wh = await page.request.post(BASE + "/api/wompi/webhook", { data: { event: "transaction.updated" } });
check("webhook de Wompi sin firma válida → 401", wh.status() === 401, String(wh.status()));
const cron = await page.request.get(BASE + "/api/cron/recurring");
check("cron sin secreto → 401", cron.status() === 401, String(cron.status()));
const manifest = await page.request.get(BASE + "/manifest.webmanifest");
check("manifest de la PWA disponible", manifest.status() === 200);
const sw = await page.request.get(BASE + "/sw.js");
check("service worker disponible sin pasar por login", sw.status() === 200 && /push/.test(await sw.text()));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exit(failed.length ? 1 : 0);
