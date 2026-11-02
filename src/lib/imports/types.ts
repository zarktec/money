/** Fila propuesta que el usuario revisa antes de guardar. Viaja entre servidor y cliente. */
export interface DraftRow {
  key: string;
  date: string;                 // yyyy-MM-dd
  type: "income" | "expense";
  amountCents: number;
  description: string;
  categoryId: string | null;
  duplicate: boolean;           // ya existe un movimiento igual en esa cuenta
  confidence: number | null;    // solo filas extraídas con IA
}
export type ImportMode = "text" | "receipt" | "statement";
