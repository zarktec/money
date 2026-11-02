import ExcelJS from "exceljs";
import type { ExportAccount, ExportTx } from "./data";

const TYPE = { income: "Ingreso", expense: "Egreso", transfer: "Transferencia" } as const;
const STATUS: Record<string, string> = { confirmed: "Confirmado", pending_review: "Por revisar" };
const MONEY = '"$"#,##0';
const toDate = (iso: string) => new Date(iso + "T00:00:00Z");

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width: number; money?: boolean; date?: boolean }[], rows: object[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: { numFmt: c.money ? MONEY : c.date ? "yyyy-mm-dd" : undefined } }));
  ws.addRows(rows);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  head.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** Libro de Excel con montos NUMÉRICOS en pesos (se pueden sumar y filtrar) y fechas reales. */
export async function buildWorkbook(input: { from: string; to: string; transactions: ExportTx[]; accounts: ExportAccount[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Money"; wb.created = new Date();
  const confirmed = input.transactions.filter((t) => t.status === "confirmed" && t.type !== "transfer");
  const sum = (t: string) => confirmed.filter((x) => x.type === t).reduce((a, x) => a + x.amountCents, 0) / 100;

  const res = sheet(wb, "Resumen", [{ header: "Concepto", key: "k", width: 28 }, { header: "Valor", key: "v", width: 20, money: true }], [
    { k: `Periodo ${input.from} a ${input.to}`, v: null }, { k: "Ingresos", v: sum("income") }, { k: "Egresos", v: sum("expense") }, { k: "Balance", v: sum("income") - sum("expense") },
  ]);
  res.getRow(5).font = { bold: true };

  const byCat = new Map<string, number>();
  for (const t of confirmed) if (t.type === "expense") byCat.set(t.category || "Sin categoría", (byCat.get(t.category || "Sin categoría") ?? 0) + t.amountCents);
  sheet(wb, "Egresos por categoría", [{ header: "Categoría", key: "c", width: 32 }, { header: "Total", key: "t", width: 18, money: true }],
    [...byCat].sort((a, b) => b[1] - a[1]).map(([c, t]) => ({ c, t: t / 100 })));

  sheet(wb, "Movimientos", [
    { header: "Fecha", key: "date", width: 12, date: true }, { header: "Tipo", key: "type", width: 14 }, { header: "Valor", key: "amount", width: 16, money: true },
    { header: "Cuenta", key: "account", width: 22 }, { header: "Hacia cuenta", key: "toAccount", width: 22 }, { header: "Categoría", key: "category", width: 26 },
    { header: "Descripción", key: "description", width: 40 }, { header: "Estado", key: "status", width: 14 }, { header: "Origen", key: "source", width: 18 }, { header: "Proyecto", key: "project", width: 20 },
  ], input.transactions.map((t) => ({ ...t, date: toDate(t.date), type: TYPE[t.type], amount: t.amountCents / 100, status: STATUS[t.status] ?? t.status })));

  sheet(wb, "Cuentas", [{ header: "Cuenta", key: "name", width: 30 }, { header: "Tipo", key: "type", width: 18 }, { header: "Saldo", key: "bal", width: 18, money: true }],
    input.accounts.map((a) => ({ name: a.name, type: a.type, bal: a.balanceCents / 100 })));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
