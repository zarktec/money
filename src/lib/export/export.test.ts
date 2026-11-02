/* eslint-disable @typescript-eslint/no-explicit-any */
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fakeDb } from "@/test/fakedb";
import { BACKUP_TABLES, loadBackup, loadTransactions } from "./data";
import { buildWorkbook } from "./excel";
import { buildMonthlyPdf, fit } from "./pdf";
import type { ExportTx } from "./data";

const tx = (o: Partial<ExportTx> = {}): ExportTx => ({ date: "2026-11-05", type: "expense", amountCents: 8_500_000, account: "Ahorros", toAccount: "", category: "Restaurantes y domicilios", description: "Almuerzo", status: "confirmed", source: "manual", project: "", ...o });

describe("loadTransactions", () => {
  it("resuelve nombres y trae todas las filas pasado el tope de 1.000", async () => {
    const db = fakeDb({
      accounts: [{ id: "a1", name: "Ahorros" }], expense_categories: [{ id: "c1", name: "Mercado" }], income_types: [{ id: "i1", name: "Salario" }], projects: [],
      transactions: Array.from({ length: 2300 }, (_, i) => ({ id: `t${i}`, type: i === 0 ? "income" : "expense", amount_cents: 100, occurred_on: "2026-11-05", account_id: "a1", to_account_id: null, category_id: i === 0 ? null : "c1", income_type_id: i === 0 ? "i1" : null, project_id: null, description: `m${i}`, status: "confirmed", source: "manual" })),
    }, {}, { maxRows: 1000 });
    const r = await loadTransactions(db as any, "2026-11-01", "2026-11-30");
    expect(r).toHaveLength(2300);
    expect(r[0]).toMatchObject({ account: "Ahorros", category: "Salario", type: "income" });
    expect(r[1].category).toBe("Mercado");
  });
});

describe("Excel", () => {
  it("genera un libro legible con montos NUMÉRICOS en pesos y fechas reales", async () => {
    const buf = await buildWorkbook({ from: "2026-11-01", to: "2026-11-30", accounts: [{ name: "Ahorros", type: "savings", balanceCents: 12_300_000 }],
      transactions: [tx(), tx({ type: "income", amountCents: 500_000_000, description: "Nómina", category: "Salario" }), tx({ type: "transfer", amountCents: 100_000, toAccount: "Efectivo" }), tx({ status: "pending_review", amountCents: 999_900 })] });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Egresos por categoría", "Movimientos", "Cuentas"]);
    const mov = wb.getWorksheet("Movimientos")!;
    expect(mov.getRow(1).values).toEqual([undefined, "Fecha", "Tipo", "Valor", "Cuenta", "Hacia cuenta", "Categoría", "Descripción", "Estado", "Origen", "Proyecto"]);
    const r2 = mov.getRow(2);
    expect(r2.getCell(1).value).toBeInstanceOf(Date);
    expect((r2.getCell(1).value as Date).toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(r2.getCell(3).value).toBe(85_000);                       // número, no texto: se puede sumar en Excel
    expect(typeof r2.getCell(3).value).toBe("number");
    expect(mov.getRow(4).getCell(2).value).toBe("Transferencia");
    expect(mov.getRow(5).getCell(8).value).toBe("Por revisar");
    // el resumen NO cuenta transferencias ni movimientos por revisar
    const res = wb.getWorksheet("Resumen")!;
    expect([res.getRow(3).getCell(2).value, res.getRow(4).getCell(2).value, res.getRow(5).getCell(2).value]).toEqual([5_000_000, 85_000, 4_915_000]);
    expect(wb.getWorksheet("Cuentas")!.getRow(2).getCell(3).value).toBe(123_000);
  });
  it("funciona sin movimientos", async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await buildWorkbook({ from: "a", to: "b", transactions: [], accounts: [] })) as any);
    expect(wb.getWorksheet("Movimientos")!.rowCount).toBe(1);
  });
});

describe("PDF", () => {
  it("fit: reemplaza lo que WinAnsi no puede codificar (emoji, flechas) y recorta lo largo — sin lanzar", async () => {
    const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
    expect(fit(f, "Café 🍕 mañana → ñandú", 10, 500)).toBe("Café ? mañana ? ñandú");
    expect(fit(f, "x".repeat(500), 10, 100).endsWith("...")).toBe(true);
    expect(f.widthOfTextAtSize(fit(f, "x".repeat(500), 10, 100), 10)).toBeLessThanOrEqual(100);
    expect(fit(f, "", 10, 100)).toBe("");
  });
  it("genera un PDF válido con varias páginas, aun con descripciones raras", async () => {
    const many = Array.from({ length: 150 }, (_, i) => tx({ description: i === 3 ? "Pizza 🍕 → fiesta 😀" : `Movimiento número ${i} con una descripción bastante larga para probar el recorte de texto`, amountCents: 100_000 + i, date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}` }));
    const bytes = await buildMonthlyPdf({ userName: "Ana Pérez", month: "2026-11", transactions: [...many, tx({ status: "pending_review" }), tx({ type: "transfer" })] });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.getTitle()).toBe("Informe 2026-11");
  });
  it("PDF vacío y con el mes sin movimientos", async () => {
    const pdf = await PDFDocument.load(await buildMonthlyPdf({ userName: "x", month: "2026-02", transactions: [] }));
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe("Respaldo", () => {
  it("NUNCA lee con * las tablas que guardan secretos (tokens de correo, fuente de pago, evento crudo)", () => {
    for (const t of ["email_connections", "subscriptions", "payments", "profiles"]) {
      const cfg = BACKUP_TABLES.find((x) => x.table === t)!;
      expect(cfg.columns, t).not.toBe("*");
      expect(cfg.columns, t).not.toMatch(/secret|token|payment_source|raw|sync_cursor/);
    }
    expect(BACKUP_TABLES.map((t) => t.table)).not.toContain("push_subscriptions");
  });
  it("incluye solo los datos del usuario (otro usuario no se filtra) y todos los de una tabla grande", async () => {
    const db = fakeDb({
      accounts: [{ id: "a1", user_id: "u1" }, { id: "a2", user_id: "otro" }], profiles: [{ id: "u1", full_name: "Ana" }, { id: "otro", full_name: "Luis" }],
      transactions: Array.from({ length: 1500 }, (_, i) => ({ id: `t${i}`, user_id: i % 3 === 0 ? "otro" : "u1" })), expense_categories: [{ id: "g", user_id: null }, { id: "mine", user_id: "u1" }],
    }, {}, { maxRows: 1000 });
    const b = await loadBackup(db as any, "u1");
    expect((b.data.accounts as any[]).map((r) => r.id)).toEqual(["a1"]);
    expect((b.data.profiles as any[]).map((r) => r.id)).toEqual(["u1"]);
    expect(b.data.transactions).toHaveLength(1000);
    expect((b.data.expense_categories as any[]).map((r) => r.id)).toEqual(["mine"]);   // las globales no son "sus" datos
    expect(b).toMatchObject({ app: "Money", version: 1 });
    expect(Object.keys(b.data)).toHaveLength(BACKUP_TABLES.length);
  });
});
