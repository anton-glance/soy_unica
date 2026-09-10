/** Helpers mínimos sobre D1. Sin ORM: aquí se escribe SQL. */

export type Bind = string | number | null

export async function one<T>(db: D1Database, sql: string, ...args: Bind[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>()
}

export async function all<T>(db: D1Database, sql: string, ...args: Bind[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...args).all<T>()
  return results ?? []
}

export async function run(db: D1Database, sql: string, ...args: Bind[]): Promise<D1Result> {
  return db.prepare(sql).bind(...args).run()
}

export function stmt(db: D1Database, sql: string, ...args: Bind[]): D1PreparedStatement {
  return db.prepare(sql).bind(...args)
}

/** Sólo dígitos: así se busca un teléfono sin importar cómo se capturó. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function boolInt(value: unknown): number {
  return value ? 1 : 0
}
