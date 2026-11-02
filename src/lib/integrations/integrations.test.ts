import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { fakeDb } from "@/test/fakedb";

vi.mock("server-only", () => ({}));
let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const { resolveIntegration, saveIntegration, clearIntegrationField, getIntegration, clearIntegrationCache, IntegrationError } = await import("./store");
const { maskSecret, integrationAad, INTEGRATIONS } = await import("./registry");

const KEY = randomBytes(32).toString("base64");
const fresh = () => fakeDb({ integration_settings: [] }, { integration_settings: [["provider", "key"]] });
const admin = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  for (const f of INTEGRATIONS.flatMap((p) => p.fields)) delete process.env[f.env];
  db = fresh(); clearIntegrationCache();
});

describe("integraciones administrables", () => {
  it("sin nada configurado: faltan los campos y la URL de Wompi queda en sandbox", async () => {
    const r = await resolveIntegration(db as never, "wompi", {});
    expect(r.ready).toBe(false);
    expect(r.values.api_url).toBe("https://sandbox.wompi.co/v1");
    expect(r.fields.find((f) => f.key === "public_key")?.source).toBe("none");
  });
  it("guarda el secreto CIFRADO (no queda en claro en la base) y lo recupera", async () => {
    const saved = await saveIntegration(db as never, "wompi", { public_key: "pub_test_abc123", integrity_secret: "test_integrity_SECRETO", events_secret: "test_events_OTRO" }, admin);
    expect(saved.sort()).toEqual(["events_secret", "integrity_secret", "public_key"]);
    const rows = db.tables.integration_settings;
    expect(rows.find((r) => r.key === "public_key")!.value).toBe("pub_test_abc123");
    const enc = rows.find((r) => r.key === "integrity_secret")!;
    expect(enc.value).toMatch(/^v1:/); expect(enc.value).not.toContain("SECRETO"); expect(enc.is_secret).toBe(true);
    const r = await resolveIntegration(db as never, "wompi", {});
    expect(r.ready).toBe(true);
    expect(r.values.integrity_secret).toBe("test_integrity_SECRETO");
  });
  it("la vista previa nunca revela un secreto completo", async () => {
    await saveIntegration(db as never, "google", { client_id: "123.apps.googleusercontent.com", client_secret: "GOCSPX-supersecreto-1234" }, admin);
    const f = (await resolveIntegration(db as never, "google", {})).fields.find((x) => x.key === "client_secret")!;
    expect(f.preview).toBe("••••••••1234"); expect(JSON.stringify(f)).not.toContain("supersecreto");
    expect(maskSecret("corto")).toBe("••••••••");
  });
  it("campos vacíos no se tocan; guardar de nuevo reemplaza el valor", async () => {
    await saveIntegration(db as never, "microsoft", { client_id: "11111111-2222-3333-4444-555555555555", client_secret: "primer-secreto-1" }, admin);
    expect(await saveIntegration(db as never, "microsoft", { client_id: "", client_secret: "" }, admin)).toEqual([]);
    await saveIntegration(db as never, "microsoft", { client_secret: "segundo-secreto-2" }, admin);
    expect(db.tables.integration_settings).toHaveLength(2);
    expect((await resolveIntegration(db as never, "microsoft", {})).values).toMatchObject({ client_id: "11111111-2222-3333-4444-555555555555", client_secret: "segundo-secreto-2" });
  });
  it("el panel manda sobre la variable de entorno; al quitarlo vuelve la variable", async () => {
    const env = { GOOGLE_CLIENT_ID: "env.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "env-secreto-123" };
    expect((await resolveIntegration(db as never, "google", env)).fields[0]).toMatchObject({ source: "env", preview: "env.apps.googleusercontent.com" });
    await saveIntegration(db as never, "google", { client_id: "panel.apps.googleusercontent.com" }, admin);
    expect((await resolveIntegration(db as never, "google", env)).values.client_id).toBe("panel.apps.googleusercontent.com");
    await clearIntegrationField(db as never, "google", "client_id");
    expect((await resolveIntegration(db as never, "google", env)).values.client_id).toBe("env.apps.googleusercontent.com");
  });
  it("valida el formato de cada campo", async () => {
    const bad = (p: "wompi" | "google" | "microsoft", i: Record<string, string>) => saveIntegration(db as never, p, i, admin);
    await expect(bad("wompi", { public_key: "prv_test_abc" })).rejects.toThrow(/pub_test_ o pub_prod_/);
    await expect(bad("wompi", { integrity_secret: "con espacios aquí" })).rejects.toThrow(/espacios/);
    await expect(bad("wompi", { api_url: "http://inseguro.test" })).rejects.toThrow(/https/);
    await expect(bad("google", { client_id: "algo.com" })).rejects.toThrow(/googleusercontent/);
    await expect(bad("microsoft", { client_id: "no-es-guid" })).rejects.toThrow(/GUID/);
    await expect(saveIntegration(db as never, "nada" as never, {}, admin)).rejects.toBeInstanceOf(IntegrationError);
    expect(db.tables.integration_settings).toHaveLength(0);          // si un campo es inválido no se guarda nada
  });
  it("sin TOKEN_ENCRYPTION_KEY no guarda secretos y lo dice", async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    await expect(saveIntegration(db as never, "google", { client_secret: "un-secreto-largo-1" }, admin)).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(db.tables.integration_settings).toHaveLength(0);
  });
  it("un secreto no se descifra con otra llave ni copiado a otro campo: cae a la variable de entorno y avisa", async () => {
    await saveIntegration(db as never, "wompi", { events_secret: "test_events_ABCDEFG" }, admin);
    const row = db.tables.integration_settings[0];
    db.tables.integration_settings.push({ ...row, key: "integrity_secret" });     // blob copiado a otro campo
    const r = await resolveIntegration(db as never, "wompi", { WOMPI_INTEGRITY_SECRET: "del-entorno-123" });
    expect(r.values.integrity_secret).toBe("del-entorno-123");
    expect(r.fields.find((f) => f.key === "integrity_secret")!.error).toMatch(/descifrar/);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");       // llave rotada
    expect((await resolveIntegration(db as never, "wompi", {})).values.events_secret).toBeUndefined();
    expect(integrationAad("wompi", "events_secret")).toBe("integration:wompi:events_secret");
  });
  it("si la tabla no existe todavía (migración sin ejecutar) se usan las variables de entorno sin fallar", async () => {
    const broken = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "relation does not exist" } }) }) }) };
    const r = await resolveIntegration(broken as never, "google", { GOOGLE_CLIENT_ID: "x.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secreto-1234" });
    expect(r.tableReady).toBe(false); expect(r.ready).toBe(true);
  });
  it("getIntegration lee el panel y usa una caché corta que se invalida al guardar", async () => {
    await saveIntegration(db as never, "google", { client_id: "a.apps.googleusercontent.com", client_secret: "secreto-uno-1" }, admin);
    expect((await getIntegration("google")).client_secret).toBe("secreto-uno-1");
    db.tables.integration_settings.length = 0;                                   // cambio por fuera: la caché lo oculta unos segundos
    expect((await getIntegration("google")).client_secret).toBe("secreto-uno-1");
    await saveIntegration(db as never, "google", { client_secret: "secreto-dos-2" }, admin);
    expect((await getIntegration("google")).client_secret).toBe("secreto-dos-2");
  });
});
