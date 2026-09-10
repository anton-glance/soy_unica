import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv } from '../lib/env'
import { all, one, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound } from '../lib/errors'
import { requireOwner } from '../lib/auth'
import { isDate, nowIso, todayISO } from '../lib/dates'
import { balanceOf, buildLedger, type InstallmentRow, type PaymentRow } from '../lib/payments'
import { loadContract, contractDetail } from './contracts'
import { refreshReadiness } from './items'

const app = new Hono<AppEnv>()

/**
 * Un pago no se puede escribir sin al menos un archivo adjunto. El pago, sus
 * archivos y el recálculo del saldo van en un solo batch de D1.
 */
app.post('/', async (c) => {
  const s = c.get('session')
  const body = await readJson<{
    folio?: string; amount_cents?: number; paid_at?: string; method?: string
    receipt_folio?: string; installment_id?: number | null; file_ids?: string[]
  }>(c)

  const contract = await loadContract(c.env.DB, s.store, String(body.folio ?? ''))
  if (!['active', 'paid', 'delivered'].includes(contract.status)) {
    throw conflict('Ese contrato no está vigente. No se le pueden registrar abonos.')
  }

  const amount = Math.trunc(Number(body.amount_cents ?? 0))
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('El monto del abono debe ser mayor a cero.')
  const paidAt = String(body.paid_at ?? todayISO())
  if (!isDate(paidAt)) throw badRequest('La fecha del abono no es válida.')
  const method = body.method === 'transfer' ? 'transfer' : body.method === 'cash' ? 'cash' : null
  if (!method) throw badRequest('Elige si fue efectivo o transferencia.')

  const fileIds = (body.file_ids ?? []).filter((id) => typeof id === 'string' && id.length > 0)
  if (fileIds.length === 0) {
    throw conflict('Un abono no se puede registrar sin el comprobante. Toma la foto antes de guardar.')
  }
  const files = await all<{ id: string }>(
    c.env.DB,
    `SELECT id FROM files WHERE store_id = ? AND id IN (${fileIds.map(() => '?').join(',')})`,
    s.store, ...fileIds,
  )
  if (files.length !== fileIds.length) throw notFound('Alguna de las fotos ya no existe. Vuelve a tomarla.')

  let installmentId: number | null = null
  if (body.installment_id) {
    const target = await one<{ id: number }>(
      c.env.DB, `SELECT id FROM installments WHERE id = ? AND contract_id = ?`, Number(body.installment_id), contract.id)
    if (!target) throw badRequest('Esa parcialidad no pertenece a este contrato.')
    installmentId = target.id
  }

  // Insertar, adjuntar y recalcular en un solo batch: nunca queda un pago sin
  // comprobante ni un saldo a medias.
  const inserted = await c.env.DB.batch<{ id: number }>([
    stmt(c.env.DB,
      `INSERT INTO payments (contract_id, store_id, paid_at, amount_cents, method, receipt_folio, collected_by, installment_id)
       VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
      contract.id, s.store, paidAt, amount, method, String(body.receipt_folio ?? '').trim() || null, s.userId, installmentId),
  ])
  const paymentId = Number(inserted[0]?.results?.[0]?.id)
  if (!paymentId) throw conflict('No se pudo registrar el abono. Vuelve a intentar.')

  await c.env.DB.batch([
    ...fileIds.map((id) => stmt(c.env.DB, `INSERT INTO payment_files (payment_id, file_id) VALUES (?,?)`, paymentId, id)),
    ...fileIds.map((id) => stmt(c.env.DB, `UPDATE files SET contract_id = ?, kind = 'receipt' WHERE id = ?`, contract.id, id)),
    auditStmt(c.env.DB, { session: s, entity: 'payment', entityId: paymentId, action: 'create', after: { folio: contract.folio, amount_cents: amount, method } }),
  ])

  const ledger = await recalculate(c.env.DB, contract.id, s.store)

  // El primer abono de la sesión mueve la etapa a `payment`.
  if (contract.session_id) {
    await stmt(c.env.DB,
      `UPDATE kiosk_sessions SET stage = 'payment' WHERE id = ? AND stage = 'signed' AND closed_at IS NULL`,
      contract.session_id).run()
  }

  return c.json({ payment_id: paymentId, ledger }, 201)
})

/**
 * Los pagos sólo se agregan. Una corrección es una cancelación de la dueña con
 * motivo más un pago nuevo; el renglón cancelado se queda a la vista.
 */
app.post('/:id{[0-9]+}/void', requireOwner, async (c) => {
  const s = c.get('session')
  const id = Number(c.req.param('id'))
  const body = await readJson<{ reason?: string }>(c)
  const reason = String(body.reason ?? '').trim()
  if (!reason) throw badRequest('Escribe el motivo de la cancelación.')

  const payment = await one<{ id: number; contract_id: number; voided_at: string | null; amount_cents: number }>(
    c.env.DB, `SELECT id, contract_id, voided_at, amount_cents FROM payments WHERE id = ? AND store_id = ?`, id, s.store)
  if (!payment) throw notFound('No se encontró ese abono.')
  if (payment.voided_at) throw conflict('Ese abono ya estaba cancelado.')

  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?`, nowIso(), s.userId, reason, payment.id),
    auditStmt(c.env.DB, { session: s, entity: 'payment', entityId: payment.id, action: 'void', before: { amount_cents: payment.amount_cents }, after: { reason } }),
  ])
  const ledger = await recalculate(c.env.DB, payment.contract_id, s.store)
  return c.json({ ok: true, ledger })
})

/**
 * El saldo es siempre `total − suma de pagos no cancelados`. De ahí se derivan
 * el estado del contrato y si el vestido está listo.
 */
async function recalculate(db: D1Database, contractId: number, store: string) {
  const contract = await one<{ id: number; total_cents: number; status: string }>(
    db, `SELECT id, total_cents, status FROM contracts WHERE id = ?`, contractId)
  if (!contract) throw notFound('No se encontró el contrato.')

  const installments = await all<InstallmentRow>(
    db, `SELECT id, seq, due_type, due_date, amount_cents FROM installments WHERE contract_id = ? ORDER BY seq`, contractId)
  const payments = await all<PaymentRow>(
    db, `SELECT id, paid_at, amount_cents, installment_id, voided_at FROM payments WHERE contract_id = ?`, contractId)

  const ledger = buildLedger(contract.total_cents, installments, payments, todayISO())
  const balance = balanceOf(contract.total_cents, payments)

  if (contract.status === 'active' && balance <= 0) {
    await stmt(db, `UPDATE contracts SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'active'`, nowIso(), contractId).run()
  } else if (contract.status === 'paid' && balance > 0) {
    await stmt(db, `UPDATE contracts SET status = 'active', updated_at = ? WHERE id = ? AND status = 'paid'`, nowIso(), contractId).run()
  }

  const item = await one<{ id: number }>(db, `SELECT id FROM items WHERE contract_id = ?`, contractId)
  if (item) await refreshReadiness(db, item.id)
  void store
  return ledger
}

/** Lo que hace falta para el formulario: la parcialidad que toca y su monto. */
app.get('/next/:folio', async (c) => {
  const s = c.get('session')
  const contract = await loadContract(c.env.DB, s.store, c.req.param('folio'))
  const detail = await contractDetail(c.env.DB, s.store, contract)
  return c.json({
    folio: contract.folio,
    next_due: detail.ledger.next_due,
    balance_cents: detail.ledger.balance_cents,
    suggested_amount_cents: detail.ledger.next_due?.remaining_cents ?? 0,
    today: todayISO(),
  })
})

export default app
