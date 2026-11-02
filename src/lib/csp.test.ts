import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

const dir = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(name + " "))?.split(" ").slice(1) ?? [];

describe("buildCsp", () => {
  const csp = buildCsp("NONCE123", { supabaseUrl: "https://abc.supabase.co" });
  it("scripts: solo con nonce y strict-dynamic; sin unsafe-inline ni unsafe-eval en producción", () => {
    expect(dir(csp, "script-src")).toEqual(["'self'", "'nonce-NONCE123'", "'strict-dynamic'"]);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });
  it("bloquea frames, plugins y base; permite solo los destinos que la app usa", () => {
    expect(dir(csp, "frame-ancestors")).toEqual(["'none'"]); expect(dir(csp, "object-src")).toEqual(["'none'"]); expect(dir(csp, "base-uri")).toEqual(["'self'"]);
    expect(dir(csp, "default-src")).toEqual(["'self'"]);
    expect(dir(csp, "connect-src")).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
    expect(dir(csp, "form-action")).toEqual(["'self'", "https://accounts.google.com", "https://login.microsoftonline.com"]);
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("en desarrollo permite eval y websockets (recarga en caliente) sin ensuciar producción", () => {
    const dev = buildCsp("N", { dev: true });
    expect(dir(dev, "script-src")).toContain("'unsafe-eval'"); expect(dir(dev, "connect-src")).toContain("ws:"); expect(dev).not.toContain("upgrade-insecure-requests");
  });
  it("una URL de Supabase inválida o ausente no rompe la política", () => {
    expect(dir(buildCsp("N", { supabaseUrl: "no es url" }), "connect-src")).toContain("https://*.supabase.co");
    expect(dir(buildCsp("N"), "connect-src")).toContain("wss://*.supabase.co");
  });
  it("el nonce es aleatorio, base64 y de 128 bits", () => {
    const a = newNonce(), b = newNonce();
    expect(a).not.toBe(b); expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
