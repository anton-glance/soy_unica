import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * La vendedora lleva la sesión desde que entra con su NIP: pasar el carrito a
 * las medidas ya no pide el NIP otra vez.
 */

const seller = new Kiosk()
const owner = new Kiosk()

beforeAll(async () => {
  await seller.login('mty', 'seller', '1111')
  await owner.login('mty', 'owner', '4242')
})

describe('pasar el carrito a las medidas', () => {
  it('elige el vestido sin volver a pedir el NIP', async () => {
    const id = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'carrito' })).id
    const { items } = await seller.get<{ items: { id: number; kind: string; acquisition: string; needs_review?: number }[] }>(
      `/api/items/kiosk?session=${id}`,
    )
    const dress = items.find((i) => i.kind === 'dress' && i.acquisition === 'pedido') as { id: number }
    await seller.post(`/api/sessions/${id}/favorites`, { item_id: dress.id })

    const chosen = await seller.post<{ folio: string }>(`/api/sessions/${id}/select`, { item_id: dress.id })
    expect(chosen.folio).toMatch(/^MTY-\d{5}$/)
    const { session } = await seller.get<{ session: { stage: string } }>(`/api/sessions/${id}`)
    expect(session.stage).toBe('selected')
  })
})

describe('al carrito sólo entra lo que se puede vender', () => {
  const kiosk = (session: number) =>
    seller.get<{ items: { id: number; needs_review: number; review_fields: string | null; available: boolean }[] }>(
      `/api/items/kiosk?session=${session}`,
    )

  it('un artículo incompleto se muestra con lo que le falta, pero no se agrega', async () => {
    // Sin precio ni foto: entra marcado «por verificar».
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: 'cart-inc', name: 'Incompleto', kind: 'tiara', acquisition: 'unidad', condition: 'nuevo',
      price_cents: 0, cost_cents: 0, size: 'Única', quantity: 2,
    })
    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'incompleto' })).id

    const row = (await kiosk(session)).items.find((i) => i.id === id)
    expect(row?.needs_review).toBe(1)
    expect(row?.review_fields).toMatch(/price/)

    const refusal = await seller.refusal(`/api/sessions/${session}/favorites`, { item_id: id })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/incompleto/)
    expect(refusal.error).toMatch(/precio/)
    await seller.post(`/api/sessions/${session}/close`, { pin: '1111' })
  })

  it('un artículo agotado tampoco se agrega', async () => {
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: 'cart-out', name: 'Agotado', kind: 'cinto', acquisition: 'unidad', condition: 'nuevo',
      price_cents: 50_000, cost_cents: 10_000, size: 'Única', quantity: 0,
    })
    const photo = await owner.upload('item_photo')
    await owner.put(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] })
    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'agotado' })).id

    const refusal = await seller.refusal(`/api/sessions/${session}/favorites`, { item_id: id })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/existencias/)
    await seller.post(`/api/sessions/${session}/close`, { pin: '1111' })
  })
})
