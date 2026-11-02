import { describe, expect, it } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { selectAll } from "./db-page";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, user_id: "u1" }));

describe("selectAll", () => {
  it("DEMUESTRA el problema: con el tope de 1.000 filas de PostgREST, .limit(5000) devuelve solo 1.000", async () => {
    const db = fakeDb({ t: rows(2500) }, {}, { maxRows: 1000 });
    const { data } = await db.from("t").select("*").limit(5000);
    expect(data).toHaveLength(1000);
  });
  it("lee todas las filas página por página, sin repetir ni saltar", async () => {
    const db = fakeDb({ t: rows(2500) }, {}, { maxRows: 1000 });
    const all = await selectAll<{ id: number }>((a, b) => db.from("t").select("*").range(a, b));
    expect(all).toHaveLength(2500);
    expect(new Set(all.map((r) => r.id)).size).toBe(2500);
    expect(all[0].id).toBe(1); expect(all.at(-1)!.id).toBe(2500);
  });
  it("tamaños exactos en el borde y tablas vacías", async () => {
    for (const n of [0, 1, 999, 1000, 1001, 2000]) {
      const db = fakeDb({ t: rows(n) }, {}, { maxRows: 1000 });
      expect((await selectAll((a, b) => db.from("t").select("*").range(a, b))).length, String(n)).toBe(n);
    }
  });
  it("propaga errores de la base de datos y respeta el máximo", async () => {
    await expect(selectAll(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
    const db = fakeDb({ t: rows(3000) }, {}, { maxRows: 1000 });
    expect((await selectAll((a, b) => db.from("t").select("*").range(a, b), 1000, 2000))).toHaveLength(2000);
  });
});
