import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * La sesión es el registro de lo que pasó con una clienta que entró, haya
 * comprado o no.
 *
 * Lo que importa de esto: una sesión que llegó a capturar los datos de la novia
 * deja una persona localizable —nombre, teléfono, el vestido que quería y por
 * qué se fue—, que es una lista de llamadas. Una que se fue antes deja un
 * renglón anónimo con su etapa y su motivo, y ni un solo dato personal.
 */

interface KioskItem { id: number; kind: string; acquisition: string; name: string; code: string }
interface Event { stage: string; at: string; detail: string | null }

const tablet = new Kiosk()
const owner = new Kiosk()

let dress: KioskItem
let otherDress: KioskItem
let accessory: KioskItem

/** La que se identifica y se va. */
let named = 0
/** La que se va sin dar un solo dato. */
let anon = 0

const state = (id: number) =>
  tablet.get<{ session: Record<string, unknown>; favorites: number[]; events: Event[] }>(`/api/sessions/${id}`)

beforeAll(async () => {
  await tablet.login('mty', 'seller', '1111')
  await owner.login('mty', 'owner', '4242')
  const probe = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'sonda' })).id
  const { items } = await tablet.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${probe}`)
  const pedidos = items.filter((i) => i.kind === 'dress' && i.acquisition === 'pedido')
  dress = pedidos[0] as KioskItem
  otherDress = pedidos[1] as KioskItem
  accessory = items.find((i) => i.kind === 'accessory') as KioskItem
  await tablet.post(`/api/sessions/${probe}/close`, { outcome: 'lost', reason: 'otro', note: 'sonda', pin: '1111' })
})

describe('lo que queda escrito de una sesión que se identifica y no compra', () => {
  it('abre, marca favoritos y la vendedora toma la tableta', async () => {
    named = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'Tableta 1' })).id

    await tablet.post(`/api/sessions/${named}/favorites`, { item_id: dress.id })
    await tablet.post(`/api/sessions/${named}/favorites`, { item_id: otherDress.id })

    // El traspaso es un hecho de la sesión y pide el NIP en el servidor.
    const sinNip = await tablet.refusal(`/api/sessions/${named}/handover`, { pin: '9999' })
    expect(sinNip.status).toBe(401)

    const handover = await tablet.post<{ favorites: string[] }>(`/api/sessions/${named}/handover`, { pin: '1111' })
    expect(handover.favorites).toEqual([dress.code, otherDress.code])

    const { events } = await state(named)
    const paso = events.find((e) => e.detail?.includes('la vendedora tomó la tableta'))
    expect(paso?.stage).toBe('fitting')
    // Queda escrito qué favoritos se fueron al probador.
    expect(paso?.detail).toContain(dress.code)
    expect(paso?.detail).toContain(otherDress.code)
  })

  it('la selección queda en la sesión, no sólo en el contrato', async () => {
    await tablet.post(`/api/sessions/${named}/select`, {
      item_id: dress.id, pin: '1111', accessory_item_ids: [accessory.id],
    })
    const { events } = await state(named)
    const sel = events.find((e) => e.stage === 'selected')
    expect(sel?.detail).toContain(dress.code)
    expect(sel?.detail).toContain(accessory.code)
  })

  it('capturar los datos liga a la persona con la sesión', async () => {
    await tablet.post(`/api/sessions/${named}/bride`, {
      name: 'Regina', apellido: 'Salinas', phone: '8113334455', wedding_date: '2027-05-08',
    })
    const { session } = await state(named)
    expect(session.customer_id).not.toBeNull()
  })

  it('al cerrar guarda motivo, nota y la etapa en la que murió', async () => {
    await tablet.post(`/api/sessions/${named}/close`, {
      outcome: 'lost', reason: 'precio', note: 'lo va a platicar con su mamá', pin: '1111',
    })
    const { session } = await state(named)
    expect(session.outcome).toBe('lost')
    expect(session.reason).toBe('precio')
    expect(session.note).toBe('lo va a platicar con su mamá')
    expect(session.stage).toBe('closed')
    // Sin esto, «se fue viendo el catálogo» y «se fue después de dar sus
    // datos» se leen igual.
    expect(session.closed_at_stage).toBe('bride_data')
  })

  it('los favoritos sobreviven al cierre: son la señal de demanda', async () => {
    const { favorites } = await state(named)
    expect(favorites).toContain(dress.id)
    expect(favorites).toContain(otherDress.id)
  })
})

describe('lo que queda de una sesión que se va antes de dar sus datos', () => {
  it('cierra con etapa y motivo, y sin ninguna persona ligada', async () => {
    anon = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'Tableta 2' })).id
    await tablet.post(`/api/sessions/${anon}/favorites`, { item_id: otherDress.id })
    await tablet.post(`/api/sessions/${anon}/close`, { outcome: 'lost', reason: 'va a comparar', pin: '1111' })

    const { session } = await state(anon)
    expect(session.customer_id).toBeNull()
    expect(session.contract_id).toBeNull()
    expect(session.closed_at_stage).toBe('browsing')
    expect(session.reason).toBe('va a comparar')
  })
})

describe('el reporte semanal de sesiones', () => {
  interface Week {
    from: string; to: string
    conversion: { opened: number; reached_fitting: number; sold: number }
    ventas: { bride: string; phone: string | null; folio: string | null }[]
    sin_venta: { session_id: number; stage: string; reason: string | null; note: string | null
      bride: string; phone: string | null; dress: { code: string } | null }[]
    anonimas: { count: number; reasons: { reason: string; n: number }[] }
  }
  const week = () => owner.get<Week>('/api/reports/weekly')

  it('es sólo para la dueña', async () => {
    const refusal = await tablet.refusal('/api/reports/weekly', undefined, 'GET')
    expect(refusal.status).toBe(403)
  })

  it('cuenta el embudo de la semana', async () => {
    const w = await week()
    expect(w.conversion.opened).toBeGreaterThanOrEqual(3)
    expect(w.conversion.reached_fitting).toBeGreaterThanOrEqual(1)
    expect(w.conversion.sold).toBeGreaterThanOrEqual(0)
  })

  it('la que se identificó sale con nombre, teléfono, vestido y motivo', async () => {
    const row = (await week()).sin_venta.find((r) => r.session_id === named)
    expect(row).toBeDefined()
    expect(row?.bride).toBe('Regina Salinas')
    expect(row?.phone).toBe('8113334455')
    expect(row?.dress?.code).toBe(dress.code)
    expect(row?.reason).toBe('precio')
    expect(row?.note).toBe('lo va a platicar con su mamá')
    expect(row?.stage).toBe('bride_data')
  })

  it('la que no se identificó sale como cuenta y motivo, sin un solo dato personal', async () => {
    const w = await week()
    expect(w.sin_venta.some((r) => r.session_id === anon)).toBe(false)
    expect(w.anonimas.count).toBeGreaterThanOrEqual(1)
    expect(w.anonimas.reasons.map((r) => r.reason)).toContain('va a comparar')
    // Nada de la sesión anónima puede llegar al reporte como texto libre.
    expect(JSON.stringify(w.anonimas)).not.toMatch(/Regina|8113334455/)
  })

  it('una venta sale con su folio y su clienta', async () => {
    const w = await week()
    for (const v of w.ventas) {
      expect(v.folio).toMatch(/^MTY-\d{5}$/)
      expect(v.bride.length).toBeGreaterThan(0)
    }
  })
})
