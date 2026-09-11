import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk, sql } from './helpers/client'

/**
 * El calendario de pagos se congela cuando se escoge el plan y el papel manda.
 *
 * Antes se volvía a generar al firmar con la fecha de firma. Si la vendedora
 * imprimía el jueves y la novia firmaba el viernes, el papel que ella se
 * llevaba y la base de datos no coincidían en una sola fecha de vencimiento —y
 * el papel es el registro legal. Ahora firmar en otro día se niega y hay que
 * reimprimir.
 */

interface KioskItem { id: number; kind: string; acquisition: string; name: string; code: string }
interface Installment { seq: number; due_type: string; due_date: string | null; amount_cents: number }

const tablet = new Kiosk()
let sessionId = 0
let folio = ''
let contractId = 0
let planId = 0

const today = new Date().toISOString().slice(0, 10)

/** Las parcialidades tal como quedaron guardadas. */
const stored = () =>
  tablet.get<{ installments: Installment[] }>(`/api/contracts/${folio}`).then((r) => r.installments)

/** Las parcialidades tal como salen en la hoja que se imprime. */
const printed = () =>
  tablet.get<{ installments: Installment[] }>(`/api/contracts/${folio}/print`).then((r) => r.installments)

beforeAll(async () => {
  await tablet.login('mty', 'seller', '1111')
  sessionId = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'Calendario' })).id
  const { items } = await tablet.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${sessionId}`)
  // Un modelo por pedido: no le quita existencias a las demás pruebas.
  const dress = items.find((i) => i.kind === 'dress' && i.acquisition === 'pedido') as KioskItem

  const chosen = await tablet.post<{ contract_id: number; folio: string }>(
    `/api/sessions/${sessionId}/select`, { item_id: dress.id, pin: '1111' })
  folio = chosen.folio
  contractId = chosen.contract_id

  await tablet.post(`/api/sessions/${sessionId}/bride`, {
    name: 'Ximena', apellido: 'Cantú', phone: '8119998877', wedding_date: '2027-11-20',
  })
  await tablet.post(`/api/sessions/${sessionId}/sheet-printed`)
  await tablet.upload('measurement_sheet', contractId)
  await tablet.post(`/api/sessions/${sessionId}/sheet-signed`)

  const quote = await tablet.post<{ offers: { plan: { id: number; name: string } }[] }>(
    `/api/sessions/${sessionId}/quote`, {})
  planId = (quote.offers.find((o) => o.plan.name === '40/30/30') ?? quote.offers[0])?.plan.id as number
})

describe('el calendario se congela al escoger el plan', () => {
  it('escoger el plan lo escribe y lo sella con el día de hoy', async () => {
    const terms = await tablet.post<{ schedule: Installment[]; schedule_generated_on: string }>(
      `/api/sessions/${sessionId}/terms`, { plan_id: planId })
    expect(terms.schedule_generated_on).toBe(today)
    expect(terms.schedule.length).toBeGreaterThan(1)

    // Lo guardado es exactamente lo ofrecido.
    expect(await stored()).toEqual(terms.schedule.map((r) => expect.objectContaining({
      seq: r.seq, due_type: r.due_type, due_date: r.due_date, amount_cents: r.amount_cents,
    })))
  })

  it('el contrato se imprime con esas mismas fechas', async () => {
    await tablet.post(`/api/sessions/${sessionId}/contract-printed`)
    const onPaper = await printed()
    const inDb = await stored()
    expect(onPaper.map((r) => [r.seq, r.due_type, r.due_date, r.amount_cents]))
      .toEqual(inDb.map((r) => [r.seq, r.due_type, r.due_date, r.amount_cents]))
  })
})

describe('firmar un día después', () => {
  it('se niega y dice que hay que reimprimir', async () => {
    await tablet.upload('contract', contractId)

    // Se adelanta el reloj un día: el calendario queda generado «ayer».
    await sql(`UPDATE contracts SET schedule_generated_on = date(schedule_generated_on, '-1 day') WHERE id = ${contractId}`)

    const refusal = await tablet.refusal(`/api/sessions/${sessionId}/sign`)
    expect(refusal.status).toBe(409)
    expect(refusal.error).toMatch(/Vuelve a imprimir el contrato/)
  })

  it('no tocó el calendario guardado al negarse', async () => {
    const inDb = await stored()
    expect(inDb.length).toBeGreaterThan(1)
    // Las fechas siguen siendo las que se imprimieron: negarse no corrige nada
    // a escondidas, ni el papel ni la base.
    const onPaper = await printed()
    expect(onPaper.map((r) => r.due_date)).toEqual(inDb.map((r) => r.due_date))
  })

  it('reimprimir vuelve a generar con la fecha de hoy y deja firmar', async () => {
    // «Volver a imprimir» es exactamente esto: el mismo plan, otra vez.
    const again = await tablet.post<{ schedule_generated_on: string }>(
      `/api/sessions/${sessionId}/terms`, { plan_id: planId })
    expect(again.schedule_generated_on).toBe(today)

    const state = await tablet.get<{ session: { stage: string } }>(`/api/sessions/${sessionId}`)
    expect(state.session.stage).toBe('terms')

    await tablet.post(`/api/sessions/${sessionId}/contract-printed`)
    const onPaper = await printed()
    const signed = await tablet.post<{ status: string }>(`/api/sessions/${sessionId}/sign`)
    expect(signed.status).toBe('active')

    // Lo que quedó guardado es, renglón por renglón, lo que salió impreso.
    const inDb = await stored()
    expect(inDb.map((r) => [r.seq, r.due_type, r.due_date, r.amount_cents]))
      .toEqual(onPaper.map((r) => [r.seq, r.due_type, r.due_date, r.amount_cents]))
  })
})
