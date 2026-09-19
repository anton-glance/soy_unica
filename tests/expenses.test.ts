import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * El rollo completo de gastos, filtrado por periodo — antes sólo existía la
 * semana corriente («Registrar gasto»). Este es el que ve la dueña desde
 * «Todos los gastos», sin agrupar por día.
 */

const owner = new Kiosk()
const seller = new Kiosk()
const today = new Date().toISOString().slice(0, 10)

let expenseId = 0

beforeAll(async () => {
  await owner.login('mty', 'owner', '4242')
  await seller.login('mty', 'seller', '1111')
  const created = await owner.post<{ id: number }>('/api/expenses', {
    amount_cents: 45_000, spent_at: today, category: 'Renta', vendor: 'Casero', note: 'Octubre',
  })
  expenseId = created.id
})

describe('sólo la dueña ve el rollo completo', () => {
  it('una vendedora no puede', async () => {
    const refusal = await seller.refusal(`/api/expenses/period?from=${today}&to=${today}`, undefined, 'GET')
    expect(refusal.status).toBe(403)
  })

  it('ni exportarlo', async () => {
    const refusal = await seller.refusal(`/api/expenses/export?from=${today}&to=${today}`, undefined, 'GET')
    expect(refusal.status).toBe(403)
  })
})

describe('el gasto aparece en el periodo que lo cubre y no en el que no', () => {
  it('trae el gasto recién creado, con su total', async () => {
    const { expenses, total_cents } = await owner.get<{
      expenses: { id: number; category: string; amount_cents: number; vendor: string | null }[]
      total_cents: number
    }>(`/api/expenses/period?from=${today}&to=${today}`)
    const mine = expenses.find((e) => e.id === expenseId)
    expect(mine).toMatchObject({ category: 'Renta', amount_cents: 45_000, vendor: 'Casero' })
    expect(total_cents).toBeGreaterThanOrEqual(45_000)
  })

  it('un periodo fuera de rango no lo trae', async () => {
    const { expenses } = await owner.get<{ expenses: unknown[] }>('/api/expenses/period?from=2020-01-01&to=2020-01-02')
    expect(expenses).toEqual([])
  })

  it('«desde» posterior a «hasta» se rechaza', async () => {
    const refusal = await owner.refusal(`/api/expenses/period?from=${today}&to=2020-01-01`, undefined, 'GET')
    expect(refusal.status).toBe(400)
  })
})
