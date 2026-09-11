/**
 * Formato sólo en la orilla. Todo lo que viaja y se guarda son centavos
 * enteros y fechas 'YYYY-MM-DD'.
 */

/**
 * El prototipo escribe $22,800: sin centavos cuando la cifra es redonda, que
 * es como los lleva la tienda. Los centavos sólo aparecen si de verdad existen,
 * para no esconder dinero.
 */
const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2,
})

export function money(cents: number): string {
  return MXN.format(cents / 100)
}

export function dateMX(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** "Lunes 08/09" — el encabezado de cada día en el reporte de la semana. */
export function weekdayMX(date: string): string {
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const at = new Date(Date.UTC(y as number, (m as number) - 1, d as number))
  return `${DAYS[at.getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

export function dateTimeMX(iso: string | null | undefined): string {
  if (!iso) return '—'
  const at = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  return at.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = value / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`
}

/** "12,500" o "12500.50" → centavos. Devuelve null si no se entiende. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? Math.round(value * 100) : null
}
