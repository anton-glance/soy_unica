import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * La vendedora lleva la sesión desde que entra con su NIP: pasar el carrito a
 * las medidas ya no pide el NIP otra vez.
 */

const seller = new Kiosk()

beforeAll(async () => {
  await seller.login('mty', 'seller', '1111')
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
