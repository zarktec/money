/**
 * Destino de redirección seguro tras iniciar sesión o abrir un enlace del correo. Solo se aceptan rutas internas
 * ("/algo"); cualquier cosa que pueda salir del sitio (URL completa, "//host", "/\host", con caracteres de control)
 * cae en el valor por defecto. Evita la redirección abierta.
 */
export function safeNext(value: unknown, fallback = "/inicio"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const u = new URL(value, "http://internal.invalid");
    if (u.origin !== "http://internal.invalid") return fallback;
  } catch { return fallback; }
  return value;
}
