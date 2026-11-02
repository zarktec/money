import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_ENDPOINTS, authorizeUrl, exchangeCode, fetchAccountEmail, makeState, refreshAccessToken, verifyState, type OAuthConfig } from "./oauth";
import { GmailProvider, gmailBody } from "./gmail";
import { OutlookProvider } from "./outlook";
import { ProviderAuthError, ProviderError } from "./types";

type Rec = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
let server: http.Server, base = "";
let calls: Rec[] = [];
let handler: (r: Rec) => { status?: number; body: unknown } = () => ({ body: {} });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => { const rec = { method: req.method!, url: req.url!, headers: req.headers, body }; calls.push(rec); const r = handler(rec); res.writeHead(r.status ?? 200, { "content-type": "application/json" }); res.end(JSON.stringify(r.body)); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => { calls = []; handler = () => ({ body: {} }); });

const cfg = (): OAuthConfig => ({ clientId: "cid", clientSecret: "csecret", redirectUri: "https://app.test/cb", scopes: ["a", "b"], endpoints: { authorize: base + "/auth", token: base + "/token", userinfo: base + "/userinfo" } });
const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("state OAuth firmado", () => {
  const SECRET = "s3cret";
  it("válido solo para el mismo usuario, proveedor y nonce, y dentro de 10 minutos", () => {
    const { state, nonce } = makeState("u1", "gmail", SECRET, 1_000_000);
    expect(verifyState(state, nonce, { userId: "u1", provider: "gmail" }, SECRET, 1_000_000 + 60_000)).toBe(true);
    expect(verifyState(state, nonce, { userId: "u2", provider: "gmail" }, SECRET, 1_000_000)).toBe(false);       // otra víctima
    expect(verifyState(state, nonce, { userId: "u1", provider: "outlook" }, SECRET, 1_000_000)).toBe(false);
    expect(verifyState(state, "otro-nonce", { userId: "u1", provider: "gmail" }, SECRET, 1_000_000)).toBe(false); // cookie distinta
    expect(verifyState(state, undefined, { userId: "u1", provider: "gmail" }, SECRET, 1_000_000)).toBe(false);
    expect(verifyState(state, nonce, { userId: "u1", provider: "gmail" }, SECRET, 1_000_000 + 11 * 60_000)).toBe(false); // vencido
    expect(verifyState(state, nonce, { userId: "u1", provider: "gmail" }, SECRET, 1_000_000 - 1)).toBe(false);         // del futuro
    expect(verifyState(state, nonce, { userId: "u1", provider: "gmail" }, "otra-clave", 1_000_000)).toBe(false);
  });
  it("rechaza estados alterados o mal formados", () => {
    const { state, nonce } = makeState("u1", "gmail", SECRET, 1_000_000);
    expect(verifyState(state.replace("u1", "u9"), nonce, { userId: "u9", provider: "gmail" }, SECRET, 1_000_000)).toBe(false);
    expect(verifyState("basura", nonce, { userId: "u1", provider: "gmail" }, SECRET)).toBe(false);
    expect(verifyState(state.slice(0, -4) + "0000", nonce, { userId: "u1", provider: "gmail" }, SECRET, 1_000_000)).toBe(false);
  });
});

describe("OAuth", () => {
  it("arma la URL de autorización con todos los parámetros", () => {
    const u = new URL(authorizeUrl({ ...cfg(), endpoints: GOOGLE_ENDPOINTS }, "ST", { access_type: "offline", prompt: "consent" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "cid", redirect_uri: "https://app.test/cb", response_type: "code", scope: "a b", state: "ST", access_type: "offline", prompt: "consent" });
  });
  it("intercambia el código y renueva el token enviando el formulario correcto", async () => {
    handler = () => ({ body: { access_token: "AT", refresh_token: "RT", expires_in: 3599 } });
    expect(await exchangeCode(cfg(), "CODE")).toEqual({ accessToken: "AT", refreshToken: "RT", expiresIn: 3599 });
    const f = Object.fromEntries(new URLSearchParams(calls[0].body));
    expect(f).toMatchObject({ grant_type: "authorization_code", code: "CODE", client_id: "cid", client_secret: "csecret", redirect_uri: "https://app.test/cb" });
    handler = () => ({ body: { access_token: "AT2", expires_in: 3600 } });
    expect(await refreshAccessToken(cfg(), "RT")).toEqual({ accessToken: "AT2", refreshToken: null, expiresIn: 3600 });
    expect(Object.fromEntries(new URLSearchParams(calls[1].body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "RT" });
  });
  it("invalid_grant se marca como credencial revocada", async () => {
    handler = () => ({ status: 400, body: { error: "invalid_grant" } });
    await expect(refreshAccessToken(cfg(), "RT")).rejects.toMatchObject({ revoked: true });
    handler = () => ({ status: 500, body: {} });
    await expect(exchangeCode(cfg(), "C")).rejects.toMatchObject({ revoked: false });
  });
  it("lee el correo de la cuenta (Google y Microsoft) en minúsculas", async () => {
    handler = () => ({ body: { email: "Ana@Gmail.com" } });
    expect(await fetchAccountEmail(cfg(), "AT")).toBe("ana@gmail.com");
    expect(calls[0].headers.authorization).toBe("Bearer AT");
    handler = () => ({ body: { userPrincipalName: "Ana@Outlook.com" } });
    expect(await fetchAccountEmail(cfg(), "AT")).toBe("ana@outlook.com");
    handler = () => ({ status: 401, body: {} });
    expect(await fetchAccountEmail(cfg(), "AT")).toBeNull();
  });
});

describe("Gmail", () => {
  it("lista con la consulta correcta, pagina y trae solo metadatos", async () => {
    handler = (r) => {
      if (r.url.startsWith("/messages?")) return r.url.includes("pageToken") ? { body: { messages: [{ id: "m3" }] } } : { body: { messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "P2" } };
      const id = r.url.split("/")[2].split("?")[0];
      return { body: { id, internalDate: "1762000000000", snippet: "hola", payload: { headers: [{ name: "From", value: "A <a@b.com>" }, { name: "Subject", value: `Asunto ${id}` }, ...(id === "m2" ? [{ name: "List-Unsubscribe", value: "<x>" }] : [])] } } };
    };
    const out = await new GmailProvider("TOK", base).list(new Date("2026-10-01T00:00:00Z"), 10);
    expect(out.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(out[1].listUnsubscribe).toBe(true);
    expect(out[0]).toMatchObject({ from: "A <a@b.com>", subject: "Asunto m1", snippet: "hola" });
    const q = decodeURIComponent(calls[0].url);
    expect(q).toContain("after:" + Math.floor(Date.parse("2026-10-01T00:00:00Z") / 1000));
    expect(q).toMatch(/-category:promotions.*-category:social.*-in:spam/);
    expect(calls[0].headers.authorization).toBe("Bearer TOK");
    expect(calls.some((c) => c.url.includes("format=full"))).toBe(false);   // la lista nunca descarga cuerpos
  });
  it("respeta el máximo", async () => {
    handler = (r) => r.url.startsWith("/messages?") ? { body: { messages: [{ id: "a" }, { id: "b" }, { id: "c" }] } } : { body: { internalDate: "1", payload: { headers: [] } } };
    expect(await new GmailProvider("T", base).list(new Date(), 2)).toHaveLength(2);
  });
  it("decodifica text/plain en multipart y cae a HTML si no hay texto", () => {
    expect(gmailBody({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("Compra por $85.000 ñ") } }, { mimeType: "text/html", body: { data: b64("<b>otro</b>") } }] })).toBe("Compra por $85.000 ñ");
    expect(gmailBody({ mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<p>Total <b>$5.000</b></p>") } }] }] })).toBe("Total $5.000");
    expect(gmailBody(undefined)).toBe("");
  });
  it("read devuelve el cuerpo acotado", async () => {
    handler = () => ({ body: { internalDate: "1762000000000", payload: { headers: [{ name: "Subject", value: "S" }], mimeType: "text/plain", body: { data: b64("x".repeat(9000)) } } } });
    const m = await new GmailProvider("T", base).read("m1");
    expect(m.body).toHaveLength(6000);
    expect(calls[0].url).toContain("format=full");
  });
  it("401/403 → credencial inválida; otros errores → error del proveedor", async () => {
    handler = () => ({ status: 401, body: {} });
    await expect(new GmailProvider("T", base).list(new Date(), 5)).rejects.toBeInstanceOf(ProviderAuthError);
    handler = () => ({ status: 500, body: {} });
    await expect(new GmailProvider("T", base).read("x")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("Outlook", () => {
  it("lista con filtro por fecha, sigue nextLink y arma el remitente", async () => {
    handler = (r) => r.url.includes("page2")
      ? { body: { value: [{ id: "o3", subject: "C", receivedDateTime: "2026-10-03T00:00:00Z", from: { emailAddress: { address: "z@z.com" } } }] } }
      : { body: { value: [{ id: "o1", subject: "A", bodyPreview: "p", receivedDateTime: "2026-10-05T00:00:00Z", from: { emailAddress: { name: "Banco", address: "a@banco.com" } } }], "@odata.nextLink": base + "/page2" } };
    const out = await new OutlookProvider("TOK", base).list(new Date("2026-10-01T00:00:00Z"), 10);
    expect(out.map((m) => [m.id, m.from])).toEqual([["o1", "Banco <a@banco.com>"], ["o3", "<z@z.com>"]]);
    expect(decodeURIComponent(calls[0].url)).toContain("receivedDateTime ge 2026-10-01T00:00:00.000Z");
    expect(calls[0].headers.authorization).toBe("Bearer TOK");
  });
  it("read pide texto plano y convierte HTML si llega HTML", async () => {
    handler = () => ({ body: { id: "o1", subject: "S", receivedDateTime: "2026-10-05T00:00:00Z", body: { contentType: "html", content: "<p>Pago <b>$12.000</b></p>" } } });
    const m = await new OutlookProvider("T", base).read("o1");
    expect(m.body).toBe("Pago $12.000");
    expect(calls[0].headers.prefer).toContain("text");
  });
  it("401 → credencial inválida", async () => {
    handler = () => ({ status: 401, body: {} });
    await expect(new OutlookProvider("T", base).list(new Date(), 5)).rejects.toBeInstanceOf(ProviderAuthError);
  });
});
