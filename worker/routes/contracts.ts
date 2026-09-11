import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv } from '../lib/env'
import { all, one, run, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound } from '../lib/errors'
import { requireOwner } from '../lib/auth'
import { buildLedger, suggestedLateFee, type InstallmentRow, type PaymentRow } from '../lib/payments'
import { hotelCharge } from '../lib/items'
import { nowIso, todayISO } from '../lib/dates'
import { renderTemplate } from '../lib/template'

const app = new Hono<AppEnv>()

export interface ContractFull {
  id: number
  folio: string
  store_id: string
  customer_id: number | null
  seller_id: number
  session_id: number | null
  signed_at: string | null
  plan_id: number | null
  plan_name: string | null
  list_total_cents: number
  discount_cents: number
  total_cents: number
  status: string
  printed_at: string | null
  notes: string | null
}

export async function loadContract(db: D1Database, store: string, folio: string): Promise<ContractFull> {
  const contract = await one<ContractFull>(db, `SELECT * FROM contracts WHERE folio = ? AND store_id = ?`, folio, store)
  if (!contract) throw notFound('No se encontró ese folio en esta sucursal.')
  return contract
}

export async function contractDetail(db: D1Database, store: string, contract: ContractFull) {
  const customer = contract.customer_id
    ? await one<{ id: number; name: string; apellido: string; phone: string; wedding_date: string | null }>(
        db, `SELECT id, name, apellido, phone, wedding_date FROM customers WHERE id = ?`, contract.customer_id)
    : null
  const lines = await all<{ id: number; item_id: number | null; description: string; price_cents: number; line_kind: string }>(
    db, `SELECT id, item_id, description, price_cents, line_kind FROM contract_items WHERE contract_id = ? ORDER BY sort, id`, contract.id)
  const installments = await all<InstallmentRow>(
    db, `SELECT id, seq, due_type, due_date, amount_cents FROM installments WHERE contract_id = ? ORDER BY seq`, contract.id)
  const payments = await all<PaymentRow & { method: string; receipt_folio: string | null; collected_by: number; void_reason: string | null }>(
    db, `SELECT id, paid_at, amount_cents, installment_id, voided_at, method, receipt_folio, collected_by, void_reason
         FROM payments WHERE contract_id = ? ORDER BY paid_at, id`, contract.id)
  const documents = await all<{ id: string; kind: string; created_at: string }>(
    db, `SELECT id, kind, created_at FROM files WHERE contract_id = ? ORDER BY created_at`, contract.id)
  // Por el renglón del contrato, no por items.contract_id: ese sólo se sella al
  // firmar, y la hoja de medidas se imprime antes. Si no, el modelo y el color
  // salían en blanco justo en la hoja que los necesita.
  const item = await one<{ id: number; code: string; name: string; color: string | null; status: string; ready_notified_at: string | null; price_cents: number }>(
    db,
    `SELECT i.id, i.code, i.name, i.color, i.status, i.ready_notified_at, i.price_cents
     FROM contract_items ci JOIN items i ON i.id = ci.item_id
     WHERE ci.contract_id = ? AND ci.line_kind = 'dress'
     LIMIT 1`,
    contract.id)
  const seller = await one<{ name: string }>(db, `SELECT name FROM users WHERE id = ?`, contract.seller_id)
  const storeRow = await one<{ name: string; address: string; hotel_daily_cents: number; hotel_free_days: number; late_fee_pct: number }>(
    db, `SELECT name, address, hotel_daily_cents, hotel_free_days, late_fee_pct FROM stores WHERE id = ?`, store)

  const today = todayISO()
  const ledger = buildLedger(contract.total_cents, installments, payments, today)
  const hotel = hotelCharge(item?.ready_notified_at ?? null, today, storeRow?.hotel_free_days ?? 0, storeRow?.hotel_daily_cents ?? 0)
  const late_fee = suggestedLateFee(ledger, {
    dressPriceCents: lines.find((l) => l.line_kind === 'dress')?.price_cents ?? 0,
    discountCents: contract.discount_cents,
    lateFeePct: storeRow?.late_fee_pct ?? 0,
    today,
  })

  return { contract, customer, lines, installments, payments, documents, item, ledger, hotel, late_fee, store: storeRow, seller }
}

app.get('/:folio', async (c) => {
  const s = c.get('session')
  const contract = await loadContract(c.env.DB, s.store, c.req.param('folio'))
  return c.json(await contractDetail(c.env.DB, s.store, contract))
})

/** Datos ya armados para las dos hojas: medidas y contrato. */
app.get('/:folio/print', async (c) => {
  const s = c.get('session')
  const contract = await loadContract(c.env.DB, s.store, c.req.param('folio'))
  const detail = await contractDetail(c.env.DB, s.store, contract)
  const template = await one<{ contract_template: string }>(c.env.DB, `SELECT contract_template FROM stores WHERE id = ?`, s.store)

  const schedule = detail.installments.map((i) => ({
    seq: i.seq, due_type: i.due_type, due_date: i.due_date, amount_cents: i.amount_cents,
  }))
  const body = renderTemplate(template?.contract_template ?? '', {
    bride_name: detail.customer?.name ?? '',
    apellido: detail.customer?.apellido ?? '',
    phone: detail.customer?.phone ?? '',
    wedding_date: detail.customer?.wedding_date ?? null,
    dress: detail.item?.name ?? detail.lines.find((l) => l.line_kind === 'dress')?.description ?? '',
    code: detail.item?.code ?? '',
    color: detail.item?.color ?? '',
    total_cents: contract.total_cents,
    anticipo_cents: schedule[0]?.amount_cents ?? 0,
    plan_name: contract.plan_name ?? '',
    schedule,
    accessories: detail.lines.filter((l) => l.line_kind === 'accessory'),
    store: detail.store?.name ?? '',
    address: detail.store?.address ?? '',
    folio: contract.folio,
    date: (contract.signed_at ?? nowIso()).slice(0, 10),
  })
  return c.json({ ...detail, contract_body: body })
})

/**
 * Más adelante la misma hoja física se firma dos veces más: el bloque de
 * ajustes y el de entrega. Son fotos adicionales contra el mismo contrato,
 * tomadas desde la vista del contrato, no desde la sesión.
 */
app.post('/:folio/documents', async (c) => {
  const s = c.get('session')
  const contract = await loadContract(c.env.DB, s.store, c.req.param('folio'))
  const body = await readJson<{ file_id?: string; kind?: string }>(c)
  const kind = body.kind
  if (kind !== 'adjustments' && kind !== 'delivery' && kind !== 'receipt') {
    throw badRequest('Ese tipo de documento no se agrega desde aquí.')
  }
  const file = await one<{ id: string }>(c.env.DB, `SELECT id FROM files WHERE id = ? AND store_id = ?`, String(body.file_id), s.store)
  if (!file) throw notFound('No se encontró esa foto.')
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE files SET contract_id = ?, kind = ? WHERE id = ?`, contract.id, kind, file.id),
    auditStmt(c.env.DB, { session: s, entity: 'file', entityId: file.id, action: 'attach', after: { contract: contract.folio, kind } }),
  ])
  return c.json({ ok: true })
})

/**
 * Traspaso: el saldo pagado se mueve a otro contrato. Se niega en cuanto el
 * vestido entró a costura. (La pantalla queda para el siguiente paso; aquí vive
 * la regla.)
 */
app.post('/:folio/transfer', requireOwner, async (c) => {
  const s = c.get('session')
  const contract = await loadContract(c.env.DB, s.store, c.req.param('folio'))
  const body = await readJson<{ to_folio?: string; expires_at?: string | null }>(c)

  const item = await one<{ id: number; status: string; tailoring_started_at: string | null }>(
    c.env.DB, `SELECT id, status, tailoring_started_at FROM items WHERE contract_id = ?`, contract.id)
  if (item && (item.tailoring_started_at !== null || ['tailoring', 'tailored', 'ready', 'sold'].includes(item.status))) {
    throw conflict('Ya no se puede traspasar: el vestido entró a costura.')
  }

  const detail = await contractDetail(c.env.DB, s.store, contract)
  if (detail.ledger.paid_cents <= 0) throw conflict('Ese contrato no tiene pagos que traspasar.')

  const target = body.to_folio ? await loadContract(c.env.DB, s.store, body.to_folio) : null
  const now = nowIso()
  const created = await run(
    c.env.DB,
    `INSERT INTO credits (store_id, from_contract_id, to_contract_id, amount_cents, expires_at, status)
     VALUES (?,?,?,?,?,?)`,
    s.store, contract.id, target?.id ?? null, detail.ledger.paid_cents, body.expires_at ?? null, target ? 'applied' : 'open',
  )
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE contracts SET status = 'transferred', closed_at = ?, updated_at = ? WHERE id = ?`, now, now, contract.id),
    ...(item ? [stmt(c.env.DB, `UPDATE items SET status = 'available', contract_id = NULL, updated_at = ? WHERE id = ?`, now, item.id)] : []),
    ...(target ? [stmt(c.env.DB, `UPDATE contracts SET credit_applied_cents = credit_applied_cents + ?, updated_at = ? WHERE id = ?`, detail.ledger.paid_cents, now, target.id)] : []),
    auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: contract.id, action: 'transfer', after: { credit_id: created.meta.last_row_id, to: target?.folio ?? null } }),
  ])
  return c.json({ credit_id: Number(created.meta.last_row_id), amount_cents: detail.ledger.paid_cents })
})

export default app
