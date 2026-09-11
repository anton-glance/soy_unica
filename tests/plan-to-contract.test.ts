import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'

/**
 * C1 — Escoger un plan tiene que llevar al contrato impreso.
 *
 * El bloqueo que se reportó estaba en la pantalla: el panel del plan no era el
 * botón, así que «Guardar el plan» quedaba deshabilitado en silencio. Este
 * recorrido deja amarrado el camino completo del lado del servidor —cotizar,
 * escoger el plan, imprimir— para que un plan escogido nunca vuelva a quedarse
 * sin contrato.
 */

interface KioskItem { id: number; kind: string; acquisition: string; price_cents: number; name: string; code: string }
interface Installment { seq: number; due_type: string; due_date: string | null; amount_cents: number }

const tablet = new Kiosk()
let sessionId = 0
let folio = ''
let contractId = 0
let dress: KioskItem

beforeAll(async () => {
  await tablet.login('mty', 'seller', '1111')
  sessionId = (await tablet.post<{ id: number }>('/api/sessions', { device_label: 'Prueba del plan' })).id
  const { items } = await tablet.get<{ items: KioskItem[] }>(`/api/items/kiosk?session=${sessionId}`)
  // Un modelo por pedido: nunca se aparta, así que esta prueba no le quita
  // existencias a las demás.
  dress = items.find((i) => i.kind === 'dress' && i.acquisition === 'pedido') as KioskItem
  expect(dress).toBeDefined()

  const chosen = await tablet.post<{ contract_id: number; folio: string }>(
    `/api/sessions/${sessionId}/select`, { item_id: dress.id, pin: '1111' })
  folio = chosen.folio
  contractId = chosen.contract_id

  await tablet.post(`/api/sessions/${sessionId}/bride`, {
    name: 'Paulina', apellido: 'Treviño', phone: '8115556677', wedding_date: '2027-09-04',
  })
  await tablet.post(`/api/sessions/${sessionId}/sheet-printed`)
  await tablet.upload('measurement_sheet', contractId)
  await tablet.post(`/api/sessions/${sessionId}/sheet-signed`)
})

describe('de escoger el plan al contrato impreso', () => {
  it('la cotización ofrece los planes de la tienda', async () => {
    const quote = await tablet.post<{ offers: { plan: { id: number; name: string } }[] }>(
      `/api/sessions/${sessionId}/quote`, {})
    expect(quote.offers.length).toBeGreaterThan(0)
    // Nunca puede quedar en «ningún plan cabe» para una boda a más de un año.
    expect(quote.offers.map((o) => o.plan.name)).toContain('40/30/30')
  })

  it('escoger el plan guarda el calendario y adelanta la sesión', async () => {
    const quote = await tablet.post<{ offers: { plan: { id: number; name: string } }[] }>(
      `/api/sessions/${sessionId}/quote`, {})
    const plan = quote.offers.find((o) => o.plan.name === '20 × 5') ?? quote.offers[0]

    const terms = await tablet.post<{ total_cents: number; schedule: Installment[] }>(
      `/api/sessions/${sessionId}/terms`, { plan_id: plan?.plan.id })

    expect(terms.schedule.length).toBeGreaterThan(0)
    expect(terms.schedule.reduce((a, r) => a + r.amount_cents, 0)).toBe(terms.total_cents)

    // Lo que cierra el bug: después de guardar el plan la sesión avanza sola.
    const state = await tablet.get<{ session: { stage: string } }>(`/api/sessions/${sessionId}`)
    expect(state.session.stage).toBe('terms')
  })

  it('el contrato impreso trae el plan, el vestido y el calendario completo', async () => {
    await tablet.post(`/api/sessions/${sessionId}/contract-printed`)

    const print = await tablet.get<{
      contract: { folio: string; plan_name: string | null; total_cents: number }
      installments: Installment[]
      contract_body: string
    }>(`/api/contracts/${folio}/print`)

    expect(print.contract.folio).toBe(folio)
    expect(print.contract.plan_name).toBeTruthy()
    expect(print.installments.length).toBeGreaterThan(0)

    // El cuerpo es la plantilla real con los marcadores ya resueltos: nada de
    // «{{...}}» puede llegar al papel.
    expect(print.contract_body).not.toMatch(/\{\{/)
    expect(print.contract_body).toContain('Paulina')
    expect(print.contract_body).toContain(dress.name)

    const state = await tablet.get<{ session: { stage: string } }>(`/api/sessions/${sessionId}`)
    expect(state.session.stage).toBe('contract_printed')
  })
})
