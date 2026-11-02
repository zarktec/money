/** Datos del responsable. Se completan con variables de entorno; lo que falte se muestra resaltado para que no se publique por descuido. */
const mark = (s: string) => `[[${s}]]`;
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_NAME || mark("RAZÓN SOCIAL"),
  nit: process.env.NEXT_PUBLIC_LEGAL_NIT || mark("NIT"),
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || mark("DOMICILIO"),
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || mark("CORREO DE CONTACTO PARA DATOS PERSONALES"),
  updated: "2 de noviembre de 2026",
  /** Solo cuando un abogado revisó y aprobó los textos se activa esta variable y desaparece el aviso de borrador. */
  reviewed: process.env.NEXT_PUBLIC_LEGAL_REVIEWED === "true",
};

/** Parte un texto en tramos normales y tramos [[resaltados]] (puntos pendientes de decisión o validación). */
export function splitMarks(text: string): { text: string; marked: boolean }[] {
  return text.split(/(\[\[.*?\]\])/g).filter(Boolean).map((t) => (t.startsWith("[[") && t.endsWith("]]") ? { text: t.slice(2, -2), marked: true } : { text: t, marked: false }));
}
