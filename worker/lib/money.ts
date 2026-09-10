/**
 * Todo el dinero del sistema es un entero de centavos. Se formatea únicamente
 * en la orilla (pantalla o impresión), nunca antes.
 */

export function centsToMXN(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const pesos = Math.trunc(abs / 100)
  const centavos = abs % 100
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}$${grouped}.${String(centavos).padStart(2, '0')}`
}

/** Acepta "12,500", "12500.50", "$12 500" y devuelve centavos. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/**
 * Reparte `total` según porcentajes enteros que suman 100. El sobrante de
 * redondeo cae en la última parcialidad para que el anticipo quede en la cifra
 * que se le dijo a la novia y la suma cuadre exactamente con el total.
 */
export function splitByPercent(total: number, percents: readonly number[]): number[] {
  if (percents.length === 0) return []
  const sum = percents.reduce((a, b) => a + b, 0)
  if (sum !== 100) throw new Error(`Los porcentajes del plan suman ${sum}, deben sumar 100`)
  const parts = percents.map((p) => Math.floor((total * p) / 100))
  const assigned = parts.reduce((a, b) => a + b, 0)
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0) + (total - assigned)
  return parts
}

/** Porcentaje sobre centavos, redondeado al centavo. */
export function pctOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100)
}
