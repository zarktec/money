/** Montos y fechas tal como aparecen en extractos colombianos. */

/** "1.234.567,89", "-45.000", "(45.000)", "45.000-", "$ 45,000.00" → número en unidades mayores (pesos), con signo. */
export function parseAmountText(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/cop|\$|\s/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  let decimalAt = -1;
  if (dot >= 0 && comma >= 0) decimalAt = Math.max(dot, comma);                 // el último separador es el decimal
  else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? "." : ",";
    const count = s.split(sep).length - 1;
    const idx = s.lastIndexOf(sep);
    // Un solo separador con exactamente 3 dígitos detrás = miles ("45.000"); con 1-2 dígitos = decimal ("45,5")
    if (count === 1 && s.length - idx - 1 !== 3) decimalAt = idx;
  }
  const clean = decimalAt >= 0 ? s.slice(0, decimalAt).replace(/[.,]/g, "") + "." + s.slice(decimalAt + 1) : s.replace(/[.,]/g, "");
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const validDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Acepta yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy y dd/mm (con año por defecto). Asume día/mes (Colombia) salvo que el mes sea imposible. */
export function parseDateText(raw: string, defaultYear?: number): string | null {
  const s = raw.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return validDate(y, mo, d) ? iso(y, mo, d) : null; }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : defaultYear;
  if (y === undefined) return null;
  let day = a, month = b;
  if (b > 12 && a <= 12) { day = b; month = a; } // formato mm/dd
  return validDate(y, month, day) ? iso(y, month, day) : null;
}

/** Normaliza para comparar y categorizar: minúsculas, sin tildes, sin referencias largas, solo letras y números. */
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\d{6,}/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
