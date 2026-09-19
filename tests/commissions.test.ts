import { describe, expect, it } from 'vitest'
import { weeklyCommissions, type CommissionContract, type CommissionRule } from '../worker/lib/commissions'
import type { InstallmentRow, PaymentRow } from '../worker/lib/payments'

const rule = (over: Partial<CommissionRule>): CommissionRule => ({
  id: 1, priority: 1, min_price_cents: 0, max_price_cents: null,
  sold_at_or_above_list: null, rate_pct: 10, basis: 'sale_value', period: 'weekly', ...over,
})

const contract = (over: Partial<CommissionContract>): CommissionContract => ({
  id: 1, seller_id: 1, seller_name: 'Vendedora Uno', total_cents: 1_000_00, list_total_cents: 1_000_00, signed_at: '2026-09-16', ...over,
})

const FROM = '2026-09-14' // lunes
const TO = '2026-09-18' // viernes, "hoy"

describe('comisiones semanales', () => {
  it('sale_value: se cuenta completa el día que se firma, sin importar lo pagado', () => {
    const rules = [rule({ basis: 'sale_value', rate_pct: 10 })]
    const contracts = [contract({ total_cents: 2_000_00, signed_at: '2026-09-16' })]
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(20_000) // 10% de $2,000
    expect(result.lines).toHaveLength(1)
  })

  it('sale_value: no cuenta si la firma cayó fuera de la semana', () => {
    const rules = [rule({ basis: 'sale_value' })]
    const contracts = [contract({ signed_at: '2026-09-07' })]
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(0)
  })

  it('cash: cada abono cuenta el día que se cobra, no el día de la firma', () => {
    const rules = [rule({ basis: 'cash', rate_pct: 5 })]
    const contracts = [contract({ id: 7, signed_at: '2026-08-01' })]
    const payments = new Map<number, PaymentRow[]>([[7, [
      { id: 1, paid_at: '2026-09-15', amount_cents: 500_00, installment_id: null, voided_at: null },
      { id: 2, paid_at: '2026-09-01', amount_cents: 300_00, installment_id: null, voided_at: null }, // fuera de la semana
      { id: 3, paid_at: '2026-09-16', amount_cents: 200_00, installment_id: null, voided_at: null },
    ]]])
    const result = weeklyCommissions(rules, contracts, payments, new Map(), FROM, TO, TO)
    // 5% de (500 + 200), el de 300 quedó fuera de la ventana
    expect(result.total_cents).toBe(3_500)
    expect(result.lines).toHaveLength(2)
  })

  it('cash: ignora los pagos anulados', () => {
    const rules = [rule({ basis: 'cash', rate_pct: 10 })]
    const contracts = [contract({ id: 7 })]
    const payments = new Map<number, PaymentRow[]>([[7, [
      { id: 1, paid_at: '2026-09-15', amount_cents: 100_00, installment_id: null, voided_at: '2026-09-15T10:00:00Z' },
    ]]])
    const result = weeklyCommissions(rules, contracts, payments, new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(0)
  })

  it('split: cada parcialidad cuenta según su fecha de vencimiento, no según cuándo (o si) se pagó', () => {
    const rules = [rule({ basis: 'split', rate_pct: 10 })]
    const contracts = [contract({ id: 9, total_cents: 900_00 })]
    const installments = new Map<number, InstallmentRow[]>([[9, [
      { id: 1, seq: 1, due_type: 'fixed', due_date: '2026-09-01', amount_cents: 300_00 }, // fuera de la semana
      { id: 2, seq: 2, due_type: 'fixed', due_date: '2026-09-15', amount_cents: 300_00 }, // en la semana, sin pagar
      { id: 3, seq: 3, due_type: 'fixed', due_date: '2026-10-01', amount_cents: 300_00 }, // futura
    ]]])
    const result = weeklyCommissions(rules, contracts, new Map(), installments, FROM, TO, TO)
    // 10% de la parcialidad que vence esta semana, así no se haya cobrado todavía
    expect(result.total_cents).toBe(3_000)
    expect(result.lines).toHaveLength(1)
  })

  it('split: una parcialidad «al recoger» (sin fecha) nunca cae en ninguna semana', () => {
    const rules = [rule({ basis: 'split', rate_pct: 10 })]
    const contracts = [contract({ id: 9, total_cents: 900_00 })]
    const installments = new Map<number, InstallmentRow[]>([[9, [
      { id: 1, seq: 1, due_type: 'fixed', due_date: '2026-09-15', amount_cents: 450_00 },
      { id: 2, seq: 2, due_type: 'on_pickup', due_date: null, amount_cents: 450_00 },
    ]]])
    const result = weeklyCommissions(rules, contracts, new Map(), installments, FROM, TO, TO)
    expect(result.total_cents).toBe(4_500) // sólo la que sí tiene fecha
  })

  it('escoge la regla de menor prioridad cuyo rango de precio cubre la venta', () => {
    const rules = [
      rule({ id: 1, priority: 2, min_price_cents: 0, max_price_cents: null, rate_pct: 3 }),
      rule({ id: 2, priority: 1, min_price_cents: 1_000_00, max_price_cents: 1_999_99_00, rate_pct: 4 }),
    ]
    const contracts = [contract({ total_cents: 1_500_00 })]
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(6_000) // 4% de 1,500, no 3%
  })

  it('sold_at_or_above_list filtra por si se vendió con descuento o no', () => {
    const rules = [
      rule({ id: 1, priority: 1, sold_at_or_above_list: 1, rate_pct: 5 }),
      rule({ id: 2, priority: 2, sold_at_or_above_list: 0, rate_pct: 3 }),
    ]
    const contracts = [contract({ total_cents: 900_00, list_total_cents: 1_000_00 })] // se vendió con descuento
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(2_700) // 3% de 900, la de sold_at_or_above_list=1 no aplica
  })

  it('sin ninguna regla que cubra el precio, no hay comisión (no truena)', () => {
    const rules = [rule({ min_price_cents: 5_000_00 })]
    const contracts = [contract({ total_cents: 900_00 })]
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.total_cents).toBe(0)
    expect(result.lines).toHaveLength(0)
  })

  it('cuenta las reglas mensuales activas que quedaron fuera, sin usarlas', () => {
    const rules = [
      rule({ id: 1, period: 'weekly' }),
      rule({ id: 2, period: 'monthly' }),
      rule({ id: 3, period: 'monthly' }),
    ]
    const result = weeklyCommissions(rules, [], new Map(), new Map(), FROM, TO, TO)
    expect(result.excluded_monthly_rules).toBe(2)
  })

  it('suma por vendedora cuando hay varios contratos', () => {
    const rules = [rule({ basis: 'sale_value', rate_pct: 10 })]
    const contracts = [
      contract({ id: 1, seller_id: 1, seller_name: 'Ana', total_cents: 1_000_00 }),
      contract({ id: 2, seller_id: 2, seller_name: 'Bere', total_cents: 2_000_00 }),
    ]
    const result = weeklyCommissions(rules, contracts, new Map(), new Map(), FROM, TO, TO)
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ seller_id: 1, cents: 10_000 }),
      expect.objectContaining({ seller_id: 2, cents: 20_000 }),
    ]))
  })
})
