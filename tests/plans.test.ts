import { describe, expect, it } from 'vitest'
import { generateSchedule, offerablePlans, type Plan } from '../worker/lib/plans'
import { splitByPercent } from '../worker/lib/money'

const plan = (over: Partial<Plan>): Plan => ({
  id: 1, name: 'Plan', splits: [100], min_price_cents: 0, max_price_cents: null,
  max_months: 0, discount_pct: 0, active: 1, ...over,
})

const CONTADO = plan({ id: 1, name: 'Pago de contado', splits: [100], discount_pct: 10 })
const MITAD = plan({ id: 2, name: 'Mitad y mitad', splits: [50, 50] })
const TRES = plan({ id: 3, name: 'Tres meses', splits: [50, 25, 25], max_months: 2, min_price_cents: 800_00 })
const SEIS = plan({ id: 4, name: 'Seis meses', splits: [40, 12, 12, 12, 12, 12], max_months: 5, min_price_cents: 1_500_00 })
const ALL = [CONTADO, MITAD, TRES, SEIS]

const offers = (over: Partial<Parameters<typeof offerablePlans>[0]> = {}) =>
  offerablePlans({
    plans: ALL, listTotalCents: 1_850_000, signedOn: '2026-09-10',
    weddingDate: '2027-06-12', minDaysBeforeWedding: 15, ...over,
  })

describe('generación del calendario', () => {
  it('cobra el anticipo el día de la firma y una parcialidad por mes', () => {
    expect(generateSchedule(TRES, 1_200_000, '2026-09-10')).toEqual([
      { seq: 1, due_type: 'fixed', due_date: '2026-09-10', amount_cents: 600_000 },
      { seq: 2, due_type: 'fixed', due_date: '2026-10-10', amount_cents: 300_000 },
      { seq: 3, due_type: 'fixed', due_date: '2026-11-10', amount_cents: 300_000 },
    ])
  })

  it('deja el resto al recoger el vestido en los planes sin meses', () => {
    expect(generateSchedule(MITAD, 1_850_000, '2026-09-10')).toEqual([
      { seq: 1, due_type: 'fixed', due_date: '2026-09-10', amount_cents: 925_000 },
      { seq: 2, due_type: 'on_pickup', due_date: null, amount_cents: 925_000 },
    ])
  })

  it('recorta al último día del mes cuando el día no existe', () => {
    const rows = generateSchedule(TRES, 900_000, '2026-01-31')
    expect(rows[1]?.due_date).toBe('2026-02-28')
    expect(rows[2]?.due_date).toBe('2026-03-31')
  })

  it('las parcialidades siempre suman exactamente el total', () => {
    for (const total of [1, 999, 1_000_001, 1_234_567, 1_850_000]) {
      for (const p of ALL) {
        const sum = generateSchedule(p, total, '2026-09-10').reduce((a, r) => a + r.amount_cents, 0)
        expect(sum).toBe(total)
      }
    }
  })

  it('reparte el sobrante de redondeo en la última parcialidad, nunca en el anticipo', () => {
    const parts = splitByPercent(1_000_001, [50, 25, 25])
    expect(parts).toEqual([500_000, 250_000, 250_001])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_001)
  })

  it('se niega a repartir porcentajes que no suman 100', () => {
    expect(() => splitByPercent(1000, [50, 40])).toThrow(/suman 90/)
  })
})

describe('qué planes se pueden ofrecer', () => {
  it('deja fuera los planes cuyo mínimo de precio no alcanza', () => {
    const names = offers({ listTotalCents: 500_00 }).map((o) => o.plan.name)
    expect(names).toEqual(['Pago de contado', 'Mitad y mitad'])
  })

  it('sin fecha de boda sólo ofrece los planes sin parcialidades con fecha', () => {
    const names = offers({ weddingDate: null }).map((o) => o.plan.name)
    expect(names).toEqual(['Pago de contado', 'Mitad y mitad'])
    for (const offer of offers({ weddingDate: null })) {
      expect(offer.schedule.slice(1).every((r) => r.due_type === 'on_pickup')).toBe(true)
    }
  })

  it('deja fuera el plan cuya última parcialidad cae demasiado cerca de la boda', () => {
    // Seis meses termina el 10/02/2027; la boda es el 20/02/2027: 10 días.
    const names = offers({ weddingDate: '2027-02-20', minDaysBeforeWedding: 15 }).map((o) => o.plan.name)
    expect(names).not.toContain('Seis meses')
    expect(names).toContain('Tres meses')
  })

  it('acepta el plan que cae justo en el mínimo de días antes de la boda', () => {
    // Tres meses termina el 10/11/2026; 15 días después es el 25/11/2026.
    const names = offers({ weddingDate: '2026-11-25', minDaysBeforeWedding: 15 }).map((o) => o.plan.name)
    expect(names).toContain('Tres meses')
  })

  it('ignora los planes inactivos', () => {
    const names = offerablePlans({
      plans: [{ ...MITAD, active: 0 }, CONTADO], listTotalCents: 1_850_000,
      signedOn: '2026-09-10', weddingDate: null, minDaysBeforeWedding: 15,
    }).map((o) => o.plan.name)
    expect(names).toEqual(['Pago de contado'])
  })

  it('aplica el descuento del plan de contado al total, no al precio de lista', () => {
    const contado = offers().find((o) => o.plan.name === 'Pago de contado')
    expect(contado?.discount_cents).toBe(185_000)
    expect(contado?.total_cents).toBe(1_665_000)
    expect(contado?.schedule[0]?.amount_cents).toBe(1_665_000)
  })
})
