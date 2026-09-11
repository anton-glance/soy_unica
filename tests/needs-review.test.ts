import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'
import { reviewFields, NO_CODE_PREFIX } from '../worker/lib/items'

/**
 * Items the catalog could not fill in completely.
 *
 * The shop has been run from memory for ten years: an incomplete row is the
 * normal case, not corruption, so the import keeps it and the system says which
 * rows want her attention. What it must never do is let an incomplete row reach
 * a contract, because a price of zero prints a contract full of nonsense.
 */

interface ItemRow {
  id: number; code: string; name: string; price_cents: number
  needs_review: number; review_fields: string | null
}
interface ItemList { items: ItemRow[]; review_count: number }

const owner = new Kiosk()
const seller = new Kiosk()
let sessionId = 0
let unpriced = 0

beforeAll(async () => {
  await owner.login('mty', 'owner', '4242')
  await seller.login('mty', 'seller', '1111')
  sessionId = (await seller.post<{ id: number }>('/api/sessions', { device_label: 'Tableta por verificar' })).id
})

describe('which fields count as missing', () => {
  const base = { code: 'p139', price_cents: 100, size: 'M', cost_cents: 50, condition: 'nuevo', acquisition: 'unidad' }

  it('price first, because it is the one that blocks a sale', () => {
    expect(reviewFields({ ...base, price_cents: 0 })).toEqual(['price'])
  })

  it('a placeholder code is not a code', () => {
    expect(reviewFields({ ...base, code: `${NO_CODE_PREFIX}vestido-alma` })).toEqual(['code'])
    expect(reviewFields({ ...base, code: 'p139' })).toEqual([])
  })

  it('size and cost are not gaps on a made-to-order model', () => {
    const order = { ...base, acquisition: 'pedido', size: '', cost_cents: 0 }
    expect(reviewFields(order)).toEqual([])
    expect(reviewFields({ ...base, size: '', cost_cents: 0 })).toEqual(['size', 'cost'])
  })
})

describe('the flag is derived, never typed', () => {
  it('is set on creation from what the row actually holds', async () => {
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: 'rev-1', name: 'Mantilla sin precio', kind: 'accessory',
      acquisition: 'unidad', condition: 'nuevo', price_cents: 0, cost_cents: 0, size: '',
    })
    unpriced = id
    const { item } = await owner.get<{ item: ItemRow }>(`/api/items/${id}`)
    expect(item.needs_review).toBe(1)
    expect((item.review_fields ?? '').split(',').sort()).toEqual(['cost', 'price', 'size'])
  })

  it('shows up under the Por verificar filter, and those rows sort first', async () => {
    const all = await owner.get<ItemList>('/api/items')
    expect(all.review_count).toBeGreaterThan(0)
    expect(all.items[0]?.needs_review).toBe(1)

    const only = await owner.get<ItemList>('/api/items?review=1')
    expect(only.items.every((i) => i.needs_review === 1)).toBe(true)
    expect(only.items.some((i) => i.id === unpriced)).toBe(true)
  })

  it('clears itself when the last missing field is filled', async () => {
    await owner.patch(`/api/items/${unpriced}`, { price_cents: 90_000, cost_cents: 40_000, size: 'Única' })
    const { item } = await owner.get<{ item: ItemRow }>(`/api/items/${unpriced}`)
    expect(item.needs_review).toBe(0)
    expect(item.review_fields).toBeNull()
  })

  it('lets her replace a placeholder code, which is the only way to clear that flag', async () => {
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: `${NO_CODE_PREFIX}vestido-alma`, name: 'Alma', kind: 'dress',
      acquisition: 'pedido', condition: 'nuevo', price_cents: 1_800_000,
    })
    expect((await owner.get<{ item: ItemRow }>(`/api/items/${id}`)).item.review_fields).toBe('code')
    await owner.patch(`/api/items/${id}`, { code: 'a77' })
    const { item } = await owner.get<{ item: ItemRow }>(`/api/items/${id}`)
    expect(item.code).toBe('a77')
    expect(item.needs_review).toBe(0)
  })
})

describe('an incomplete item cannot reach a contract', () => {
  it('refuses a dress with no price, in Spanish, and says where to fix it', async () => {
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: 'rev-2', name: 'Luccienna', kind: 'dress',
      acquisition: 'pedido', condition: 'nuevo', price_cents: 0,
    })
    const refusal = await seller.refusal(`/api/sessions/${sessionId}/select`, { item_id: id, pin: '1111' })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/no tiene precio/)
    expect(refusal.error).toMatch(/Inventario/)
  })

  it('refuses a dress that is priced but still flagged', async () => {
    const { id } = await owner.post<{ id: number }>('/api/items', {
      code: `${NO_CODE_PREFIX}camellia`, name: 'Camellia', kind: 'dress',
      acquisition: 'pedido', condition: 'nuevo', price_cents: 2_100_000,
    })
    const refusal = await seller.refusal(`/api/sessions/${sessionId}/select`, { item_id: id, pin: '1111' })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/por verificar/)
  })

  it('refuses an accessory with no price, so no line ever lands at zero', async () => {
    const dress = await owner.post<{ id: number }>('/api/items', {
      code: 'rev-3', name: 'Nova', kind: 'dress',
      acquisition: 'pedido', condition: 'nuevo', price_cents: 1_950_000,
    })
    const veil = await owner.post<{ id: number }>('/api/items', {
      code: 'rev-4', name: 'Velo catedral', kind: 'accessory',
      acquisition: 'pedido', condition: 'nuevo', price_cents: 0,
    })
    const refusal = await seller.refusal(`/api/sessions/${sessionId}/select`, {
      item_id: dress.id, accessory_item_ids: [veil.id], pin: '1111',
    })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/Velo catedral/)
  })
})
