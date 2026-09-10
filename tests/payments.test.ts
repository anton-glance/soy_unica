import { describe, expect, it } from 'vitest'
import { balanceOf, buildLedger, suggestedLateFee, type InstallmentRow, type PaymentRow } from '../worker/lib/payments'

const TODAY = '2026-09-10'

/** Tres meses sobre $12,000: 50 / 25 / 25. */
const SCHEDULE: InstallmentRow[] = [
  { id: 1, seq: 1, due_type: 'fixed', due_date: '2026-09-10', amount_cents: 600_000 },
  { id: 2, seq: 2, due_type: 'fixed', due_date: '2026-10-10', amount_cents: 300_000 },
  { id: 3, seq: 3, due_type: 'fixed', due_date: '2026-11-10', amount_cents: 300_000 },
]
const TOTAL = 1_200_000

const pay = (over: Partial<PaymentRow> & { amount_cents: number }): PaymentRow => ({
  id: 1, paid_at: TODAY, installment_id: null, voided_at: null, ...over,
})

describe('el saldo es total menos pagos no cancelados', () => {
  it('descuenta cada abono', () => {
    expect(balanceOf(TOTAL, [pay({ id: 1, amount_cents: 600_000 })])).toBe(600_000)
  })

  it('no descuenta los abonos cancelados', () => {
    const payments = [pay({ id: 1, amount_cents: 600_000 }), pay({ id: 2, amount_cents: 300_000, voided_at: '2026-09-11T00:00:00Z' })]
    expect(balanceOf(TOTAL, payments)).toBe(600_000)
  })
})

describe('aplicar abonos contra el plan fijo', () => {
  it('un abono exacto cubre su parcialidad y deja el resto pendiente', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [pay({ id: 1, amount_cents: 600_000, installment_id: 1 })], TODAY)
    expect(ledger.balance_cents).toBe(600_000)
    expect(ledger.coverage[0]).toMatchObject({ seq: 1, applied_cents: 600_000, remaining_cents: 0, status: 'covered' })
    expect(ledger.coverage[1]).toMatchObject({ seq: 2, applied_cents: 0, remaining_cents: 300_000, status: 'pending' })
    expect(ledger.next_due?.seq).toBe(2)
    expect(ledger.unapplied_cents).toBe(0)
  })

  it('un abono corto deja la parcialidad a medias con su remanente a la vista', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [pay({ id: 1, amount_cents: 250_000, installment_id: 1 })], TODAY)
    expect(ledger.balance_cents).toBe(950_000)
    expect(ledger.coverage[0]).toMatchObject({ applied_cents: 250_000, remaining_cents: 350_000 })
    // Vencía hoy y quedó a medias: no es 'partial', está vencida sólo cuando pasa la fecha.
    expect(ledger.coverage[0]?.status).toBe('partial')
    expect(ledger.next_due?.seq).toBe(1)
    expect(ledger.next_due?.remaining_cents).toBe(350_000)
  })

  it('un abono de más se corre a la siguiente parcialidad', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [pay({ id: 1, amount_cents: 800_000, installment_id: 1 })], TODAY)
    expect(ledger.coverage[0]).toMatchObject({ remaining_cents: 0, status: 'covered' })
    expect(ledger.coverage[1]).toMatchObject({ applied_cents: 200_000, remaining_cents: 100_000, status: 'partial' })
    expect(ledger.balance_cents).toBe(400_000)
    expect(ledger.unapplied_cents).toBe(0)
  })

  it('acepta muchos abonos chicos contra pocas parcialidades planeadas', () => {
    // El patrón real de la tienda: seis a diecinueve abonos contra tres a cinco
    // parcialidades. Ninguno se rechaza y el saldo sigue cuadrando.
    const payments = Array.from({ length: 19 }, (_, i) =>
      pay({ id: i + 1, amount_cents: 60_000, paid_at: `2026-09-${String(10 + i).padStart(2, '0')}` }))
    const ledger = buildLedger(TOTAL, SCHEDULE, payments, '2026-10-01')
    expect(ledger.paid_cents).toBe(1_140_000)
    expect(ledger.balance_cents).toBe(60_000)
    expect(ledger.coverage[0]?.status).toBe('covered')
    expect(ledger.coverage[2]?.remaining_cents).toBe(60_000)
  })

  it('lo que sobra del total queda como sobrepago, no desaparece', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [pay({ id: 1, amount_cents: 1_300_000 })], TODAY)
    expect(ledger.unapplied_cents).toBe(100_000)
    expect(ledger.balance_cents).toBe(-100_000)
    expect(ledger.coverage.every((r) => r.remaining_cents === 0)).toBe(true)
  })

  it('un abono dirigido a una parcialidad tardía rellena hacia atrás antes de sobrar', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [pay({ id: 1, amount_cents: 900_000, installment_id: 3 })], TODAY)
    expect(ledger.coverage[2]?.remaining_cents).toBe(0)
    expect(ledger.coverage[0]?.remaining_cents).toBe(0)
    expect(ledger.unapplied_cents).toBe(0)
    expect(ledger.balance_cents).toBe(300_000)
  })

  it('marca vencidas las parcialidades con fecha pasada y sin cubrir', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [], '2026-10-15')
    expect(ledger.overdue.map((r) => r.seq)).toEqual([1, 2])
    expect(ledger.coverage[2]?.status).toBe('pending')
  })

  it('nunca marca vencido lo que se paga al recoger', () => {
    const schedule: InstallmentRow[] = [
      { id: 1, seq: 1, due_type: 'fixed', due_date: '2026-01-10', amount_cents: 600_000 },
      { id: 2, seq: 2, due_type: 'on_pickup', due_date: null, amount_cents: 600_000 },
    ]
    const ledger = buildLedger(TOTAL, schedule, [pay({ id: 1, amount_cents: 600_000, installment_id: 1 })], '2027-01-01')
    expect(ledger.overdue).toHaveLength(0)
    expect(ledger.coverage[1]?.status).toBe('pending')
  })

  it('la cobertura se deriva de los pagos: cancelar uno la deshace', () => {
    const payments = [
      pay({ id: 1, amount_cents: 600_000, installment_id: 1 }),
      pay({ id: 2, amount_cents: 300_000, installment_id: 2, voided_at: '2026-09-20T00:00:00Z' }),
    ]
    const ledger = buildLedger(TOTAL, SCHEDULE, payments, TODAY)
    expect(ledger.coverage[1]?.applied_cents).toBe(0)
    expect(ledger.balance_cents).toBe(600_000)
  })
})

describe('recargo sugerido por atraso', () => {
  it('no sugiere nada mientras nada esté vencido', () => {
    expect(suggestedLateFee(buildLedger(TOTAL, SCHEDULE, [], TODAY), {
      dressPriceCents: 1_200_000, discountCents: 0, lateFeePct: 5, today: TODAY,
    })).toBeNull()
  })

  it('ofrece perder el descuento o el porcentaje por mes vencido', () => {
    const ledger = buildLedger(TOTAL, SCHEDULE, [], '2026-11-12')
    const fee = suggestedLateFee(ledger, { dressPriceCents: 1_200_000, discountCents: 120_000, lateFeePct: 5, today: '2026-11-12' })
    expect(fee?.months_overdue).toBe(3)
    expect(fee?.lose_discount_cents).toBe(120_000)
    expect(fee?.monthly_fee_cents).toBe(180_000)
  })
})
