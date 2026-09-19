/**
 * Los cinco periodos que se repiten donde sea que se filtre algo por fecha:
 * el reporte de la dueña, y ahora también los rollos de pagos y de gastos.
 * Vivía sólo en Reports.tsx; separado aquí para no triplicarlo.
 */

const toUTC = (d: string) => new Date(`${d}T00:00:00Z`)
const fromUTC = (d: Date) => d.toISOString().slice(0, 10)
const addDaysStr = (d: string, n: number) => { const x = toUTC(d); x.setUTCDate(x.getUTCDate() + n); return fromUTC(x) }
const mondayOf = (d: string) => addDaysStr(d, -((toUTC(d).getUTCDay() + 6) % 7))
const monthRange = (d: string, offset: number): [string, string] => {
  const x = toUTC(d)
  const first = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + offset, 1))
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + offset + 1, 0))
  return [fromUTC(first), fromUTC(last)]
}

export type PeriodKey = 'week' | 'last_week' | 'month' | 'last_month' | 'custom'
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Esta semana' },
  { key: 'last_week', label: 'Semana pasada' },
  { key: 'month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
  { key: 'custom', label: 'Personalizado' },
]

export function rangeFor(key: PeriodKey, today: string): [string, string] {
  if (key === 'week') { const from = mondayOf(today); return [from, addDaysStr(from, 6) > today ? today : addDaysStr(from, 6)] }
  if (key === 'last_week') { const from = mondayOf(addDaysStr(today, -7)); return [from, addDaysStr(from, 6)] }
  if (key === 'month') { const [from, to] = monthRange(today, 0); return [from, to > today ? today : to] }
  if (key === 'last_month') return monthRange(today, -1)
  return [today, today]
}

export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10)
}
