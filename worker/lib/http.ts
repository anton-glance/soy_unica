import type { Context } from 'hono'

/**
 * Cuerpo JSON como objeto parcial. Un cuerpo vacío o mal formado se trata como
 * "no llegó nada": la validación de cada campo vive en su ruta y responde en
 * español.
 */
export async function readJson<T>(c: Context): Promise<Partial<T>> {
  return (await c.req.json<T>().catch(() => ({}))) as Partial<T>
}
