import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney } from "@/lib/finance/money";
import type { ExportTx } from "./data";

const W = 595, H = 842, M = 40, GREEN = rgb(0.02, 0.59, 0.41), GRAY = rgb(0.42, 0.45, 0.5), INK = rgb(0.06, 0.09, 0.16);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Las fuentes estándar de PDF solo codifican WinAnsi y LANZAN un error con cualquier otro carácter (un emoji en una descripción
 * tumbaría todo el informe). Se sustituye lo no codificable por «?» y se recorta con «…» si no cabe en el ancho.
 */
export function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const ok = new Set(font.getCharacterSet());
  let s = [...text.replace(/\s+/g, " ").trim()].map((c) => (ok.has(c.codePointAt(0)!) ? c : "?")).join("");
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + "...", size) > maxWidth) s = s.slice(0, -1);
  return s + "...";
}

export interface MonthlyReport { userName: string; month: string; transactions: ExportTx[] }

export async function buildMonthlyPdf(r: MonthlyReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Informe ${r.month}`); doc.setCreator("Money"); doc.setProducer("Money");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [y, m] = r.month.split("-").map(Number);
  const label = `${MESES[m - 1]} ${y}`;
  const txs = r.transactions.filter((t) => t.type !== "transfer");
  const ok = txs.filter((t) => t.status === "confirmed");
  const income = ok.filter((t) => t.type === "income").reduce((a, t) => a + t.amountCents, 0), expense = ok.filter((t) => t.type === "expense").reduce((a, t) => a + t.amountCents, 0);

  let page!: PDFPage, cursor = 0;
  const newPage = () => { page = doc.addPage([W, H]); page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GREEN }); cursor = H - M - 10; };
  const need = (h: number) => { if (cursor - h < M + 20) newPage(); };
  const text = (s: string, x: number, size = 10, f = font, color = INK, maxW = W - 2 * M) => page.drawText(fit(f, s, size, maxW), { x, y: cursor, size, font: f, color });
  const right = (s: string, xr: number, size = 10, f = font, color = INK) => { const t = fit(f, s, size, 140); page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: cursor, size, font: f, color }); };

  newPage();
  text("Money", M, 11, bold, GREEN); cursor -= 26;
  text("Informe de movimientos", M, 22, bold); cursor -= 22;
  text(`${label.charAt(0).toUpperCase() + label.slice(1)}  -  ${r.userName}`, M, 11, font, GRAY); cursor -= 34;

  for (const [i, [k, v, c]] of ([["Ingresos", income, GREEN], ["Egresos", expense, INK], ["Balance", income - expense, income - expense < 0 ? rgb(0.86, 0.15, 0.15) : GREEN]] as const).entries()) {
    const x = M + i * 175;
    page.drawRectangle({ x, y: cursor - 36, width: 165, height: 50, borderColor: rgb(0.9, 0.91, 0.92), borderWidth: 1 });
    page.drawText(k, { x: x + 10, y: cursor + 2, size: 9, font, color: GRAY });
    page.drawText(fit(bold, formatMoney(v), 14, 145), { x: x + 10, y: cursor - 22, size: 14, font: bold, color: c });
  }
  cursor -= 70;

  const byCat = new Map<string, number>();
  for (const t of ok) if (t.type === "expense") byCat.set(t.category || "Sin categoria", (byCat.get(t.category || "Sin categoria") ?? 0) + t.amountCents);
  if (byCat.size) {
    text("Egresos por categoría", M, 13, bold); cursor -= 20;
    for (const [c, v] of [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      need(16);
      text(c, M, 10, font, INK, 230); right(formatMoney(v), 380); right(`${expense ? Math.round((v / expense) * 100) : 0}%`, 430, 9, font, GRAY);
      page.drawRectangle({ x: 445, y: cursor - 1, width: Math.max(2, (expense ? v / expense : 0) * 110), height: 8, color: GREEN, opacity: 0.8 }); cursor -= 16;
    }
    cursor -= 14;
  }

  need(40);
  text("Movimientos", M, 13, bold); cursor -= 20;
  const header = () => { page.drawRectangle({ x: M - 4, y: cursor - 5, width: W - 2 * M + 8, height: 18, color: rgb(0.95, 0.96, 0.97) }); text("Fecha", M, 9, bold); text("Descripción", M + 62, 9, bold); text("Categoría", M + 270, 9, bold); right("Valor", W - M, 9, bold); cursor -= 18; };
  header();
  if (!txs.length) { text("No hay movimientos en este periodo.", M, 10, font, GRAY); cursor -= 16; }
  for (const t of txs) {
    if (cursor - 16 < M + 20) { newPage(); header(); }
    const pend = t.status !== "confirmed";
    text(t.date, M, 9, font, GRAY, 60); text(t.description || "(sin descripción)", M + 62, 9, font, INK, 200); text(t.category, M + 270, 9, font, GRAY, 130);
    right(`${t.type === "income" ? "+" : "-"}${formatMoney(t.amountCents)}${pend ? " *" : ""}`, W - M, 9, font, t.type === "income" ? GREEN : INK); cursor -= 14;
  }
  if (txs.some((t) => t.status !== "confirmed")) { cursor -= 6; need(14); text("* Movimiento por revisar: no se cuenta en los totales.", M, 8, font, GRAY); }

  const pages = doc.getPages();
  pages.forEach((p, i) => { p.drawText(`Generado por Money  -  Página ${i + 1} de ${pages.length}`, { x: M, y: 22, size: 8, font, color: GRAY }); });
  return doc.save();
}
