const NAMES: Record<string, string> = { accounts: "cuentas", projects: "proyectos", goals: "metas de ahorro activas" };

/** Traduce el error 'plan_limit:<clave>' que lanza la base de datos a un mensaje para el usuario; null si no es un error de límite. */
export function planLimitMessage(dbMessage: string | undefined | null): string | null {
  const m = dbMessage?.match(/plan_limit:(\w+)/);
  if (!m) return null;
  return `Llegaste al límite de ${NAMES[m[1]] ?? "tu plan"}. Mejora tu plan en «Mi plan» para agregar más.`;
}
