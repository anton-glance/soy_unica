import { describe, expect, it } from 'vitest'
import { evaluatePlans, generateSchedule, offerablePlans, type Plan } from '../worker/lib/plans'
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

describe('los cuatro planes reales de la tienda', () => {
  // Los del contrato (docs/contrato_de_novia_nov_2024.docx, punto 1) más el de
  // contado. Ninguno lleva precio mínimo.
  const CONTADO_R = plan({ id: 1, name: 'Contado', splits: [100], discount_pct: 10 })
  const MITAD_R = plan({ id: 2, name: 'Mitad y mitad', splits: [50, 50] })
  const CUARENTA = plan({ id: 3, name: '40/30/30', splits: [40, 30, 30], max_months: 2 })
  const VEINTE = plan({ id: 4, name: '20 × 5', splits: [20, 20, 20, 20, 20], max_months: 4 })
  const TIENDA = [CONTADO_R, MITAD_R, CUARENTA, VEINTE]

  const evaluate = (weddingDate: string | null, listTotalCents = 1_380_000) =>
    evaluatePlans({ plans: TIENDA, listTotalCents, signedOn: '2026-09-11', weddingDate, minDaysBeforeWedding: 15 })

  it('un vestido de $13,800 con boda en dos semanas ofrece contado y mitad y mitad', () => {
    const { offers } = evaluate('2026-09-25')
    expect(offers.map((o) => o.plan.name)).toEqual(['Contado', 'Mitad y mitad'])
  })

  it('y dice por qué los de meses no caben, no sólo que no caben', () => {
    const { rejected } = evaluate('2026-09-25')
    const cuarenta = rejected.find((r) => r.plan.name === '40/30/30')
    expect(cuarenta?.reason).toBe('too_close_to_wedding')
    expect(cuarenta?.detail).toMatch(/después de la boda/)
  })

  it('el anticipo de hoy no cuenta para la regla de días antes de la boda', () => {
    // Se entrega en el mostrador el mismo día: contarlo dejaba sin ningún plan
    // a una novia con boda cercana, que es justo la que paga de contado.
    const { offers } = evaluate('2026-09-12')
    expect(offers.map((o) => o.plan.name)).toEqual(['Contado', 'Mitad y mitad'])
  })

  it('con boda lejana caben los cuatro', () => {
    expect(evaluate('2027-06-12').offers).toHaveLength(4)
  })

  it('sin fecha de evento sólo los que se liquidan al recoger', () => {
    const { offers, rejected } = evaluate(null)
    expect(offers.map((o) => o.plan.name)).toEqual(['Contado', 'Mitad y mitad'])
    expect(rejected.every((r) => r.reason === 'needs_date')).toBe(true)
    expect(rejected[0]?.detail).toMatch(/fecha de evento/)
  })

  it('el contado aplica su descuento y se paga en un solo pago', () => {
    const contado = evaluate('2027-06-12').offers[0]
    expect(contado?.discount_cents).toBe(138_000)
    expect(contado?.total_cents).toBe(1_242_000)
    expect(contado?.schedule).toHaveLength(1)
  })

  it('mitad y mitad liquida al recoger, sin fecha', () => {
    const mitad = evaluate('2027-06-12').offers[1]
    expect(mitad?.schedule[1]).toMatchObject({ due_type: 'on_pickup', due_date: null })
  })

  it('40/30/30 y 20 × 5 reparten como dice el contrato', () => {
    const offers = evaluate('2027-06-12').offers
    expect(offers[2]?.schedule.map((r) => r.amount_cents)).toEqual([552_000, 414_000, 414_000])
    expect(offers[3]?.schedule.map((r) => r.amount_cents)).toEqual([276_000, 276_000, 276_000, 276_000, 276_000])
  })

  it('un plan desactivado dice que está desactivado', () => {
    const { rejected } = evaluatePlans({
      plans: [{ ...CONTADO_R, active: 0 }], listTotalCents: 1_380_000,
      signedOn: '2026-09-11', weddingDate: null, minDaysBeforeWedding: 15,
    })
    expect(rejected[0]).toMatchObject({ reason: 'inactive' })
  })

  it('un precio fuera de rango dice el rango', () => {
    const { rejected } = evaluatePlans({
      plans: [plan({ name: 'Caro', min_price_cents: 5_000_000 })], listTotalCents: 1_380_000,
      signedOn: '2026-09-11', weddingDate: null, minDaysBeforeWedding: 15,
    })
    expect(rejected[0]?.reason).toBe('price_below')
    expect(rejected[0]?.detail).toContain('$50,000')
  })
})
