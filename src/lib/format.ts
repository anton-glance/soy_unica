/**
 * Formato sólo en la orilla. Todo lo que viaja y se guarda son centavos
 * enteros y fechas 'YYYY-MM-DD'.
 */

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function money(cents: number): string {
  return MXN.format(cents / 100)
}

/** Sin centavos, para las cifras grandes de pantalla. */
export function moneyShort(cents: number): string {
  return MXN.format(Math.round(cents / 100)).replace(/[.,]00$/, '')
}

export function dateMX(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
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
