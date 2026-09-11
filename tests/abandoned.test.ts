import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk, sql } from './helpers/client'

/**
 * Sesiones abandonadas.
 *
 * El caso real: la vendedora apaga la tableta al final del día sin cerrar la
 * sesión. Los vestidos que esa novia tocó se quedaban apartados para siempre y
 * a la mañana siguiente ya no salían en el kiosco. Ahora el tiempo las cierra.
 *
 * Abandonada no es perdida: nadie dijo por qué se fue la clienta, así que el
 * reporte las cuenta aparte. Se le conservan sus eventos y sus favoritos; lo
 * único que se suelta son los apartados.
 */

interface KioskItem { id: number; kind: string; acquisition: string; code: string; held_by_other: boolean }

const tablet = new Kiosk()
const other = new Kiosk()
const owner = new Kiosk()

let stale = 0
let fresh = 0
let held: KioskItem
let otherSession = 0

const state = (id: number) =>
  tablet.get<{ session: Record<string, unknown>; favorites: number[]; events: { stage: string; detail: string | null }[] }>(
    `/api/sessions/${id}`)

beforeAll(async () => {
  await tablet.login('mty', 'seller', '1111')
  await other.login('mty', 'seller', '1111')
  await owner.login('mty', 'owner', '4242')

  stale = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'La de ayer' })).id
  const { items } = await tablet.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${stale}`)
  // Un vestido de unidad: es el único que se aparta.
  held = items.find((i) => i.kind === 'dress' && i.acquisition === 'unidad' && !i.held_by_other) as KioskItem
  expect(held).toBeDefined()
  await tablet.post(`/api/sessions/${stale}/favorites`, { item_id: held.id })
})

describe('una sesión sin actividad se cierra sola', () => {
  it('mientras está fresca no la toca nadie', async () => {
    const open = await tablet.get<{ count: number; reaped: number }>('/api/sessions/open')
    expect(open.count).toBeGreaterThanOrEqual(1)
    expect(open.reaped).toBe(0)

    const { session } = await state(stale)
    expect(session.closed_at).toBeNull()
  })

  it('el vestido que marcó queda apartado para las demás tabletas', async () => {
    otherSession = (await other.post<{ id: number }>('/api/sessions', { device_label: 'Otra tableta' })).id
    const { items } = await other.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${otherSession}`)
    expect(items.find((i) => i.id === held.id)?.held_by_other).toBe(true)
  })

  it('pasadas las horas de espera se cierra como abandonada y suelta el apartado', async () => {
    // Se envejece la sesión: ni la tableta ni el servidor pueden mover el reloj.
    await sql(`UPDATE kiosk_sessions SET opened_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-9 hours') WHERE id = ${stale}`)
    await sql(`UPDATE session_events SET at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-9 hours') WHERE session_id = ${stale}`)

    const open = await tablet.get<{ reaped: number }>('/api/sessions/open')
    expect(open.reaped).toBeGreaterThanOrEqual(1)

    const { session } = await state(stale)
    expect(session.outcome).toBe('abandoned')
    expect(session.closed_at).not.toBeNull()
    expect(session.abandoned_at).not.toBeNull()
    // Murió viendo el catálogo, y eso queda escrito.
    expect(session.closed_at_stage).toBe('browsing')

    const { items } = await other.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${otherSession}`)
    expect(items.find((i) => i.id === held.id)?.held_by_other).toBe(false)
  })

  it('conserva sus eventos y sus favoritos', async () => {
    const { favorites, events } = await state(stale)
    expect(favorites).toContain(held.id)
    expect(events.some((e) => e.detail?.includes('abandonada'))).toBe(true)
  })

  it('no le pide el NIP a nadie, porque no la cerró nadie', async () => {
    // La bitácora la registra sin usuaria.
    const { session } = await state(stale)
    expect(session.reason).toBe('sin actividad')
  })
})

describe('una sesión fresca sobrevive al barrido', () => {
  it('abrir una nueva no cierra la que se está usando', async () => {
    fresh = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'La de ahora' })).id
    await tablet.post('/api/sessions', { device_label: 'Otra más' })
    const { session } = await state(fresh)
    expect(session.closed_at).toBeNull()
  })
})

describe('el reporte la distingue de una venta perdida', () => {
  it('la cuenta aparte y no la mezcla con los motivos de no-venta', async () => {
    const w = await owner.get<{
      conversion: { abandoned: number }
      anonimas: { reasons: { reason: string; n: number }[] }
    }>('/api/reports/weekly')
    expect(w.conversion.abandoned).toBeGreaterThanOrEqual(1)
    expect(w.anonimas.reasons.map((r) => r.reason)).toContain('abandonada (la tableta se quedó abierta)')
  })
})

describe('la espera es configurable por sucursal', () => {
  it('no acepta menos de una hora', async () => {
    const refusal = await owner.refusal('/api/settings/store', { session_timeout_hours: 0 }, 'PATCH')
    expect(refusal.status).toBe(400)
    expect(refusal.error).toMatch(/una hora/)
  })

  it('la dueña la puede cambiar', async () => {
    await owner.patch('/api/settings/store', { session_timeout_hours: 12 })
    const { store } = await owner.get<{ store: { session_timeout_hours: number } }>('/api/settings')
    expect(store.session_timeout_hours).toBe(12)
    await owner.patch('/api/settings/store', { session_timeout_hours: 4 })
  })
})
