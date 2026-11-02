/* eslint-disable @typescript-eslint/no-explicit-any */
/** Base de datos en memoria con la parte de la API de supabase-js que usa la app. Simula las restricciones únicas relevantes. */
type Row = Record<string, any>;
/** `unique`: por tabla, lista de restricciones únicas, cada una como lista de columnas (ej. [["user_id","message_id"]]). */
export function fakeDb(seed: Record<string, Row[]> = {}, unique: Record<string, string[][]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let n = 0;
  const ops: { table: string; op: string; payload?: any; filters?: any[] }[] = [];

  function from(table: string) {
    tables[table] ??= [];
    const filters: [string, string, any][] = [];
    let action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: any, opts: any, returning = false, single = false, limit = Infinity;
    const match = (r: Row) => filters.every(([c, op, v]) => op === "eq" ? r[c] === v : op === "in" ? v.includes(r[c]) : op === "gte" ? r[c] >= v : op === "lte" ? r[c] <= v : op === "is" ? (v === null ? r[c] == null : r[c] === v) : op === "not" ? r[c] != null : op === "neq" ? r[c] !== v : true);
    const run = () => {
      ops.push({ table, op: action, payload, filters: [...filters] });
      if (action === "select") { let rows = tables[table].filter(match).slice(0, limit); if (single) rows = rows.slice(0, 1); return { data: single ? rows[0] ?? null : rows, error: null, count: tables[table].filter(match).length }; }
      if (action === "delete") { const gone = tables[table].filter(match); tables[table] = tables[table].filter((r) => !match(r)); return { data: gone, error: null }; }
      if (action === "update") { const rows = tables[table].filter(match); rows.forEach((r) => Object.assign(r, payload)); return { data: rows, error: null }; }
      const list: Row[] = Array.isArray(payload) ? payload : [payload];
      const inserted: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${table}-${++n}`, ...raw };
        const clash = (unique[table] ?? []).some((cols) => cols.every((c) => row[c] != null) && tables[table].some((r) => cols.every((c) => r[c] === row[c])));
        if (clash) { if (action === "upsert" && opts?.ignoreDuplicates) continue; return { data: null, error: { code: "23505", message: "duplicate key" } }; }
        tables[table].push(row); inserted.push(row);
      }
      return { data: returning ? inserted : null, error: null };
    };
    const b: any = {
      select: (_c?: string, o?: any) => { if (action === "select") { opts = o; } else returning = true; return b; },
      eq: (c: string, v: any) => (filters.push([c, "eq", v]), b), in: (c: string, v: any[]) => (filters.push([c, "in", v]), b),
      gte: (c: string, v: any) => (filters.push([c, "gte", v]), b), lte: (c: string, v: any) => (filters.push([c, "lte", v]), b),
      is: (c: string, v: any) => (filters.push([c, "is", v]), b), not: (c: string) => (filters.push([c, "not", null]), b),
      neq: (c: string, v: any) => (filters.push([c, "neq", v]), b), or: () => b, order: () => b, limit: (x: number) => ((limit = x), b),
      insert: (p: any) => ((action = "insert"), (payload = p), b), upsert: (p: any, o: any) => ((action = "upsert"), (payload = p), (opts = o), b),
      update: (p: any) => ((action = "update"), (payload = p), b), delete: () => ((action = "delete"), b),
      maybeSingle: async () => { single = true; return run(); }, single: async () => { single = true; return run(); },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }
  return { from, tables, ops };
}
