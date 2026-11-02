/**
 * Lee TODAS las filas de una consulta, página por página. PostgREST (Supabase) devuelve como máximo 1.000 filas por respuesta
 * aunque se pida `.limit(5000)`, y lo hace en silencio: sin paginar, totales y promedios de usuarios con muchos movimientos salen mal.
 * `build` debe incluir un orden estable (p. ej. fecha e id) para que las páginas no se solapen ni se salten filas.
 */
export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000, maxRows = 200_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
