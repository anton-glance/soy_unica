import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk, sql } from './helpers/client'

/**
 * «Mod.»: la última vez que cambió un dato de un artículo. Lo mueven los
 * cambios de verdad (editar, vender, cambiar las fotos) y no que alguien lo
 * esté viendo.
 */

interface Row { id: number; modified_at: string | null; intake_date: string | null; status: string }

const owner = new Kiosk()
const seller = new Kiosk()
const OLD = '2000-01-01T00:00:00Z'

beforeAll(async () => {
  await owner.login('mty', 'owner', '4242')
  await seller.login('mty', 'seller', '1111')
})

async function make(code: string): Promise<number> {
  const { id } = await owner.post<{ id: number }>('/api/items', {
    code, name: `Mod ${code}`, brand: 'Lanesta', kind: 'dress', acquisition: 'unidad',
    condition: 'nuevo', price_cents: 1_000_000, quantity: 3,
  })
  return id
}
const read = async (id: number) => (await owner.get<{ item: Row }>(`/api/items/${id}`)).item

describe('Mod. — la última vez que se tocó el artículo', () => {
  it('todo artículo trae fecha: los que ya estaban (cae a Ingreso) y los nuevos (hoy)', async () => {
    const list = await owner.get<{ items: Row[] }>('/api/items')
    expect(list.items.length).toBeGreaterThan(0)
    expect(list.items.every((i) => !!i.modified_at)).toBe(true)

    const id = await make('mod-1')
    expect((await read(id)).modified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('editar, cambiar la cantidad (lo que hace una venta) o las fotos la mueven; que una novia lo vea, no', async () => {
    const edit = await make('mod-2')
    const qty = await make('mod-3')
    const photos = await make('mod-4')
    const view = await make('mod-5')
    // Una sola escritura directa para envejecerlos a todos: cada una cuesta lo suyo.
    await sql(`UPDATE items SET modified_at = '${OLD}' WHERE code IN ('mod-2','mod-3','mod-4','mod-5')`)
    for (const id of [edit, qty, photos, view]) expect((await read(id)).modified_at).toBe(OLD)

    await owner.patch(`/api/items/${edit}`, { price_cents: 1_100_000 })
    expect((await read(edit)).modified_at! > OLD).toBe(true)

    await owner.patch(`/api/items/${qty}`, { quantity: 2 })
    expect((await read(qty)).modified_at! > OLD).toBe(true)

    const photo = await owner.upload('item_photo')
    await owner.put(`/api/items/${photos}/photos`, { photos: [{ file_id: photo, is_primary: true }] })
    expect((await read(photos)).modified_at! > OLD).toBe(true)

    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'mirando' })).id
    await seller.post(`/api/sessions/${session}/view`, { item_id: view })
    expect((await read(view)).status).toBe('watching')
    expect((await read(view)).modified_at).toBe(OLD)

    await seller.post(`/api/sessions/${session}/close`, { pin: '1111' })
    const after = await read(view)
    expect(after.status).toBe('available')
    expect(after.modified_at).toBe(OLD)
  })
})
