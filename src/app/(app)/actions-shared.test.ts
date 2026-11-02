/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakedb";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
let db: ReturnType<typeof fakeDb>;
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ ...db, rpc, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));

const { addSharedExpense, addSettlement, saveGroup } = await import("./actions-shared");
const M = ["m1", "m2", "m3"];
const form = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x)); return fd; };
const base = { group_id: "g1", description: "Cena", amount: "300.000", date: "2026-11-01", paid_by: "m1", split_mode: "equal", participants: M };

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ error: null }); db = fakeDb({ shared_members: M.map((id) => ({ id, group_id: "g1" })), shared_groups: [] }); });

describe("addSharedExpense", () => {
  it("partes iguales: envía al RPC las partes exactas y el total en centavos", async () => {
    expect(await addSharedExpense({}, form(base))).toEqual({ ok: true });
    const a = rpc.mock.calls[0];
    expect(a[0]).toBe("create_shared_expense");
    expect(a[1]).toMatchObject({ p_group: "g1", p_amount: 30_000_000, p_paid_by: "m1", p_date: "2026-11-01", p_shares: { m1: 10_000_000, m2: 10_000_000, m3: 10_000_000 }, p_create_tx: false });
  });
  it("reparte los centavos sobrantes sin perder ninguno", async () => {
    await addSharedExpense({}, form({ ...base, amount: "100" }));
    const s = rpc.mock.calls[0][1].p_shares as Record<string, number>;
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(Object.values(s).sort()).toEqual([3333, 3333, 3334]);
  });
  it("solo divide entre los marcados y descarta ids ajenos al grupo", async () => {
    await addSharedExpense({}, form({ ...base, participants: ["m1", "m3", "intruso"] }));
    expect(rpc.mock.calls[0][1].p_shares).toEqual({ m1: 15_000_000, m3: 15_000_000 });
  });
  it("valores distintos: valida que sumen el total", async () => {
    const ok = await addSharedExpense({}, form({ ...base, split_mode: "custom", share_m1: "100.000", share_m2: "150.000", share_m3: "50.000" }));
    expect(ok).toEqual({ ok: true });
    expect(rpc.mock.calls[0][1].p_shares).toEqual({ m1: 10_000_000, m2: 15_000_000, m3: 5_000_000 });
    rpc.mockClear();
    expect((await addSharedExpense({}, form({ ...base, split_mode: "custom", share_m1: "100.000", share_m2: "100.000" }))).error).toMatch(/Faltan/);
    expect((await addSharedExpense({}, form({ ...base, split_mode: "custom", share_m1: "200.000", share_m2: "200.000" }))).error).toMatch(/pasaste/);
    expect((await addSharedExpense({}, form({ ...base, split_mode: "custom", share_m1: "abc" }))).error).toMatch(/inválido/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rechaza datos inválidos sin llamar a la base de datos", async () => {
    for (const bad of [{ description: " " }, { amount: "0" }, { amount: "x" }, { date: "01/11/2026" }, { paid_by: "otro" }, { participants: [] as string[] }]) {
      const r = await addSharedExpense({}, form({ ...base, ...bad }));
      expect(r.error, JSON.stringify(bad)).toBeTruthy();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("registrar mi parte exige cuenta y la pasa al RPC", async () => {
    expect((await addSharedExpense({}, form({ ...base, record_mine: "on" }))).error).toMatch(/cuenta/);
    await addSharedExpense({}, form({ ...base, record_mine: "on", account_id: "acc1", category_id: "cat1" }));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_create_tx: true, p_account: "acc1", p_category: "cat1" });
  });
  it("traduce errores de la base y no filtra detalles internos", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "Las partes (1) no suman el total (3)" } });
    expect((await addSharedExpense({}, form(base))).error).toBe("Las partes no suman el total");
    rpc.mockResolvedValueOnce({ error: { message: "relation \"secret_table\" does not exist" } });
    const r = await addSharedExpense({}, form(base));
    expect(r.error).toBe("No se pudo guardar el gasto");
    expect(r.error).not.toMatch(/secret/);
  });
});

describe("addSettlement y saveGroup", () => {
  it("valida quién le pagó a quién y el valor", async () => {
    db = fakeDb({ shared_settlements: [] });
    const f = { group_id: "g1", from: "m2", to: "m1", amount: "50.000", date: "2026-11-02" };
    expect(await addSettlement({}, form(f))).toEqual({ ok: true });
    expect(db.tables.shared_settlements[0]).toMatchObject({ user_id: "u1", from_member: "m2", to_member: "m1", amount_cents: 5_000_000 });
    for (const bad of [{ to: "m2" }, { from: "" }, { amount: "0" }, { date: "x" }]) expect((await addSettlement({}, form({ ...f, ...bad }))).error).toBeTruthy();
    expect(db.tables.shared_settlements).toHaveLength(1);
  });
  it("crea el grupo con 'Yo' y los demás sin duplicados ni un segundo 'Yo'", async () => {
    db = fakeDb({ shared_groups: [], shared_members: [] });
    await expect(saveGroup({}, form({ name: "Viaje", members: "Ana\nLuis, Ana\nyo\n  " }))).rejects.toThrow(/REDIRECT:\/compartidos\//);
    expect(db.tables.shared_members.map((m: any) => [m.name, !!m.is_me])).toEqual([["Yo", true], ["Ana", false], ["Luis", false]]);
    expect((await saveGroup({}, form({ name: "", members: "Ana" }))).error).toBeTruthy();
    expect((await saveGroup({}, form({ name: "X", members: "yo" }))).error).toMatch(/al menos/);
    expect((await saveGroup({}, form({ name: "X", members: Array.from({ length: 25 }, (_, i) => `P${i}`).join("\n") }))).error).toMatch(/Máximo 20/);
  });
});
