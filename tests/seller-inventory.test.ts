import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * Lo que la vendedora puede hacer en el inventario: dar de alta artículos
 * nuevos (con sus fotos) y ajustar la cantidad de los que ya existen. Todo lo
 * demás de un artículo guardado es de la dueña.
 */

interface ItemRow { id: number; quantity: number | null; price_cents: number; name: string; cost_cents?: number }

const owner = new Kiosk()
const seller = new Kiosk()

beforeAll(async () => {
  await owner.login('mty', 'owner', '4242')
  await seller.login('mty', 'seller', '1111')
})

const read = async (id: number) => (await owner.get<{ item: ItemRow }>(`/api/items/${id}`)).item

describe('la vendedora da de alta un artículo', () => {
  it('lo crea, le pone sus fotos y el costo se queda en cero', async () => {
    const { id } = await seller.post<{ id: number }>('/api/items', {
      code: 'sv-1', name: 'Tiara nueva', kind: 'tiara', acquisition: 'unidad', condition: 'nuevo',
      price_cents: 80_000, cost_cents: 50_000, quantity: 4,
    })
    const photo = await seller.upload('item_photo')
    await seller.put(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] })

    const created = await read(id)
    expect(created.quantity).toBe(4)
    expect(created.cost_cents).toBe(0)
  })
})

describe('una vez guardado, la vendedora sólo ajusta la cantidad', () => {
  let id = 0

  beforeAll(async () => {
    id = (await owner.post<{ id: number }>('/api/items', {
      code: 'sv-2', name: 'Cinto guardado', brand: 'Lanesta', kind: 'cinto', acquisition: 'unidad',
      condition: 'nuevo', price_cents: 120_000, cost_cents: 40_000, quantity: 5,
    })).id
    const photo = await owner.upload('item_photo')
    await owner.put(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] })
  })

  it('puede cambiar la cantidad', async () => {
    await seller.patch(`/api/items/${id}`, { quantity: 2 })
    expect((await read(id)).quantity).toBe(2)
  })

  it('no puede cambiar nada más, ni junto con la cantidad', async () => {
    const price = await seller.refusal(`/api/items/${id}`, { price_cents: 1 }, 'PATCH')
    expect(price.status).toBe(403)
    const mixed = await seller.refusal(`/api/items/${id}`, { quantity: 9, name: 'Otro nombre' }, 'PATCH')
    expect(mixed.status).toBe(403)

    const after = await read(id)
    expect(after.price_cents).toBe(120_000)
    expect(after.quantity).toBe(2)
    expect(after.name).toBe('Cinto guardado')
  })

  it('no puede cambiar las fotos ni borrar el artículo', async () => {
    const photo = await seller.upload('item_photo')
    const photos = await seller.refusal(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] }, 'PUT')
    expect(photos.status).toBe(403)
    const del = await seller.refusal(`/api/items/${id}`, undefined, 'DELETE')
    expect(del.status).toBe(403)
  })

  it('la dueña sigue pudiendo editarlo todo', async () => {
    await owner.patch(`/api/items/${id}`, { price_cents: 130_000, name: 'Cinto editado' })
    const after = await read(id)
    expect(after.price_cents).toBe(130_000)
    expect(after.name).toBe('Cinto editado')
  })
})
