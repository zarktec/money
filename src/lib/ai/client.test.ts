import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const { getAnthropic } = await import("./client");
const { saveIntegration, clearIntegrationCache } = await import("@/lib/integrations/store");

// API de Anthropic simulada: anota la clave y el modelo con que le hablan.
let seen: { key?: string; model?: string }[] = [];
let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => {
      seen.push({ key: String(req.headers.authorization ?? req.headers["x-api-key"]).replace(/^Bearer /, ""), model: JSON.parse(b).model });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "m1", type: "message", role: "assistant", model: "x", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); delete process.env.ANTHROPIC_BASE_URL; });
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64"); delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_MODEL;
  db = fakeDb({ integration_settings: [] }, { integration_settings: [["provider", "key"]] }); clearIntegrationCache(); seen = [];
});
const call = async (c: NonNullable<Awaited<ReturnType<typeof getAnthropic>>>) => c.client.messages.create({ model: "ignorado", max_tokens: 5, messages: [{ role: "user", content: "hola" }] } as never);

describe("cliente de IA administrable", () => {
  it("sin API key ni en el panel ni en el entorno devuelve null", async () => {
    expect(await getAnthropic()).toBeNull();
  });
  it("usa la clave y el modelo del panel, y el modelo configurado manda sobre el de la llamada", async () => {
    await saveIntegration(db as never, "anthropic", { api_key: "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV", model: "claude-haiku-5-5" }, "admin-1");
    const ai = (await getAnthropic())!;
    expect(ai.model).toBe("claude-haiku-5-5");
    await call(ai);
    expect(seen).toEqual([{ key: "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV", model: "claude-haiku-5-5" }]);
  });
  it("el panel manda sobre la variable de entorno y sin modelo se usa el recomendado", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-del-entorno-1234567890";
    expect((await getAnthropic())!.model).toBe("claude-opus-5-5");
    await saveIntegration(db as never, "anthropic", { api_key: "sk-ant-api03-PANEL1234567890ABCDEF" }, "admin-1");
    await call((await getAnthropic())!);
    expect(seen[0].key).toBe("sk-ant-api03-PANEL1234567890ABCDEF");
  });
  it("valida el formato de la API key y del modelo", async () => {
    await expect(saveIntegration(db as never, "anthropic", { api_key: "no-es-una-clave" }, "a")).rejects.toThrow(/sk-ant-/);
    await expect(saveIntegration(db as never, "anthropic", { model: "Modelo Con Espacios" }, "a")).rejects.toThrow(/modelo/);
  });
});
