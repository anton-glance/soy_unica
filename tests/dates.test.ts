import { describe, expect, it } from 'vitest'
import { addDays, weekStart } from '../worker/lib/dates'

/**
 * C6 — La tienda cuenta la semana de lunes a domingo. El domingo es el último
 * día de su semana, no el primero de la siguiente: ahí es donde se equivoca
 * `getUTCDay()`, que numera el domingo como 0.
 */
describe('la semana de la tienda va de lunes a domingo', () => {
  it('el lunes es su propio inicio', () => {
    expect(weekStart('2026-09-07')).toBe('2026-09-07')
  })

  it('cualquier día entre semana cae en el lunes anterior', () => {
    for (const day of ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']) {
      expect(weekStart(day)).toBe('2026-09-07')
    }
  })

  it('el domingo pertenece a la semana que ya empezó, no a la siguiente', () => {
    expect(weekStart('2026-09-13')).toBe('2026-09-07')
    // Y el lunes de junto sí abre semana nueva.
    expect(weekStart('2026-09-14')).toBe('2026-09-14')
  })

  it('la semana siempre son siete días, del lunes al domingo', () => {
    const from = weekStart('2026-01-01')
    expect(from).toBe('2025-12-29')
    expect(addDays(from, 6)).toBe('2026-01-04')
  })

  it('atraviesa el cambio de año y el año bisiesto sin saltarse días', () => {
    expect(weekStart('2028-03-01')).toBe('2028-02-28')
    expect(addDays('2028-02-28', 6)).toBe('2028-03-05')
  })
})
