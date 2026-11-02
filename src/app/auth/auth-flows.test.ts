import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
let hdrs: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => hdrs[k.toLowerCase()] ?? null }) }));
const auth = { resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(), signInWithPassword: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/service", () => ({ secretAad: () => "" }));

const { requestPasswordReset, login } = await import("@/app/(auth)/actions");
const { changePassword } = await import("@/app/(app)/actions-account");
const { GET: callback } = await import("./callback/route");
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const loc = (r: Response) => r.headers.get("location") ?? "";

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
  auth.resetPasswordForEmail.mockResolvedValue({ error: null }); auth.updateUser.mockResolvedValue({ error: null }); auth.signOut.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@x.co" } } }); auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test"; hdrs = {};
});

describe("requestPasswordReset", () => {
  it("valida el formato del correo antes de llamar a Supabase", async () => {
    for (const bad of ["", "sin-arroba", "a@b", "a b@c.co", "x@".padEnd(300, "x") + ".co"]) expect((await requestPasswordReset({}, form({ email: bad }))).error, bad).toMatch(/correo válido/);
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("manda el enlace de vuelta a /auth/callback con destino /cuenta/clave, y normaliza el correo", async () => {
    await requestPasswordReset({}, form({ email: "  Ana@Correo.CO " }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@correo.co", { redirectTo: "https://app.test/auth/callback?next=%2Fcuenta%2Fclave" });
  });
  it("SEGURIDAD: responde EXACTAMENTE lo mismo exista o no el correo, o falle Supabase (no revela quién tiene cuenta)", async () => {
    const ok = await requestPasswordReset({}, form({ email: "existe@x.co" }));
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "User not found", status: 400 } });
    const noExiste = await requestPasswordReset({}, form({ email: "noexiste@x.co" }));
    auth.resetPasswordForEmail.mockRejectedValueOnce(new Error("red caída"));
    const falla = await requestPasswordReset({}, form({ email: "otro@x.co" }));
    expect(noExiste).toEqual(ok); expect(falla).toEqual(ok);
    expect(ok.info).toMatch(/Si ese correo tiene una cuenta/);
    expect(ok.error).toBeUndefined();
  });
  it("sin NEXT_PUBLIC_APP_URL usa el host del request (nunca 'undefined/auth/callback')", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL; hdrs = { host: "money.example.com", "x-forwarded-proto": "https" };
    await requestPasswordReset({}, form({ email: "a@x.co" }));
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe("https://money.example.com/auth/callback?next=%2Fcuenta%2Fclave");
  });
});

describe("changePassword", () => {
  it("valida largo, coincidencia y límite de 72", async () => {
    expect((await changePassword({}, form({ password: "corta", confirm: "corta" }))).error).toMatch(/al menos 8/);
    expect((await changePassword({}, form({ password: "12345678", confirm: "87654321" }))).error).toMatch(/no coinciden/);
    expect((await changePassword({}, form({ password: "x".repeat(73), confirm: "x".repeat(73) }))).error).toMatch(/72/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("cambia la contraseña y CIERRA las demás sesiones", async () => {
    expect(await changePassword({}, form({ password: "nueva-segura-1", confirm: "nueva-segura-1" }))).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "nueva-segura-1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });
  it("mensajes claros: igual a la actual, muy débil, y error genérico sin filtrar detalles", async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { message: "New password should be different from the old password." } });
    expect((await changePassword({}, form({ password: "12345678", confirm: "12345678" }))).error).toMatch(/distinta/);
    auth.updateUser.mockResolvedValueOnce({ error: { message: "Password is too weak" } });
    expect((await changePassword({}, form({ password: "12345678", confirm: "12345678" }))).error).toMatch(/débil/);
    auth.updateUser.mockResolvedValueOnce({ error: { message: "db password_hash column secreto" } });
    const g = await changePassword({}, form({ password: "12345678", confirm: "12345678" }));
    expect(g.error).toBe("No se pudo cambiar la contraseña. Inténtalo de nuevo."); expect(g.error).not.toMatch(/secreto|hash/);
    expect(auth.signOut).not.toHaveBeenCalled();                          // si falló, no se cierran sesiones
  });
  it("sin sesión → login", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(changePassword({}, form({ password: "12345678", confirm: "12345678" }))).rejects.toThrow("REDIRECT:/login");
  });
});

describe("GET /auth/callback", () => {
  const call = (q: string) => callback(new Request(`https://app.test/auth/callback?${q}`));
  it("canjea el código y va al destino interno pedido", async () => {
    expect(loc(await call("code=ABC&next=%2Fcuenta%2Fclave"))).toBe("https://app.test/cuenta/clave");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("ABC");
    expect(loc(await call("code=ABC"))).toBe("https://app.test/inicio");
  });
  it("SEGURIDAD: un `next` hacia otro sitio nunca saca al usuario de la app", async () => {
    for (const evil of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) expect(loc(await call(`code=ABC&next=${encodeURIComponent(evil)}`)), evil).toBe("https://app.test/inicio");
  });
  it("sin código o con código inválido/vencido → login con aviso, sin iniciar sesión", async () => {
    expect(loc(await call("next=%2Fcuenta%2Fclave"))).toBe("https://app.test/login?error=enlace");
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "expired" } });
    expect(loc(await call("code=VENCIDO"))).toBe("https://app.test/login?error=enlace");
  });
});

describe("los formularios conservan lo escrito tras un error (React 19 los vacía)", () => {
  it("login devuelve el correo (no la contraseña)", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "x" } });
    const r = await login({}, form({ email: "ana@x.co", password: "secreta" }));
    expect(r).toEqual({ error: "Correo o contraseña incorrectos", email: "ana@x.co" });
    expect(JSON.stringify(r)).not.toContain("secreta");
  });
  it("recuperar devuelve el correo si no es válido", async () => {
    expect((await requestPasswordReset({}, form({ email: "mal" }))).email).toBe("mal");
  });
});

describe("login: el destino también se valida", () => {
  it("ignora un next malicioso", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await expect(login({}, form({ email: "a@x.co", password: "x", next: "https://evil.com" }))).rejects.toThrow("REDIRECT:/inicio");
    await expect(login({}, form({ email: "a@x.co", password: "x", next: "/ahorros" }))).rejects.toThrow("REDIRECT:/ahorros");
  });
});
