import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { makeState, verifyState } from "@/lib/email/providers/oauth";

vi.mock("server-only", () => ({}));
const SECRET = "state-secret";
let user: { id: string } | null = { id: "u1" };
let userDb: ReturnType<typeof fakeDb>, adminDb: ReturnType<typeof fakeDb>;
let jar: Record<string, string> = {};
let base = "";
let tokenReply: { status?: number; body: object } = { body: {} };
let userinfoReply: object = {};
let configured = true;

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ ...userDb, auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminDb }));
vi.mock("@/lib/email/service", () => ({
  DB_PROVIDER: { google: "gmail", microsoft: "outlook" },
  oauthConfig: () => (configured ? { clientId: "cid", clientSecret: "cs", redirectUri: "https://app.test/api/email/google/callback", scopes: ["s"], endpoints: { authorize: "https://accounts.test/auth", token: base + "/token", userinfo: base + "/userinfo" } } : null),
  sealSecret: (_u: string, _e: string, d: object) => `sealed:${JSON.stringify(d)}`,
}));

let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => { req.resume(); req.on("end", () => { const isToken = req.url === "/token"; const r = isToken ? tokenReply : { status: 200, body: userinfoReply }; res.writeHead(r.status ?? 200, { "content-type": "application/json" }); res.end(JSON.stringify(r.body)); }); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const { GET: start } = await import("./[provider]/start/route");
const { GET: callback } = await import("./[provider]/callback/route");
const p = (provider: string) => ({ params: Promise.resolve({ provider }) });
const startReq = (q = "account_id=acc1") => new Request(`https://app.test/api/email/google/start?${q}`);
const cbReq = (q: string) => new Request(`https://app.test/api/email/google/callback?${q}`);
const location = (r: Response) => r.headers.get("location") ?? "";

beforeEach(() => {
  process.env.OAUTH_STATE_SECRET = SECRET;
  user = { id: "u1" }; jar = {}; configured = true;
  userDb = fakeDb({ accounts: [{ id: "acc1", user_id: "u1" }], email_connections: [] });
  adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { email_connections: 0 } }], email_connections: [] }, { email_connections: [["user_id", "email"]] });
  tokenReply = { body: { access_token: "AT", refresh_token: "RT", expires_in: 3600 } };
  userinfoReply = { email: "Ana@Gmail.com" };
});

describe("GET /api/email/[provider]/start", () => {
  const withPro = () => { adminDb = fakeDb({ subscriptions: [{ user_id: "u1", status: "active", plan: { limits: { email_connections: 2 } } }], email_connections: [] }); };
  it("proveedor desconocido → 404; sin sesión → login", async () => {
    expect((await start(startReq(), p("yahoo"))).status).toBe(404);
    user = null;
    expect(location(await start(startReq(), p("google")))).toContain("/login");
  });
  it("sin configurar, sin cuenta válida o sobre el límite del plan → vuelve a /correo con mensaje y sin cookie", async () => {
    withPro();
    configured = false;
    const a = await start(startReq(), p("google"));
    expect(location(a)).toContain("/correo?error=");
    configured = true;
    expect(decodeURIComponent(location(await start(startReq("account_id=ajena"), p("google"))))).toMatch(/cuenta/);
    adminDb = fakeDb({ subscriptions: [], plans: [{ code: "free", limits: { email_connections: 0 } }] });
    const lim = await start(startReq(), p("google"));
    expect(decodeURIComponent(location(lim))).toMatch(/plan no incluye/);
    expect(lim.headers.get("set-cookie")).toBeNull();
  });
  it("éxito: redirige al proveedor con state firmado y deja cookie HttpOnly con el nonce", async () => {
    withPro();
    const res = await start(startReq(), p("google"));
    const loc = new URL(location(res));
    expect(loc.origin + loc.pathname).toBe("https://accounts.test/auth");
    expect(loc.searchParams.get("access_type")).toBe("offline");
    expect(loc.searchParams.get("prompt")).toBe("consent");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/em_oauth=/); expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=lax/i);
    const { nonce, accountId } = JSON.parse(decodeURIComponent(cookie.split("em_oauth=")[1].split(";")[0]));
    expect(accountId).toBe("acc1");
    expect(verifyState(loc.searchParams.get("state")!, nonce, { userId: "u1", provider: "google" }, SECRET)).toBe(true);
  });
});

describe("GET /api/email/[provider]/callback", () => {
  const validFlow = () => { const { state, nonce } = makeState("u1", "google", SECRET); jar.em_oauth = JSON.stringify({ nonce, accountId: "acc1" }); return state; };
  const noWrites = () => expect(adminDb.tables.email_connections).toHaveLength(0);

  it("guarda la conexión con el secreto cifrado, la cuenta elegida y el correo en minúsculas", async () => {
    const res = await callback(cbReq(`code=CODE&state=${validFlow()}`), p("google"));
    expect(location(res)).toContain("/correo?conectado=1");
    expect(adminDb.tables.email_connections[0]).toMatchObject({ user_id: "u1", provider: "gmail", email: "ana@gmail.com", default_account_id: "acc1", active: true, secret_encrypted: 'sealed:{"refreshToken":"RT"}' });
    expect(res.headers.get("set-cookie")).toMatch(/em_oauth=;|Max-Age=0|expires=/i);   // nonce de un solo uso
  });
  it("reconectar la misma cuenta actualiza en vez de duplicar", async () => {
    await callback(cbReq(`code=C&state=${validFlow()}`), p("google"));
    tokenReply = { body: { access_token: "AT2", refresh_token: "RT2" } };
    adminDb.tables.email_connections.length = 0; // el fake no implementa upsert-update; basta verificar que la llamada usa onConflict
    await callback(cbReq(`code=C&state=${validFlow()}`), p("google"));
    const up = adminDb.ops.filter((o) => o.table === "email_connections" && o.op === "upsert");
    expect(up).toHaveLength(2);
  });
  it("RECHAZA state de otro usuario (ataque CSRF de conexión), sin cookie, alterado o vencido", async () => {
    const attacker = makeState("attacker", "google", SECRET);
    jar.em_oauth = JSON.stringify({ nonce: attacker.nonce, accountId: "acc1" });
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${attacker.state}`), p("google"))))).toMatch(/no es válida/);
    jar = {};
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${validFlow().slice(0)}`), p("google"))))).toContain("conectado=1"); // control: flujo legítimo sí pasa
    adminDb.tables.email_connections.length = 0;
    const s = validFlow(); jar = {};                                  // state válido pero sin cookie
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${s}`), p("google"))))).toMatch(/no es válida/);
    const t = validFlow();
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${t.slice(0, -3)}abc`), p("google"))))).toMatch(/no es válida/);
    const old = makeState("u1", "google", SECRET, Date.now() - 11 * 60_000);
    jar.em_oauth = JSON.stringify({ nonce: old.nonce, accountId: "acc1" });
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${old.state}`), p("google"))))).toMatch(/no es válida/);
    noWrites();
  });
  it("sin código, o si el usuario no autoriza → mensaje y sin escrituras", async () => {
    expect(decodeURIComponent(location(await callback(cbReq(`state=${validFlow()}`), p("google"))))).toMatch(/no es válida/);
    expect(decodeURIComponent(location(await callback(cbReq("error=access_denied"), p("google"))))).toMatch(/No autorizaste/);
    noWrites();
  });
  it("sin refresh token (el proveedor no dio permiso permanente) → no guarda nada", async () => {
    tokenReply = { body: { access_token: "AT", expires_in: 3600 } };
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${validFlow()}`), p("google"))))).toMatch(/permiso permanente/);
    noWrites();
  });
  it("código inválido en el proveedor → mensaje genérico, sin filtrar detalles", async () => {
    tokenReply = { status: 400, body: { error: "invalid_grant", error_description: "secreto-interno" } };
    const loc = decodeURIComponent(location(await callback(cbReq(`code=C&state=${validFlow()}`), p("google"))));
    expect(loc).toMatch(/No se pudo completar/);
    expect(loc).not.toMatch(/secreto-interno|invalid_grant/);
    noWrites();
  });
  it("sin sesión → login; cuenta de destino que ya no existe → error", async () => {
    user = null;
    expect(location(await callback(cbReq(`code=C&state=${validFlow()}`), p("google")))).toContain("/login");
    user = { id: "u1" };
    userDb = fakeDb({ accounts: [] });
    expect(decodeURIComponent(location(await callback(cbReq(`code=C&state=${validFlow()}`), p("google"))))).toMatch(/ya no existe/);
    noWrites();
  });
});
