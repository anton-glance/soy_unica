import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv, Session } from '../lib/env'
import { all, digitsOnly, one, run, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors'
import { verifyPin } from '../lib/crypto'
import { issueFolio } from '../lib/folio'
import { nowIso, isDate, todayISO, formatDateMX } from '../lib/dates'
import { evaluatePlans, parseSplits, type Plan } from '../lib/plans'
import { pctOf } from '../lib/money'
import { loadItem } from './items'

const app = new Hono<AppEnv>()

async function assertOwnPin(db: D1Database, s: Session, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw badRequest('Marca tu NIP para cerrar la sesión.')
  const user = await one<{ pin_hash: string; pin_salt: string }>(db, `SELECT pin_hash, pin_salt FROM users WHERE id = ? AND active = 1`, s.userId)
  if (!user || !(await verifyPin(pin, user.pin_hash, user.pin_salt))) throw unauthorized('NIP incorrecto.', 'bad_pin')
}

export type Stage =
  | 'browsing' | 'fitting' | 'selected' | 'bride_data' | 'sheet_printed'
  | 'sheet_signed' | 'terms' | 'contract_printed' | 'signed' | 'payment' | 'closed'

/** Ver y probar se alternan libremente; de ahí en adelante el orden es fijo. */
const ALLOWED_FROM: Record<Stage, Stage[]> = {
  browsing: ['browsing', 'fitting'],
  fitting: ['browsing', 'fitting'],
  selected: ['browsing', 'fitting'],
  bride_data: ['selected', 'bride_data'],
  sheet_printed: ['bride_data', 'sheet_printed'],
  sheet_signed: ['sheet_printed'],
  // Desde 'contract_printed' se puede volver a 'terms': es lo que hace
  // «Volver a imprimir» cuando el calendario impreso ya no es el de hoy.
  terms: ['sheet_signed', 'terms', 'contract_printed'],
  contract_printed: ['terms', 'contract_printed'],
  signed: ['contract_printed'],
  payment: ['signed', 'payment'],
  closed: ['browsing', 'fitting', 'selected', 'bride_data', 'sheet_printed', 'sheet_signed', 'terms', 'contract_printed', 'signed', 'payment'],
}

export interface SessionRow {
  id: number
  store_id: string
  device_label: string
  opened_by: number
  stage: Stage
  customer_id: number | null
  contract_id: number | null
  closed_at: string | null
  outcome: string | null
}

async function loadSession(db: D1Database, store: string, id: number): Promise<SessionRow> {
  const row = await one<SessionRow>(db, `SELECT * FROM kiosk_sessions WHERE id = ? AND store_id = ?`, id, store)
  if (!row) throw notFound('Esa sesión no existe en esta sucursal.')
  return row
}

function assertOpen(s: SessionRow): void {
  if (s.closed_at) throw conflict('Esa sesión ya se cerró. Empieza una nueva.')
}

/** Cada transición deja renglón en `session_events` con su marca de tiempo. */
function advance(db: D1Database, s: SessionRow, to: Stage, detail?: string): D1PreparedStatement[] {
  if (!ALLOWED_FROM[to].includes(s.stage)) {
    throw conflict(`No se puede pasar de «${s.stage}» a «${to}».`)
  }
  return [
    stmt(db, `UPDATE kiosk_sessions SET stage = ? WHERE id = ?`, to, s.id),
    stmt(db, `INSERT INTO session_events (session_id, stage, detail) VALUES (?,?,?)`, s.id, to, detail ?? null),
  ]
}

async function contractOf(db: D1Database, s: SessionRow) {
  if (!s.contract_id) throw conflict('Todavía no se ha elegido un vestido en esta sesión.')
  const contract = await one<ContractRow>(db, `SELECT * FROM contracts WHERE id = ?`, s.contract_id)
  if (!contract) throw notFound('No se encontró el contrato de esta sesión.')
  return contract
}

interface ContractRow {
  id: number
  folio: string
  customer_id: number | null
  status: string
  list_total_cents: number
  discount_cents: number
  total_cents: number
  plan_id: number | null
  plan_name: string | null
  schedule_generated_on: string | null
}

// ────────────────────────────────────────────────────── abrir y leer ──
app.post('/', async (c) => {
  const s = c.get('session')
  const body = await readJson<{ device_label?: string }>(c)
  const result = await run(
    c.env.DB,
    `INSERT INTO kiosk_sessions (store_id, device_label, opened_by, stage) VALUES (?,?,?,'browsing')`,
    s.store, String(body.device_label ?? '').slice(0, 60), s.userId,
  )
  const id = Number(result.meta.last_row_id)
  await run(c.env.DB, `INSERT INTO session_events (session_id, stage, detail) VALUES (?,?,?)`, id, 'browsing', 'sesión abierta')
  return c.json({ id }, 201)
})

app.get('/:id{[0-9]+}', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  const favorites = await all<{ item_id: number }>(c.env.DB, `SELECT item_id FROM session_favorites WHERE session_id = ?`, row.id)
  const contract = row.contract_id
    ? await one<ContractRow>(c.env.DB, `SELECT * FROM contracts WHERE id = ?`, row.contract_id)
    : null
  const customer = row.customer_id
    ? await one(c.env.DB, `SELECT * FROM customers WHERE id = ?`, row.customer_id)
    : null
  const events = await all(c.env.DB, `SELECT stage, at, detail FROM session_events WHERE session_id = ? ORDER BY at, id`, row.id)
  const documents = contract
    ? await all<{ id: string; kind: string }>(c.env.DB, `SELECT id, kind FROM files WHERE contract_id = ?`, contract.id)
    : []
  return c.json({ session: row, favorites: favorites.map((f) => f.item_id), contract, customer, events, documents })
})

// ───────────────────────────────────────────── ver, probar, favoritos ──
app.post('/:id{[0-9]+}/stage', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const body = await readJson<{ stage?: Stage }>(c)
  const to = body.stage
  if (to !== 'browsing' && to !== 'fitting') throw badRequest('Sólo se puede alternar entre ver y probar.')
  await c.env.DB.batch(advance(c.env.DB, row, to))
  return c.json({ stage: to })
})

/**
 * Abrir el detalle de un vestido o marcarlo como favorito lo pone en
 * `watching`, apartado por esta sesión. Si otra tableta ya lo tiene, no se le
 * quita: la novia lo ve, pero apagado.
 */
async function takeHold(db: D1Database, session: SessionRow, itemId: number, store: string): Promise<void> {
  const item = await loadItem(db, store, itemId)
  if (item.acquisition === 'pedido') return
  if (item.status === 'available' && item.held_by_session === null) {
    await run(db, `UPDATE items SET status = 'watching', held_by_session = ?, updated_at = ? WHERE id = ? AND status = 'available'`, session.id, nowIso(), itemId)
  }
}

app.post('/:id{[0-9]+}/view', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const body = await readJson<{ item_id?: number }>(c)
  await takeHold(c.env.DB, row, Number(body.item_id), s.store)
  await run(c.env.DB, `INSERT INTO session_events (session_id, stage, detail) VALUES (?,?,?)`, row.id, row.stage, `vio el artículo ${body.item_id}`)
  return c.json({ ok: true })
})

app.post('/:id{[0-9]+}/favorites', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const body = await readJson<{ item_id?: number; remove?: boolean }>(c)
  const itemId = Number(body.item_id)
  if (!itemId) throw badRequest('Falta el artículo.')

  if (body.remove) {
    await c.env.DB.batch([
      stmt(c.env.DB, `DELETE FROM session_favorites WHERE session_id = ? AND item_id = ?`, row.id, itemId),
      stmt(c.env.DB, `UPDATE items SET status = 'available', held_by_session = NULL, updated_at = ?
                      WHERE id = ? AND held_by_session = ? AND status = 'watching'`, nowIso(), itemId, row.id),
    ])
    return c.json({ favorite: false })
  }

  await run(c.env.DB, `INSERT OR IGNORE INTO session_favorites (session_id, item_id) VALUES (?,?)`, row.id, itemId)
  await takeHold(c.env.DB, row, itemId, s.store)
  return c.json({ favorite: true })
})

/**
 * El momento en que la tableta pasa de manos. Es un hecho de la sesión, no de
 * la pantalla: aquí se comprueba el NIP en el servidor y queda escrito quién
 * tomó la tableta y qué favoritos se fueron al probador.
 */
app.post('/:id{[0-9]+}/handover', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const body = await readJson<{ pin?: string }>(c)
  await assertOwnPin(c.env.DB, s, String(body.pin ?? ''))

  const favorites = await all<{ code: string }>(
    c.env.DB,
    `SELECT i.code FROM session_favorites f JOIN items i ON i.id = f.item_id
     WHERE f.session_id = ? ORDER BY f.added_at, f.item_id`,
    row.id,
  )
  const codes = favorites.map((f) => f.code)
  const detail = codes.length
    ? `la vendedora tomó la tableta · ${codes.length} al probador: ${codes.join(', ')}`
    : 'la vendedora tomó la tableta · sin favoritos'

  await c.env.DB.batch(advance(c.env.DB, row, 'fitting', detail))
  return c.json({ ok: true, favorites: codes })
})

// ───────────────────────────────────────────────────────── selección ──
/**
 * Elegir libera todos los demás apartados de la sesión y crea el contrato en
 * borrador con su folio. El folio se imprime en todas las hojas.
 */
app.post('/:id{[0-9]+}/select', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  if (row.contract_id) throw conflict('Esta sesión ya tiene un vestido elegido.')
  const body = await readJson<{ item_id?: number; pin?: string; accessory_item_ids?: number[] }>(c)

  // La tableta la trae la novia. Emitir folio es una acción de contrato, así
  // que aquí se comprueba que quien la tocó es la vendedora, en el servidor y
  // no sólo en la pantalla.
  await assertOwnPin(c.env.DB, s, String(body.pin ?? ''))

  const item = await loadItem(c.env.DB, s.store, Number(body.item_id))
  if (item.kind !== 'dress') throw badRequest('Hay que elegir un vestido, no un accesorio.')

  if (item.acquisition === 'unidad') {
    if (item.held_by_session !== null && item.held_by_session !== row.id) {
      throw conflict('Ese vestido lo está viendo otra clienta en este momento.')
    }
    if (!['available', 'watching'].includes(item.status)) {
      throw conflict('Ese vestido ya no está disponible.')
    }
  }

  const accessoryIds = (body.accessory_item_ids ?? []).map(Number).filter(Boolean)
  const accessories = accessoryIds.length
    ? await all<{ id: number; code: string; name: string; price_cents: number }>(
        c.env.DB,
        `SELECT id, code, name, price_cents FROM items
         WHERE store_id = ? AND kind = 'accessory' AND id IN (${accessoryIds.map(() => '?').join(',')})`,
        s.store, ...accessoryIds)
    : []

  const folio = await issueFolio(c.env.DB, s.store)
  const result = await run(
    c.env.DB,
    `INSERT INTO contracts (store_id, folio, seller_id, session_id, status, list_total_cents, total_cents)
     VALUES (?,?,?,?, 'draft', ?, ?)`,
    s.store, folio, s.userId, row.id, item.price_cents, item.price_cents,
  )
  const contractId = Number(result.meta.last_row_id)

  await c.env.DB.batch([
    // Suelta todos los demás apartados de esta sesión.
    stmt(c.env.DB, `UPDATE items SET status = 'available', held_by_session = NULL, updated_at = ?
                    WHERE held_by_session = ? AND id <> ? AND status = 'watching'`, nowIso(), row.id, item.id),
    stmt(c.env.DB, `UPDATE items SET status = CASE WHEN acquisition = 'pedido' THEN status ELSE 'watching' END,
                    held_by_session = CASE WHEN acquisition = 'pedido' THEN NULL ELSE ? END, updated_at = ?
                    WHERE id = ?`, row.id, nowIso(), item.id),
    stmt(c.env.DB, `UPDATE kiosk_sessions SET contract_id = ? WHERE id = ?`, contractId, row.id),
    stmt(c.env.DB, `INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
                    VALUES (?,?,?,?, 'dress', 0)`, contractId, item.id, `${item.name} (${item.code})`, item.price_cents),
    // Los accesorios se eligen en la misma pantalla que el vestido, así que
    // entran al contrato desde ya y no hasta el plan de pago.
    ...accessories.map((a, i) =>
      stmt(c.env.DB, `INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
                      VALUES (?,?,?,?, 'accessory', ?)`, contractId, a.id, `${a.name} (${a.code})`, a.price_cents, i + 1)),
    // El mismo hecho, en el renglón de la sesión: un contrato anulado sigue
    // existiendo, pero lo que la vendedora escogió es del historial de la
    // clienta y no puede depender de qué le pase después al contrato.
    stmt(c.env.DB, `INSERT OR REPLACE INTO session_selections (session_id, item_id, line_kind) VALUES (?,?,'dress')`, row.id, item.id),
    ...accessories.map((a) =>
      stmt(c.env.DB, `INSERT OR REPLACE INTO session_selections (session_id, item_id, line_kind) VALUES (?,?,'accessory')`, row.id, a.id)),
    ...advance(c.env.DB, row, 'selected',
      `vestido ${item.code}${accessories.length ? ` · accesorios: ${accessories.map((a) => a.code).join(', ')}` : ' · sin accesorios'} · folio ${folio}`),
    auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: contractId, action: 'draft', after: { folio, item: item.code } }),
  ])
  return c.json({ contract_id: contractId, folio })
})

// ────────────────────────────────────────────────── datos de la novia ──
app.post('/:id{[0-9]+}/bride', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const contract = await contractOf(c.env.DB, row)
  const body = await readJson<{ name?: string; apellido?: string; phone?: string; wedding_date?: string | null; color?: string }>(c)

  const name = String(body.name ?? '').trim()
  const apellido = String(body.apellido ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!name) throw badRequest('Falta el nombre de la novia.')
  if (!apellido) throw badRequest('Falta el apellido.')
  if (digitsOnly(phone).length < 10) throw badRequest('El teléfono debe traer 10 dígitos.')
  const wedding = body.wedding_date ? String(body.wedding_date) : null
  if (wedding && !isDate(wedding)) throw badRequest('La fecha del evento no es válida.')
  // Una boda no ocurre en el pasado: casi siempre es un año mal tecleado.
  if (wedding && wedding < todayISO()) throw badRequest('La fecha del evento no puede ser anterior a hoy.')

  let customerId = row.customer_id
  if (customerId) {
    await run(
      c.env.DB,
      `UPDATE customers SET name=?, apellido=?, phone=?, phone_digits=?, wedding_date=?, updated_at=? WHERE id=? AND store_id=?`,
      name, apellido, phone, digitsOnly(phone), wedding, nowIso(), customerId, s.store,
    )
  } else {
    const created = await run(
      c.env.DB,
      `INSERT INTO customers (store_id, name, apellido, phone, phone_digits, wedding_date) VALUES (?,?,?,?,?,?)`,
      s.store, name, apellido, phone, digitsOnly(phone), wedding,
    )
    customerId = Number(created.meta.last_row_id)
  }

  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE kiosk_sessions SET customer_id = ? WHERE id = ?`, customerId, row.id),
    stmt(c.env.DB, `UPDATE contracts SET customer_id = ?, updated_at = ? WHERE id = ?`, customerId, nowIso(), contract.id),
    ...(body.color ? [stmt(c.env.DB, `UPDATE items SET color = ?, updated_at = ? WHERE contract_id IS NULL AND id = (SELECT item_id FROM contract_items WHERE contract_id = ? AND line_kind = 'dress')`, body.color, nowIso(), contract.id)] : []),
    ...advance(c.env.DB, row, 'bride_data', name),
  ])
  return c.json({ customer_id: customerId })
})

// ──────────────────────────────────────── hoja de medidas y contrato ──
app.post('/:id{[0-9]+}/sheet-printed', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const contract = await contractOf(c.env.DB, row)
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE contracts SET printed_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), contract.id),
    ...advance(c.env.DB, row, 'sheet_printed', '2 copias'),
  ])
  return c.json({ ok: true })
})

/**
 * Las medidas nunca se capturan: la evidencia es la foto de la hoja firmada.
 * No existe ni un solo campo numérico de medidas en el sistema.
 */
app.post('/:id{[0-9]+}/sheet-signed', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const contract = await contractOf(c.env.DB, row)
  const photo = await one<{ id: string }>(
    c.env.DB, `SELECT id FROM files WHERE contract_id = ? AND kind = 'measurement_sheet' LIMIT 1`, contract.id,
  )
  if (!photo) throw conflict('Falta la foto de la hoja de medidas firmada. Tómala antes de seguir.')
  await c.env.DB.batch(advance(c.env.DB, row, 'sheet_signed', photo.id))
  return c.json({ ok: true })
})

// ──────────────────────────────────────────────── planes y contrato ──
interface Extras { accessory_item_ids?: number[]; surcharge_ids?: number[] }

async function quote(db: D1Database, store: string, contract: ContractRow, extras: Extras) {
  const dressLine = await one<{ item_id: number; price_cents: number }>(
    db, `SELECT item_id, price_cents FROM contract_items WHERE contract_id = ? AND line_kind = 'dress'`, contract.id,
  )
  const dressPrice = dressLine?.price_cents ?? 0

  // Si la petición no trae accesorios, valen los que ya están en el contrato
  // desde la pantalla de selección: una sola fuente de verdad.
  const chosen = extras.accessory_item_ids ?? (
    await all<{ item_id: number }>(
      db, `SELECT item_id FROM contract_items WHERE contract_id = ? AND line_kind = 'accessory' AND item_id IS NOT NULL`, contract.id)
  ).map((r) => r.item_id)

  const accessories = chosen.length
    ? await all<{ id: number; code: string; name: string; price_cents: number }>(
        db,
        `SELECT id, code, name, price_cents FROM items
         WHERE store_id = ? AND id IN (${chosen.map(() => '?').join(',')})`,
        store, ...chosen,
      )
    : []
  const surcharges = extras.surcharge_ids?.length
    ? await all<{ id: number; name: string; amount_cents: number; pct: number }>(
        db,
        `SELECT id, name, amount_cents, pct FROM surcharges
         WHERE store_id = ? AND active = 1 AND id IN (${extras.surcharge_ids.map(() => '?').join(',')})`,
        store, ...extras.surcharge_ids,
      )
    : []

  const surchargeLines = surcharges.map((sc) => ({
    ...sc,
    charge_cents: sc.amount_cents > 0 ? sc.amount_cents : pctOf(dressPrice, sc.pct),
  }))
  const list_total_cents =
    dressPrice +
    accessories.reduce((sum, a) => sum + a.price_cents, 0) +
    surchargeLines.reduce((sum, sc) => sum + sc.charge_cents, 0)

  return { dressPrice, accessories, surchargeLines, list_total_cents }
}

async function loadPlans(db: D1Database, store: string): Promise<Plan[]> {
  const rows = await all<Plan & { splits: string }>(
    db, `SELECT * FROM plans WHERE store_id = ? AND active = 1 ORDER BY sort, id`, store,
  )
  return rows.map((r) => ({ ...r, splits: parseSplits(r.splits) }))
}

/** Vista previa: qué planes caben y cómo quedaría el calendario. */
app.post('/:id{[0-9]+}/quote', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  const contract = await contractOf(c.env.DB, row)
  const extras = await readJson<Extras>(c)
  const { list_total_cents, accessories, surchargeLines } = await quote(c.env.DB, s.store, contract, extras)

  const store = await one<{ min_days_before_wedding: number }>(c.env.DB, `SELECT min_days_before_wedding FROM stores WHERE id = ?`, s.store)
  const customer = contract.customer_id
    ? await one<{ wedding_date: string | null }>(c.env.DB, `SELECT wedding_date FROM customers WHERE id = ?`, contract.customer_id)
    : null

  const { offers, rejected } = evaluatePlans({
    plans: await loadPlans(c.env.DB, s.store),
    listTotalCents: list_total_cents,
    signedOn: todayISO(),
    weddingDate: customer?.wedding_date ?? null,
    minDaysBeforeWedding: store?.min_days_before_wedding ?? 0,
  })
  return c.json({
    list_total_cents,
    accessories,
    surcharges: surchargeLines,
    offers,
    // Cuando no cabe ninguno, la vendedora necesita saber qué restricción falló.
    rejected: rejected.map((r) => ({ plan_name: r.plan.name, reason: r.reason, detail: r.detail })),
    wedding_date: customer?.wedding_date ?? null,
  })
})

app.post('/:id{[0-9]+}/terms', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const contract = await contractOf(c.env.DB, row)
  const body = await readJson<Extras & { plan_id?: number }>(c)
  const planId = Number(body.plan_id)
  if (!planId) throw badRequest('Escoge un plan de pago.')

  const { dressPrice, accessories, surchargeLines, list_total_cents } = await quote(c.env.DB, s.store, contract, body)
  const store = await one<{ min_days_before_wedding: number }>(c.env.DB, `SELECT min_days_before_wedding FROM stores WHERE id = ?`, s.store)
  const customer = contract.customer_id
    ? await one<{ wedding_date: string | null }>(c.env.DB, `SELECT wedding_date FROM customers WHERE id = ?`, contract.customer_id)
    : null

  const { offers, rejected } = evaluatePlans({
    plans: await loadPlans(c.env.DB, s.store),
    listTotalCents: list_total_cents,
    signedOn: todayISO(),
    weddingDate: customer?.wedding_date ?? null,
    minDaysBeforeWedding: store?.min_days_before_wedding ?? 0,
  })
  const offer = offers.find((o) => o.plan.id === planId)
  if (!offer) {
    const why = rejected.find((r) => r.plan.id === planId)
    throw conflict(why ? `Ese plan no aplica: ${why.detail}` : 'Ese plan no aplica para este precio o esta fecha de evento.')
  }

  // Las parcialidades se escriben aquí, al escoger el plan, y ya no se vuelven
  // a tocar: el contrato se imprime ANTES de la firma, así que estas fechas son
  // las que salen en el papel que la novia se lleva. Se guarda con qué día se
  // generaron; si la firma cae en otro día, /sign se niega y hay que reimprimir.
  const generatedOn = todayISO()
  const lines = [
    stmt(c.env.DB, `DELETE FROM installments WHERE contract_id = ?`, contract.id),
    ...offer.schedule.map((r) =>
      stmt(c.env.DB, `INSERT INTO installments (contract_id, seq, due_type, due_date, amount_cents) VALUES (?,?,?,?,?)`,
        contract.id, r.seq, r.due_type, r.due_date, r.amount_cents)),
    stmt(c.env.DB, `DELETE FROM contract_items WHERE contract_id = ? AND line_kind <> 'dress'`, contract.id),
    ...accessories.map((a, i) =>
      stmt(c.env.DB, `INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
                      VALUES (?,?,?,?, 'accessory', ?)`, contract.id, a.id, `${a.name} (${a.code})`, a.price_cents, i + 1)),
    ...surchargeLines.map((sc, i) =>
      stmt(c.env.DB, `INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
                      VALUES (?,?,?,?, 'surcharge', ?)`, contract.id, null, sc.name, sc.charge_cents, 100 + i)),
    stmt(c.env.DB, `UPDATE contracts SET plan_id = ?, plan_name = ?, list_total_cents = ?, discount_cents = ?, total_cents = ?,
                                         schedule_generated_on = ?, updated_at = ?
                    WHERE id = ?`, offer.plan.id, offer.plan.name, list_total_cents, offer.discount_cents, offer.total_cents,
                    generatedOn, nowIso(), contract.id),
    ...advance(c.env.DB, row, 'terms', offer.plan.name),
    auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: contract.id, action: 'terms', after: { plan: offer.plan.name, total_cents: offer.total_cents } }),
  ]
  await c.env.DB.batch(lines)
  return c.json({
    plan: offer.plan.name, total_cents: offer.total_cents, schedule: offer.schedule,
    dress_price_cents: dressPrice, schedule_generated_on: generatedOn,
  })
})

app.post('/:id{[0-9]+}/contract-printed', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  await contractOf(c.env.DB, row)
  await c.env.DB.batch(advance(c.env.DB, row, 'contract_printed', 'reverso de las mismas 2 hojas'))
  return c.json({ ok: true })
})

/**
 * Firmar: el contrato sale de borrador sólo con las dos fotos (hoja de medidas
 * y contrato). Las parcialidades NO se vuelven a generar aquí: ya se
 * escribieron al escoger el plan y son las que salieron impresas. El papel
 * firmado es el registro legal, así que la base de datos se ajusta al papel y
 * no al revés.
 */
app.post('/:id{[0-9]+}/sign', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const contract = await contractOf(c.env.DB, row)
  if (!contract.plan_id) throw conflict('Falta escoger el plan de pago.')

  const docs = await all<{ kind: string }>(c.env.DB, `SELECT DISTINCT kind FROM files WHERE contract_id = ?`, contract.id)
  const kinds = new Set(docs.map((d) => d.kind))
  if (!kinds.has('measurement_sheet')) throw conflict('Falta la foto de la hoja de medidas firmada.')
  if (!kinds.has('contract')) throw conflict('Falta la foto del contrato firmado. Tómala antes de activar el contrato.')

  // Si se firma en un día distinto al que se generó el calendario, el papel que
  // la novia tiene enfrente trae otras fechas de vencimiento que las que
  // quedarían guardadas. No se corrige ninguno de los dos en silencio: se
  // reimprime.
  const signedOn = todayISO()
  if (contract.schedule_generated_on && contract.schedule_generated_on !== signedOn) {
    throw conflict(
      `El contrato impreso trae el calendario del ${formatDateMX(contract.schedule_generated_on)} y hoy es ` +
        `${formatDateMX(signedOn)}: las fechas de pago del papel ya no son las de hoy. ` +
        'Vuelve a imprimir el contrato con las fechas nuevas y que lo firme sobre ese.',
      'stale_schedule',
    )
  }

  const schedule = await all<{ seq: number; due_type: string; due_date: string | null; amount_cents: number }>(
    c.env.DB, `SELECT seq, due_type, due_date, amount_cents FROM installments WHERE contract_id = ? ORDER BY seq`, contract.id,
  )
  if (schedule.length === 0) throw conflict('Este contrato no tiene calendario de pagos. Vuelve a escoger el plan.')

  const dress = await one<{ item_id: number | null }>(
    c.env.DB, `SELECT item_id FROM contract_items WHERE contract_id = ? AND line_kind = 'dress'`, contract.id,
  )
  const statements: D1PreparedStatement[] = [
    stmt(c.env.DB, `UPDATE contracts SET status = 'active', signed_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
      nowIso(), nowIso(), contract.id),
    ...advance(c.env.DB, row, 'signed', contract.folio),
    auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: contract.id, action: 'active', before: { status: 'draft' }, after: { status: 'active', folio: contract.folio } }),
  ]

  if (dress?.item_id) {
    const item = await loadItem(c.env.DB, s.store, dress.item_id)
    if (item.acquisition === 'unidad') {
      // Un vestido único vive en un solo contrato vigente a la vez.
      const clash = await one<{ folio: string }>(
        c.env.DB,
        `SELECT folio FROM contracts c JOIN items i ON i.contract_id = c.id
         WHERE i.id = ? AND c.status IN ('active','paid','delivered') AND c.id <> ?`,
        item.id, contract.id,
      )
      if (clash) throw conflict(`Ese vestido ya está en el contrato ${clash.folio}.`)
      statements.push(
        stmt(c.env.DB, `UPDATE items SET status = 'reserved', contract_id = ?, held_by_session = NULL, updated_at = ?
                        WHERE id = ? AND status IN ('watching','available')`, contract.id, nowIso(), item.id),
        auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action: 'reserve', before: { status: item.status }, after: { status: 'reserved' } }),
      )
    }
  }

  await c.env.DB.batch(statements)
  return c.json({ folio: contract.folio, status: 'active', schedule })
})

// ────────────────────────────────────────────────────────────── cierre ──
const LOST_REASONS = ['precio', 'no le gustaron los modelos', 'quiere pensarlo', 'va a comparar', 'no hay su talla', 'otro']

app.post('/:id{[0-9]+}/close', async (c) => {
  const s = c.get('session')
  const row = await loadSession(c.env.DB, s.store, Number(c.req.param('id')))
  assertOpen(row)
  const body = await readJson<{ outcome?: string; reason?: string; note?: string; sheets_disposed?: boolean; pin?: string }>(c)

  await assertOwnPin(c.env.DB, s, String(body.pin ?? ''))

  const outcome = body.outcome
  if (outcome !== 'won' && outcome !== 'lost') throw badRequest('Elige cómo terminó: se vendió o no se vendió.')
  const reason = String(body.reason ?? '').trim()
  if (!reason) throw badRequest(outcome === 'won' ? 'Escribe cómo estuvo la venta.' : 'Elige el motivo.')
  if (outcome === 'lost' && !LOST_REASONS.includes(reason)) throw badRequest('Ese motivo no está en la lista.')

  const contract = row.contract_id
    ? await one<ContractRow>(c.env.DB, `SELECT * FROM contracts WHERE id = ?`, row.contract_id)
    : null
  const printedSheet = await one<{ n: number }>(
    c.env.DB, `SELECT COUNT(*) AS n FROM session_events WHERE session_id = ? AND stage = 'sheet_printed'`, row.id,
  )
  const contractSigned = contract !== null && contract.status !== 'draft' && contract.status !== 'void'

  // Si se imprimieron hojas y no se firmó contrato, hay que destruirlas.
  const needsDisposal = (printedSheet?.n ?? 0) > 0 && !contractSigned
  if (needsDisposal && body.sheets_disposed !== true) {
    throw conflict('Confirma que destruiste las hojas de medidas firmadas de esta sesión.')
  }

  const now = nowIso()
  const statements: D1PreparedStatement[] = [
    // `closed_at_stage` guarda hasta dónde llegó: 'stage' se sobreescribe con
    // 'closed' y sin esto no se distingue la que se fue viendo el catálogo de
    // la que se fue después de dar sus datos.
    stmt(c.env.DB,
      `UPDATE kiosk_sessions SET stage = 'closed', closed_at_stage = ?, closed_at = ?, outcome = ?, reason = ?, note = ?, sheets_disposed = ? WHERE id = ?`,
      row.stage, now, outcome, reason, String(body.note ?? '').trim() || null, needsDisposal ? 1 : null, row.id),
    stmt(c.env.DB, `INSERT INTO session_events (session_id, stage, detail) VALUES (?, 'closed', ?)`, row.id, `${outcome}: ${reason} · murió en «${row.stage}»`),
    // Se sueltan los apartados, que son estado vivo del inventario. Los
    // favoritos NO se borran: son la señal de demanda de la semana y el único
    // registro de qué vino a buscar una clienta que no compró.
    stmt(c.env.DB, `UPDATE items SET status = 'available', held_by_session = NULL, updated_at = ?
                    WHERE held_by_session = ? AND status = 'watching'`, now, row.id),
    auditStmt(c.env.DB, { session: s, entity: 'kiosk_session', entityId: row.id, action: 'close', after: { outcome, reason } }),
  ]

  if (contract && contract.status === 'draft') {
    // El folio jamás se reutiliza. Se conserva el nombre y el teléfono de la
    // novia en el registro cancelado; de las sesiones que nunca llegaron a
    // capturar datos no queda nada que conservar.
    const dead = contract.customer_id ? 'cancelled' : 'void'
    statements.push(
      stmt(c.env.DB, `UPDATE contracts SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?`, dead, now, now, contract.id),
      auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: contract.id, action: dead, before: { status: 'draft' }, after: { status: dead, folio: contract.folio } }),
    )
  }

  await c.env.DB.batch(statements)
  return c.json({ ok: true, outcome, sheets_disposed: needsDisposal })
})

export default app
