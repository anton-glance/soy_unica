import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * Cerrar una sesión pide sólo el NIP: ya no se pregunta cómo terminó. Sin
 * contrato firmado cuenta como «no se vendió», sin motivo. La única excepción
 * que sigue siendo obligatoria es confirmar que se destruyeron las hojas de
 * medidas impresas.
 */

const tablet = new Kiosk()

beforeAll(async () => {
  await tablet.login('mty', 'seller', '1111')
})

interface Row { outcome: string | null; reason: string | null; closed_at: string | null; stage: string }
const row = async (id: number) => (await tablet.get<{ session: Row }>(`/api/sessions/${id}`)).session

describe('cierre sólo con NIP', () => {
  it('cierra sin resultado ni motivo y queda como no vendida', async () => {
    const id = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'solo nip' })).id
    await tablet.post(`/api/sessions/${id}/close`, { pin: '1111' })

    const after = await row(id)
    expect(after.closed_at).not.toBeNull()
    expect(after.stage).toBe('closed')
    expect(after.outcome).toBe('lost')
    expect(after.reason).toBeNull()
  })

  it('un NIP equivocado no cierra', async () => {
    const id = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'nip malo' })).id
    const refusal = await tablet.refusal(`/api/sessions/${id}/close`, { pin: '9999' })
    expect(refusal.status).toBeGreaterThanOrEqual(400)
    expect((await row(id)).closed_at).toBeNull()
    await tablet.post(`/api/sessions/${id}/close`, { pin: '1111' })
  })

  it('con hojas impresas y sin contrato sigue pidiendo confirmar que se destruyeron', async () => {
    const id = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'hojas' })).id
    const { items } = await tablet.get<{ items: { id: number; kind: string; acquisition: string }[] }>(`/api/items/kiosk?session=${id}`)
    const dress = items.find((i) => i.kind === 'dress' && i.acquisition === 'pedido') as { id: number }
    await tablet.post(`/api/sessions/${id}/select`, { item_id: dress.id, pin: '1111' })
    await tablet.post(`/api/sessions/${id}/bride`, { name: 'Hojas', apellido: 'Prueba', phone: '8110000099', wedding_date: '2027-01-01' })
    await tablet.post(`/api/sessions/${id}/sheet-printed`)

    const refusal = await tablet.refusal(`/api/sessions/${id}/close`, { pin: '1111' })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/destruiste/)

    await tablet.post(`/api/sessions/${id}/close`, { pin: '1111', sheets_disposed: true })
    expect((await row(id)).outcome).toBe('lost')
  })

  it('si el cliente manda resultado y motivo, se siguen validando', async () => {
    const id = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'compat' })).id
    const bad = await tablet.refusal(`/api/sessions/${id}/close`, { pin: '1111', outcome: 'lost', reason: 'porque sí' })
    expect(bad.status).toBe(400)
    await tablet.post(`/api/sessions/${id}/close`, { pin: '1111', outcome: 'lost', reason: 'precio' })
    expect((await row(id)).reason).toBe('precio')
  })
})
