import { describe, expect, it } from 'vitest'
import { TRANSITIONS, canTransition, deriveStatus, hotelCharge, type ItemAction, type ItemLike, type ItemStatus } from '../worker/lib/items'

const item = (over: Partial<ItemLike> = {}): ItemLike => ({
  status: 'available', acquisition: 'unidad', tailoring_done_at: null, held_by_session: null, ...over,
})

const ALL_STATUSES: ItemStatus[] = ['available', 'watching', 'reserved', 'tailoring', 'tailored', 'ready', 'sold', 'retired']
const ALL_ACTIONS = Object.keys(TRANSITIONS) as ItemAction[]

describe('tabla de transiciones del inventario', () => {
  it('sólo permite lo que está en la tabla, desde cualquier estado', () => {
    for (const action of ALL_ACTIONS) {
      for (const status of ALL_STATUSES) {
        const verdict = canTransition(item({ status }), action)
        expect(verdict.ok).toBe(TRANSITIONS[action].from.includes(status))
      }
    }
  })

  it('recorre el camino completo de una venta', () => {
    const path: [ItemStatus, ItemAction, ItemStatus][] = [
      ['available', 'hold', 'watching'],
      ['watching', 'reserve', 'reserved'],
      ['reserved', 'tailoring/start', 'tailoring'],
      ['tailoring', 'tailoring/done', 'tailored'],
      ['ready', 'deliver', 'sold'],
    ]
    for (const [from, action, to] of path) {
      const verdict = canTransition(item({ status: from }), action)
      expect(verdict.ok && verdict.to).toBe(to)
    }
  })

  it('`sold` sólo se alcanza desde `ready`', () => {
    expect(TRANSITIONS.deliver.from).toEqual(['ready'])
    for (const status of ALL_STATUSES.filter((s) => s !== 'ready')) {
      expect(canTransition(item({ status }), 'deliver').ok).toBe(false)
    }
  })

  it('los modelos por pedido nunca se apartan ni cambian de estado', () => {
    for (const action of ALL_ACTIONS) {
      const verdict = canTransition(item({ acquisition: 'pedido' }), action)
      expect(verdict.ok).toBe(false)
      if (!verdict.ok) expect(verdict.message).toMatch(/por pedido/)
    }
  })

  it('explica en español a qué estado no se puede pasar', () => {
    const verdict = canTransition(item({ status: 'sold' }), 'hold')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.message).toBe('No se puede pasar de «Entregado» a «En prueba».')
  })
})

describe('`ready` es derivado, nunca se pone a mano', () => {
  it('es `ready` sólo con costura terminada y saldo en cero', () => {
    expect(deriveStatus(item({ status: 'tailored', tailoring_done_at: '2026-09-01T00:00:00Z' }), 0)).toBe('ready')
    expect(deriveStatus(item({ status: 'tailored', tailoring_done_at: '2026-09-01T00:00:00Z' }), 1)).toBe('tailored')
    expect(deriveStatus(item({ status: 'tailored', tailoring_done_at: null }), 0)).toBe('tailored')
  })

  it('regresa a `tailored` si una cancelación de pago vuelve a abrir el saldo', () => {
    expect(deriveStatus(item({ status: 'ready', tailoring_done_at: '2026-09-01T00:00:00Z' }), 250_000)).toBe('tailored')
  })

  it('no toca ningún otro estado', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'ready' && s !== 'tailored')) {
      expect(deriveStatus(item({ status, tailoring_done_at: '2026-09-01T00:00:00Z' }), 0)).toBe(status)
    }
  })
})

describe('hotel de vestido', () => {
  it('no cobra nada mientras no se le avise a la novia', () => {
    expect(hotelCharge(null, '2026-09-30', 10, 3000)).toEqual({ days_charged: 0, amount_cents: 0 })
  })

  it('no cobra dentro de los días de gracia', () => {
    expect(hotelCharge('2026-09-01T00:00:00Z', '2026-09-11', 10, 3000).amount_cents).toBe(0)
  })

  it('cobra por día una vez pasada la ventana libre', () => {
    expect(hotelCharge('2026-09-01T00:00:00Z', '2026-09-16', 10, 3000)).toEqual({ days_charged: 5, amount_cents: 15_000 })
  })
})
