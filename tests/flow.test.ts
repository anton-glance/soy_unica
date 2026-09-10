import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * El recorrido de aceptación completo, contra el Worker real: dos tabletas en
 * la misma sucursal, una venta cerrada como `won` y una sesión perdida que deja
 * su folio quemado.
 */

interface KioskItem {
  id: number; code: string; acquisition: 'unidad' | 'pedido'; kind: string
  status: string; price_cents: number; held_by_other: boolean; held_by_me: boolean
}
interface Coverage { seq: number; amount_cents: number; applied_cents: number; remaining_cents: number; status: string }
interface Ledger { balance_cents: number; paid_cents: number; total_cents: number; coverage: Coverage[] }

const tabletA = new Kiosk()
const tabletB = new Kiosk()
const owner = new Kiosk()

let sessionA = 0
let sessionB = 0
let folio = ''
let contractId = 0
let uniqueDress: KioskItem
let madeToOrder: KioskItem
let anticipoCents = 0

const kioskItems = (k: Kiosk, session: number) =>
  k.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${session}`).then((r) => r.items)

beforeAll(async () => {
  await tabletA.login('mty', 'seller', '1111')
  await tabletB.login('mty', 'seller', '1111')
  await owner.login('mty', 'owner', '4242')
  sessionA = (await tabletA.post<{ id: number }>('/api/sessions', { device_label: 'Tableta 1' })).id
  sessionB = (await tabletB.post<{ id: number }>('/api/sessions', { device_label: 'Tableta 2' })).id
})

describe('entrada', () => {
  it('rechaza un NIP equivocado sin decir qué parte falló', async () => {
    const outsider = new Kiosk()
    const refusal = await outsider.refusal('/api/auth/pin', { store: 'mty', role: 'seller', pin: '9999' })
    expect(refusal.status).toBe(401)
    expect(refusal.error).toBe('NIP incorrecto.')
    expect(refusal.error).not.toMatch(/sucursal|rol/i)
  })

  it('no deja pasar a ninguna ruta sin cookie', async () => {
    const outsider = new Kiosk()
    expect((await outsider.refusal('/api/items', undefined, 'GET')).status).toBe(401)
  })

  it('la sucursal y el rol vienen de la cookie, no del cuerpo', async () => {
    const me = await tabletA.get<{ store: string; role: string }>('/api/auth/me')
    expect(me).toMatchObject({ store: 'mty', role: 'seller' })
    // Aunque se mande otra sucursal, el inventario que llega es el de la cookie.
    const items = await tabletA.get<{ items: { store_id: string }[] }>('/api/items?store_id=cdmx')
    expect(items.items.every((i) => i.store_id === 'mty')).toBe(true)
  })
})

describe('apartados entre tabletas', () => {
  it('marcar favorito aparta el vestido único', async () => {
    const items = await kioskItems(tabletA, sessionA)
    uniqueDress = items.find((i) => i.kind === 'dress' && i.acquisition === 'unidad') as KioskItem
    madeToOrder = items.find((i) => i.kind === 'dress' && i.acquisition === 'pedido') as KioskItem
    expect(uniqueDress).toBeDefined()
    expect(madeToOrder).toBeDefined()

    await tabletA.post(`/api/sessions/${sessionA}/favorites`, { item_id: uniqueDress.id })
    await tabletA.post(`/api/sessions/${sessionA}/favorites`, { item_id: madeToOrder.id })
  })

  it('la otra tableta lo ve apagado, y al modelo por pedido no', async () => {
    const items = await kioskItems(tabletB, sessionB)
    expect(items.find((i) => i.id === uniqueDress.id)?.held_by_other).toBe(true)
    // Sigue visible y se puede tocar: no desaparece del catálogo.
    expect(items.some((i) => i.id === uniqueDress.id)).toBe(true)
    // Dos novias pueden encargar el mismo modelo por pedido.
    expect(items.find((i) => i.id === madeToOrder.id)?.held_by_other).toBe(false)
  })

  it('un modelo por pedido nunca cambia de estado ni se aparta', async () => {
    const refusal = await tabletB.refusal(`/api/items/${madeToOrder.id}/hold`, { session_id: sessionB })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/por pedido/)
    const detail = await tabletB.get<{ item: KioskItem }>(`/api/items/${madeToOrder.id}`)
    expect(detail.item.status).toBe('available')
  })
})

describe('elegir el vestido', () => {
  it('emite el folio y suelta los demás apartados de la sesión', async () => {
    const chosen = await tabletA.post<{ contract_id: number; folio: string }>(`/api/sessions/${sessionA}/select`, { item_id: uniqueDress.id })
    folio = chosen.folio
    contractId = chosen.contract_id
    expect(folio).toMatch(/^MTY-\d{5}$/)

    const items = await kioskItems(tabletA, sessionA)
    expect(items.find((i) => i.id === uniqueDress.id)?.held_by_me).toBe(true)
    // El modelo por pedido nunca estuvo apartado, así que nada quedó colgado.
    expect(items.filter((i) => i.held_by_me).map((i) => i.id)).toEqual([uniqueDress.id])
  })

  it('la otra tableta ya no puede elegirlo', async () => {
    const refusal = await tabletB.refusal(`/api/sessions/${sessionB}/select`, { item_id: uniqueDress.id })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/otra clienta/)
  })
})

describe('datos, hoja de medidas y plan', () => {
  it('guarda a la novia con su fecha de evento', async () => {
    await tabletA.post(`/api/sessions/${sessionA}/bride`, {
      name: 'María Fernanda', apellido: 'González', phone: '81 1234 5678', wedding_date: '2027-06-12',
    })
  })

  it('exige el teléfono completo', async () => {
    const refusal = await tabletA.refusal(`/api/sessions/${sessionA}/bride`, {
      name: 'María Fernanda', apellido: 'González', phone: '811234', wedding_date: '2027-06-12',
    })
    expect(refusal.status).toBe(400)
    expect(refusal.error).toMatch(/10 dígitos/)
  })

  it('no avanza a hoja firmada sin la foto', async () => {
    await tabletA.post(`/api/sessions/${sessionA}/sheet-printed`)
    const refusal = await tabletA.refusal(`/api/sessions/${sessionA}/sheet-signed`)
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/hoja de medidas firmada/)
  })

  it('avanza con la foto de la hoja firmada', async () => {
    await tabletA.upload('measurement_sheet', contractId)
    await tabletA.post(`/api/sessions/${sessionA}/sheet-signed`)
  })

  it('ofrece sólo los planes que caben y arma el calendario', async () => {
    const quote = await tabletA.post<{ list_total_cents: number; offers: { plan: { id: number; name: string }; schedule: Coverage[] }[] }>(
      `/api/sessions/${sessionA}/quote`, {})
    expect(quote.list_total_cents).toBe(uniqueDress.price_cents)
    const tres = quote.offers.find((o) => o.plan.name === 'Tres meses')
    expect(tres).toBeDefined()

    const terms = await tabletA.post<{ total_cents: number; schedule: { seq: number; amount_cents: number; due_type: string }[] }>(
      `/api/sessions/${sessionA}/terms`, { plan_id: tres?.plan.id })
    expect(terms.schedule).toHaveLength(3)
    expect(terms.schedule.reduce((a, r) => a + r.amount_cents, 0)).toBe(terms.total_cents)
    anticipoCents = terms.schedule[0]?.amount_cents ?? 0
  })
})

describe('firmar', () => {
  it('se niega a activar el contrato sin la foto del contrato firmado', async () => {
    await tabletA.post(`/api/sessions/${sessionA}/contract-printed`)
    const refusal = await tabletA.refusal(`/api/sessions/${sessionA}/sign`)
    expect(refusal.status).toBe(409)
    expect(refusal.error).toBe('Falta la foto del contrato firmado. Tómala antes de activar el contrato.')
  })

  it('con las dos fotos deja el contrato activo y el vestido apartado', async () => {
    await tabletA.upload('contract', contractId)
    const signed = await tabletA.post<{ status: string }>(`/api/sessions/${sessionA}/sign`)
    expect(signed.status).toBe('active')

    const detail = await tabletA.get<{ item: { status: string } }>(`/api/items/${uniqueDress.id}`)
    expect(detail.item.status).toBe('reserved')
  })

  it('desaparece del kiosko de la otra tableta', async () => {
    const items = await kioskItems(tabletB, sessionB)
    expect(items.some((i) => i.id === uniqueDress.id)).toBe(false)
  })
})

describe('abonos', () => {
  it('no registra un abono sin comprobante', async () => {
    const refusal = await tabletA.refusal('/api/payments', {
      folio, amount_cents: 500_000, method: 'cash', file_ids: [],
    })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/sin el comprobante/)
  })

  it('acepta un abono menor a la parcialidad y todo cuadra', async () => {
    const fileId = await tabletA.upload('receipt', contractId)
    const next = await tabletA.get<{ suggested_amount_cents: number; next_due: Coverage }>(`/api/payments/next/${folio}`)
    expect(next.suggested_amount_cents).toBe(anticipoCents)

    const short = 500_000
    expect(short).toBeLessThan(anticipoCents)
    const { ledger } = await tabletA.post<{ ledger: Ledger }>('/api/payments', {
      folio, amount_cents: short, method: 'cash', installment_id: next.next_due.seq === 1 ? undefined : undefined, file_ids: [fileId],
    })

    expect(ledger.paid_cents).toBe(short)
    expect(ledger.balance_cents).toBe(ledger.total_cents - short)
    expect(ledger.coverage[0]).toMatchObject({ seq: 1, applied_cents: short, remaining_cents: anticipoCents - short, status: 'partial' })
    expect(ledger.coverage[1]?.applied_cents).toBe(0)
    // El calendario acordado no se movió: sigue siendo el del plan fijo.
    expect(ledger.coverage.reduce((a, r) => a + r.amount_cents, 0)).toBe(ledger.total_cents)
  })

  it('una vendedora no puede cancelar un abono', async () => {
    const refusal = await tabletA.refusal('/api/payments/1/void', { reason: 'me equivoqué' })
    expect(refusal.status).toBe(403)
  })
})

describe('cierre de la sesión ganada', () => {
  it('exige el NIP y el resultado', async () => {
    expect((await tabletA.refusal(`/api/sessions/${sessionA}/close`, { outcome: 'won', reason: 'todo bien' })).status).toBe(400)
    expect((await tabletA.refusal(`/api/sessions/${sessionA}/close`, { pin: '1111' })).status).toBe(400)
  })

  it('cierra como vendida', async () => {
    const closed = await tabletA.post<{ outcome: string; sheets_disposed: boolean }>(`/api/sessions/${sessionA}/close`, {
      outcome: 'won', reason: 'Le encantó desde la primera prueba', pin: '1111',
    })
    expect(closed.outcome).toBe('won')
    // Sí se firmó contrato: no hay hojas que destruir.
    expect(closed.sheets_disposed).toBe(false)
  })
})

describe('la dueña ve todo lo que quedó', () => {
  it('el contrato, los abonos, los documentos y la bitácora', async () => {
    const detail = await owner.get<{
      contract: { status: string; folio: string }
      payments: unknown[]; documents: { kind: string }[]; ledger: Ledger
      item: { status: string; code: string }
    }>(`/api/contracts/${folio}`)

    expect(detail.contract.status).toBe('active')
    expect(detail.payments).toHaveLength(1)
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(['contract', 'measurement_sheet', 'receipt'])
    expect(detail.item.status).toBe('reserved')
    expect(detail.ledger.balance_cents).toBeGreaterThan(0)
  })

  it('la búsqueda encuentra el folio por nombre, teléfono y código', async () => {
    for (const q of ['González', '8112345678', uniqueDress.code, folio]) {
      const found = await owner.get<{ results: { folio: string }[] }>(`/api/search?q=${encodeURIComponent(q)}`)
      expect(found.results.map((r) => r.folio)).toContain(folio)
    }
  })

  it('la tarjeta de almacenamiento cuenta las fotos subidas', async () => {
    const storage = await owner.get<{ used_bytes: number; quota_bytes: number; by_kind: { kind: string }[] }>('/api/storage')
    expect(storage.used_bytes).toBeGreaterThan(0)
    expect(storage.quota_bytes).toBe(10 * 1024 * 1024 * 1024)
    expect(storage.by_kind.length).toBeGreaterThan(0)
  })

  it('la revisión de retención no propone borrar nada con saldo abierto', async () => {
    const dry = await owner.get<{ dry_run: boolean; deletable: unknown[] }>('/api/maintenance/retention?dry_run=1')
    expect(dry.dry_run).toBe(true)
    expect(dry.deletable).toHaveLength(0)
  })

  it('el vestido no puede entregarse mientras no esté listo', async () => {
    const refusal = await owner.refusal(`/api/items/${uniqueDress.id}/deliver`)
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/No se puede pasar/)
  })
})

describe('sesión perdida: las hojas y el folio', () => {
  let lostSession = 0
  let lostFolio = ''

  it('imprime medidas y luego se pierde la venta', async () => {
    lostSession = (await tabletB.post<{ id: number }>('/api/sessions', { device_label: 'Tableta 2' })).id
    const items = await kioskItems(tabletB, lostSession)
    const other = items.find((i) => i.kind === 'dress' && i.acquisition === 'unidad' && !i.held_by_other) as KioskItem
    const chosen = await tabletB.post<{ folio: string }>(`/api/sessions/${lostSession}/select`, { item_id: other.id })
    lostFolio = chosen.folio
    expect(lostFolio).not.toBe(folio)

    await tabletB.post(`/api/sessions/${lostSession}/bride`, {
      name: 'Ana', apellido: 'Pérez', phone: '8187654321', wedding_date: '2027-08-01',
    })
    await tabletB.post(`/api/sessions/${lostSession}/sheet-printed`)
  })

  it('pide confirmar que se destruyeron las hojas firmadas', async () => {
    const refusal = await tabletB.refusal(`/api/sessions/${lostSession}/close`, {
      outcome: 'lost', reason: 'precio', pin: '1111',
    })
    expect(refusal.status).toBe(409)
    expect(refusal.error).toBe('Confirma que destruiste las hojas de medidas firmadas de esta sesión.')
  })

  it('sólo acepta motivos de la lista', async () => {
    const refusal = await tabletB.refusal(`/api/sessions/${lostSession}/close`, {
      outcome: 'lost', reason: 'porque sí', pin: '1111', sheets_disposed: true,
    })
    expect(refusal.status).toBe(400)
  })

  it('cierra, conserva el registro como cancelado y libera el vestido', async () => {
    const closed = await tabletB.post<{ sheets_disposed: boolean }>(`/api/sessions/${lostSession}/close`, {
      outcome: 'lost', reason: 'precio', pin: '1111', sheets_disposed: true,
    })
    expect(closed.sheets_disposed).toBe(true)

    const dead = await owner.get<{ contract: { status: string }; customer: { name: string; phone: string } }>(`/api/contracts/${lostFolio}`)
    expect(dead.contract.status).toBe('cancelled')
    // Se conserva su nombre y su teléfono en el registro cancelado.
    expect(dead.customer.name).toBe('Ana')
    expect(dead.customer.phone).toBe('8187654321')
  })

  it('el folio del contrato cancelado nunca se reutiliza', async () => {
    const nextSession = (await tabletB.post<{ id: number }>('/api/sessions', {})).id
    const items = await kioskItems(tabletB, nextSession)
    const another = items.find((i) => i.kind === 'dress' && i.acquisition === 'unidad' && !i.held_by_other) as KioskItem
    const chosen = await tabletB.post<{ folio: string }>(`/api/sessions/${nextSession}/select`, { item_id: another.id })
    expect(chosen.folio).not.toBe(lostFolio)
    expect(chosen.folio).not.toBe(folio)
    expect(Number(chosen.folio.split('-')[1])).toBeGreaterThan(Number(lostFolio.split('-')[1]))
  })
})
