import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("middleware sin configurar", () => {
  it("responde 503 con un aviso claro (y sin filtrar variables ni detalles) cuando falta Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { middleware } = await import("./middleware");
    for (const path of ["/", "/login", "/inicio", "/privacidad"]) {
      const res = await middleware(new NextRequest(`https://app.test${path}`));
      expect(res.status, path).toBe(503);
      const body = await res.text();
      expect(body).toMatch(/aún no está configurada/);
      expect(body).not.toMatch(/SUPABASE|KEY|process\.env/);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
