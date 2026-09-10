/** Fechas de calendario como 'YYYY-MM-DD'; marcas de tiempo como ISO en UTC. */

export function nowIso(at: Date = new Date()): string {
  return at.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function todayISO(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10)
}

export function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function toUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

/**
 * Suma meses conservando el día, recortando al último día del mes destino:
 * 31 de enero + 1 mes = 28 (o 29) de febrero. Es como cuenta la tienda.
 */
export function addMonths(date: string, months: number): string {
  const d = toUTC(date)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = toUTC(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Días completos de `from` a `to`; negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000)
}

/** dd/mm/aaaa, como se lee en la tienda. */
export function formatDateMX(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}
