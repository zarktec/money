import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";
import { normalizeText, parseAmountText, parseDateText } from "./parse";
import { mapStatement } from "./statement";
import { dedupeHash, hashAll } from "./dedupe";
import { categorizeByMerchants, matchCategoryByName } from "./categorize";

describe("csv", () => {
  it("detecta delimitador y respeta comillas, BOM y saltos dentro de comillas", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter('a,b\n"x,y",2')).toBe(",");
    const r = parseCsv('﻿Fecha;Detalle;Valor\r\n01/11/2026;"PAGO ""EPM"";\nSEDE";-45.000\r\n');
    expect(r).toEqual([["Fecha", "Detalle", "Valor"], ["01/11/2026", 'PAGO "EPM";\nSEDE', "-45.000"]]);
  });
});

describe("parseAmountText", () => {
  it.each([
    ["1.234.567,89", 1234567.89], ["-45.000", -45000], ["(45.000)", -45000], ["45.000-", -45000], ["$ 45,000.00", 45000],
    ["45,5", 45.5], ["1,500", 1500], ["2.500.000", 2500000], ["COP 12.000", 12000], ["0,99", 0.99], ["7", 7],
  ])("%s → %d", (s, n) => expect(parseAmountText(s)).toBe(n));
  it("rechaza texto no numérico", () => { expect(parseAmountText("abc")).toBeNull(); expect(parseAmountText("")).toBeNull(); expect(parseAmountText("--")).toBeNull(); });
});

describe("parseDateText", () => {
  it("formatos comunes", () => {
    expect(parseDateText("2026-11-02")).toBe("2026-11-02");
    expect(parseDateText("02/11/2026")).toBe("2026-11-02");
    expect(parseDateText("2-11-26")).toBe("2026-11-02");
    expect(parseDateText("02.11.2026 14:30")).toBe("2026-11-02");
    expect(parseDateText("02/11", 2026)).toBe("2026-11-02");
  });
  it("día/mes por defecto; mm/dd solo si el mes sería imposible", () => {
    expect(parseDateText("03/04/2026")).toBe("2026-04-03");
    expect(parseDateText("11/25/2026")).toBe("2026-11-25");
  });
  it("rechaza fechas imposibles o sin año", () => {
    expect(parseDateText("31/02/2026")).toBeNull();
    expect(parseDateText("02/11")).toBeNull();
    expect(parseDateText("hola")).toBeNull();
  });
});

describe("mapStatement", () => {
  it("extracto con valor con signo (estilo cuenta de ahorros)", () => {
    const rows = parseCsv("Fecha;Descripción;Sucursal;Valor;Saldo\n01/11/2026;COMPRA RAPPI 12345678;001;-35.000;1.000.000\n02/11/2026;ABONO NÓMINA;001;3.500.000;4.465.000\nTotal;;;;");
    const r = mapStatement(rows);
    expect(r.rows).toEqual([
      { date: "2026-11-01", type: "expense", amountCents: 3_500_000, description: "COMPRA RAPPI 12345678" },
      { date: "2026-11-02", type: "income", amountCents: 350_000_000, description: "ABONO NÓMINA" },
    ]);
    expect(r.ambiguousSign).toBe(false);
  });
  it("columnas de débito y crédito, ignora el saldo", () => {
    const r = mapStatement(parseCsv("Fecha,Concepto,Débito,Crédito,Saldo\n2026-11-03,Cine,28000,,500000\n2026-11-04,Reembolso,,15000,515000"));
    expect(r.rows.map((x) => [x.type, x.amountCents])).toEqual([["expense", 2_800_000], ["income", 1_500_000]]);
  });
  it("todo positivo: ambiguo, asume egresos y se puede invertir", () => {
    const csv = "Fecha,Descripción,Valor\n01/11/2026,Netflix,38900\n02/11/2026,Uber,12000";
    const a = mapStatement(parseCsv(csv));
    expect(a.ambiguousSign).toBe(true);
    expect(a.rows.every((x) => x.type === "expense")).toBe(true);
    const b = mapStatement(parseCsv(csv), { positiveIs: "income" });
    expect(b.ambiguousSign).toBe(false);
    expect(b.rows.every((x) => x.type === "income")).toBe(true);
  });
  it("fechas sin año usan el año indicado y avisan si falta", () => {
    const csv = "Fecha,Descripción,Valor\n01/11,Café,-5000";
    expect(mapStatement(parseCsv(csv)).warnings.join(" ")).toMatch(/sin año/);
    expect(mapStatement(parseCsv(csv), { defaultYear: 2026 }).rows[0].date).toBe("2026-11-01");
  });
  it("sin encabezado infiere columnas por contenido", () => {
    const r = mapStatement(parseCsv("01/11/2026;Pago luz;-95.000\n02/11/2026;Salario;2.000.000\n03/11/2026;Mercado;-150.000"));
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ type: "expense", amountCents: 9_500_000, description: "Pago luz" });
  });
  it("archivo irreconocible no inventa filas", () => {
    const r = mapStatement(parseCsv("hola,mundo\nesto,no sirve"));
    expect(r.rows).toEqual([]);
    expect(r.warnings[0]).toMatch(/columnas/);
  });
});

describe("dedupe", () => {
  const base = { accountId: "a1", date: "2026-11-01", type: "expense", amountCents: 500_000, description: "Café Juan Valdez" };
  it("misma huella ignorando tildes, mayúsculas y referencias largas", () => {
    expect(dedupeHash(base)).toBe(dedupeHash({ ...base, description: "CAFE JUAN VALDEZ 98765432" }));
    expect(dedupeHash(base)).not.toBe(dedupeHash({ ...base, amountCents: 600_000 }));
    expect(dedupeHash(base)).not.toBe(dedupeHash({ ...base, accountId: "a2" }));
  });
  it("dos movimientos idénticos el mismo día no se confunden, y re-importar da los mismos hashes", () => {
    const h = hashAll([base, base, { ...base, amountCents: 1 }]);
    expect(new Set(h).size).toBe(3);
    expect(hashAll([base, base, { ...base, amountCents: 1 }])).toEqual(h);
  });
});

describe("categorize", () => {
  const rules = [
    { pattern: "rappi", categoryId: "dom", own: false }, { pattern: "rappi prime", categoryId: "sus", own: false },
    { pattern: "uber", categoryId: "trans", own: false }, { pattern: "uber", categoryId: "mia", own: true },
  ];
  it("patrón más largo gana y las reglas propias pesan más", () => {
    expect(categorizeByMerchants("COMPRA RAPPI*123", rules)).toBe("dom");
    expect(categorizeByMerchants("Rappi Prime mensual", rules)).toBe("sus");
    expect(categorizeByMerchants("UBER TRIP", rules)).toBe("mia");
    expect(categorizeByMerchants("Tienda de barrio", rules)).toBeNull();
  });
  it("patrones cortos exigen palabra completa; los largos toleran palabras pegadas", () => {
    const r = [{ pattern: "eps", categoryId: "salud", own: false }, { pattern: "rappi", categoryId: "dom", own: false }];
    expect(categorizeByMerchants("PAGO REPSOL", r)).toBeNull();
    expect(categorizeByMerchants("PAGO EPS SURA", r)).toBe("salud");
    expect(categorizeByMerchants("COMPRARAPPI 123", r)).toBe("dom");
  });
  it("categoría por nombre sin importar tildes", () => {
    const cats = [{ id: "1", name: "Restaurantes y domicilios" }, { id: "2", name: "Mercado" }];
    expect(matchCategoryByName("mercado", cats)).toBe("2");
    expect(matchCategoryByName("Restaurantes", cats)).toBe("1");
    expect(matchCategoryByName("Viajes", cats)).toBeNull();
    expect(matchCategoryByName(null, cats)).toBeNull();
  });
  it("normalizeText", () => expect(normalizeText("CAFÉ  Ñandú 123456789!")).toBe("cafe nandu"));
});
