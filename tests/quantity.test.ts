import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * La existencia de un accesorio (mantilla/tiara/cinto/otros, de unidad): se
 * descuenta cuando la venta de verdad pasa — al firmar, o al agregarse después
 * de firmado —, nunca al sólo elegirlo en un contrato que todavía es borrador.
 * En cero, deja de poder venderse y se marca «no disponible». Un vestido, y
 * cualquier cosa por pedido, nunca entran en esta cuenta.
 */

interface ItemRow {
  id: number; code: string; name: string; kind: string; acquisition: string
  quantity: number | null; available: boolean; price_cents: number
}

const owner = new Kiosk()
const seller = new Kiosk()

/** Un vestido por pedido: nunca se aparta, así que lo pueden usar varias sesiones a la vez sin chocar. */
async function makeDress(code: string, opts: { quantity?: number } = {}): Promise<ItemRow> {
  const { id } = await owner.post<{ id: number }>('/api/items', {
    code, name: `Vestido ${code}`, kind: 'dress', acquisition: 'pedido',
    condition: 'nuevo', price_cents: 1_000_000,
    ...(opts.quantity !== undefined ? { quantity: opts.quantity } : {}),
  })
  const photo = await owner.upload('item_photo')
  await owner.put(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] })
  return (await owner.get<{ item: ItemRow }>(`/api/items/${id}`)).item
}

async function makeAccessory(code: string, opts: { acquisition?: string; quantity?: number; kind?: string } = {}): Promise<ItemRow> {
  const { id } = await owner.post<{ id: number }>('/api/items', {
    code, name: `Accesorio ${code}`, kind: opts.kind ?? 'mantilla',
    acquisition: opts.acquisition ?? 'unidad', condition: 'nuevo',
    price_cents: 50_000, cost_cents: 10_000, size: 'Única',
    ...(opts.quantity !== undefined ? { quantity: opts.quantity } : {}),
  })
  const photo = await owner.upload('item_photo')
  await owner.put(`/api/items/${id}/photos`, { photos: [{ file_id: photo, is_primary: true }] })
  return (await owner.get<{ item: ItemRow }>(`/api/items/${id}`)).item
}

/** El recorrido completo hasta firmar, con un vestido por pedido y los accesorios dados. */
async function sellThrough(dress: ItemRow, accessoryIds: number[]): Promise<string> {
  const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'cantidad' })).id
  const { folio, contract_id: contractId } = await seller.post<{ folio: string; contract_id: number }>(
    `/api/sessions/${session}/select`, { item_id: dress.id, pin: '1111', accessory_item_ids: accessoryIds },
  )
  await seller.post(`/api/sessions/${session}/bride`, {
    name: 'Cantidad', apellido: 'Prueba', phone: '8110000000', wedding_date: '2027-01-01',
  })
  await seller.post(`/api/sessions/${session}/sheet-printed`)
  await seller.upload('measurement_sheet', contractId)
  await seller.post(`/api/sessions/${session}/sheet-signed`)
  const quote = await seller.post<{ offers: { plan: { id: number } }[] }>(`/api/sessions/${session}/quote`, {})
  const plan = quote.offers[0]?.plan.id
  await seller.post(`/api/sessions/${session}/terms`, { plan_id: plan })
  await seller.post(`/api/sessions/${session}/contract-printed`)
  await seller.upload('contract', contractId)
  await seller.post(`/api/sessions/${session}/sign`)
  return folio
}

beforeAll(async () => {
  await owner.login('mty', 'owner', '4242')
  await seller.login('mty', 'seller', '1111')
})

describe('se descuenta sólo cuando la venta pasa de verdad', () => {
  it('elegirlo en un contrato todavía borrador no toca la existencia', async () => {
    const dress = await makeDress('qty-d1')
    const accessory = await makeAccessory('qty-a1', { quantity: 1 })
    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'borrador' })).id
    await seller.post(`/api/sessions/${session}/select`, { item_id: dress.id, pin: '1111', accessory_item_ids: [accessory.id] })

    const after = await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)
    expect(after.item.quantity).toBe(1)
    expect(after.item.available).toBe(true)
  })

  it('firmar sí la descuenta, y en cero deja de estar disponible', async () => {
    const dress = await makeDress('qty-d2')
    const accessory = await makeAccessory('qty-a2', { quantity: 1 })
    await sellThrough(dress, [accessory.id])

    const after = await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)
    expect(after.item.quantity).toBe(0)
    expect(after.item.available).toBe(false)

    // También se ve así en las dos listas que la tienda consulta.
    const list = await owner.get<{ items: ItemRow[] }>('/api/items?q=qty-a2')
    expect(list.items.find((i) => i.id === accessory.id)?.available).toBe(false)
  })

  it('en cero, una sesión nueva no puede elegirlo', async () => {
    const dress = await makeDress('qty-d3')
    const accessory = await makeAccessory('qty-a3', { quantity: 0 })
    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'sin existencia' })).id
    const refusal = await seller.refusal(`/api/sessions/${session}/select`, {
      item_id: dress.id, pin: '1111', accessory_item_ids: [accessory.id],
    })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/ya no tiene existencias/)
  })
})

describe('un accesorio agregado después de firmado también la descuenta', () => {
  it('con existencia, se agrega y queda en cero', async () => {
    const dress = await makeDress('qty-d4')
    const folio = await sellThrough(dress, [])
    const accessory = await makeAccessory('qty-a4', { quantity: 1 })

    await seller.post(`/api/contracts/${folio}/accessories`, { item_id: accessory.id })
    const after = await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)
    expect(after.item.quantity).toBe(0)
    expect(after.item.available).toBe(false)
  })

  it('sin existencia, se rechaza en vez de agregarse', async () => {
    const dress = await makeDress('qty-d5')
    const folio = await sellThrough(dress, [])
    const accessory = await makeAccessory('qty-a5', { quantity: 0 })

    const refusal = await seller.refusal(`/api/contracts/${folio}/accessories`, { item_id: accessory.id })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/ya no tiene existencias/)
  })
})

describe('lo que no se cuenta: un vestido, y un accesorio al que no se le ha puesto cantidad', () => {
  it('un vestido sin cantidad no se cuenta y siempre está disponible', async () => {
    const dress = await makeDress('qty-d6')
    expect(dress.quantity).toBeNull()
    expect(dress.available).toBe(true)
  })

  it('un accesorio por pedido sin cantidad (lo importado del sitio) no se cuenta ni se apaga', async () => {
    const accessory = await makeAccessory('qty-a6', { acquisition: 'pedido', kind: 'cinto' })
    expect(accessory.quantity).toBeNull()
    expect(accessory.available).toBe(true)

    const dress = await makeDress('qty-d7')
    const folio = await sellThrough(dress, [accessory.id])
    await seller.post(`/api/contracts/${folio}/accessories`, { item_id: accessory.id })

    const after = await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)
    expect(after.item.quantity).toBeNull()
    expect(after.item.available).toBe(true)
  })
})

describe('ponerle cantidad a un accesorio que entró por pedido', () => {
  it('sin cantidad no se cuenta; al ponérsela empieza a contarse y se apaga en cero', async () => {
    const accessory = await makeAccessory('qty-a7', { acquisition: 'pedido' })
    expect(accessory.quantity).toBeNull()

    await owner.patch(`/api/items/${accessory.id}`, { quantity: 1 })
    const counted = (await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)).item
    expect(counted.quantity).toBe(1)
    expect(counted.available).toBe(true)

    const dress = await makeDress('qty-d8')
    await sellThrough(dress, [accessory.id])
    const after = (await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)).item
    expect(after.quantity).toBe(0)
    expect(after.available).toBe(false)
  })

  it('vaciarla la deja sin contar otra vez, y vuelve a estar disponible', async () => {
    const accessory = await makeAccessory('qty-a8', { acquisition: 'pedido', quantity: 0 })
    expect(accessory.available).toBe(false)

    await owner.patch(`/api/items/${accessory.id}`, { quantity: null })
    const after = (await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)).item
    expect(after.quantity).toBeNull()
    expect(after.available).toBe(true)
  })

  it('algo de unidad no puede quedar sin cantidad', async () => {
    const accessory = await makeAccessory('qty-a9', { quantity: 3 })
    const refusal = await owner.refusal(`/api/items/${accessory.id}`, { quantity: null }, 'PATCH')
    expect(refusal.status).toBe(400)
    expect(refusal.error).toMatch(/cantidad/i)
  })
})

describe('un vestido también puede llevar cantidad', () => {
  it('al firmar se descuenta, queda en cero y ya no se puede elegir otra vez', async () => {
    const dress = await makeDress('qty-d9', { quantity: 1 })
    expect(dress.quantity).toBe(1)
    expect(dress.available).toBe(true)

    await sellThrough(dress, [])
    const after = (await owner.get<{ item: ItemRow }>(`/api/items/${dress.id}`)).item
    expect(after.quantity).toBe(0)
    expect(after.available).toBe(false)

    const session = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'sin vestido' })).id
    const refusal = await seller.refusal(`/api/sessions/${session}/select`, { item_id: dress.id, pin: '1111' })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/ya no tiene existencias/)
  })

  it('con más de uno, cada venta descuenta uno y sigue disponible hasta el último', async () => {
    const dress = await makeDress('qty-d10', { quantity: 2 })
    await sellThrough(dress, [])
    const mid = (await owner.get<{ item: ItemRow }>(`/api/items/${dress.id}`)).item
    expect(mid.quantity).toBe(1)
    expect(mid.available).toBe(true)
  })
})

describe('filtro rápido «No disponible» y cambio de tipo', () => {
  it('la lista filtra y cuenta lo que está en cero', async () => {
    const zero = await makeAccessory('qty-f1', { quantity: 0 })
    const counted = await makeAccessory('qty-f2', { quantity: 4 })

    const all = await owner.get<{ items: ItemRow[]; unavailable_count: number }>('/api/items?q=qty-f')
    expect(all.items.map((i) => i.id)).toEqual(expect.arrayContaining([zero.id, counted.id]))
    expect(all.unavailable_count).toBe(1)

    const only = await owner.get<{ items: ItemRow[] }>('/api/items?q=qty-f&unavailable=1')
    expect(only.items.map((i) => i.id)).toEqual([zero.id])
  })

  it('el tipo se puede cambiar desde la ficha', async () => {
    const accessory = await makeAccessory('qty-f3', { quantity: 2 })
    await owner.patch(`/api/items/${accessory.id}`, { kind: 'tiara' })
    const after = (await owner.get<{ item: ItemRow }>(`/api/items/${accessory.id}`)).item
    expect(after.kind).toBe('tiara')
    expect(after.quantity).toBe(2)
  })
})
