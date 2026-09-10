import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv } from '../lib/env'
import { all, one, run } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, notFound } from '../lib/errors'
import { isDate, todayISO } from '../lib/dates'

const app = new Hono<AppEnv>()

app.get('/categories', async (c) => {
  const s = c.get('session')
  const rows = await all<{ id: number; name: string }>(
    c.env.DB, `SELECT id, name FROM expense_categories WHERE store_id = ? AND active = 1 ORDER BY sort, name`, s.store)
  return c.json({ categories: rows })
})

/** La lista de hoy con su total corriendo. */
app.get('/', async (c) => {
  const s = c.get('session')
  const day = c.req.query('date') ?? todayISO()
  if (!isDate(day)) throw badRequest('Esa fecha no es válida.')
  const rows = await all<{ id: number; spent_at: string; category: string; amount_cents: number; vendor: string | null; note: string | null; file_id: string | null }>(
    c.env.DB,
    `SELECT id, spent_at, category, amount_cents, vendor, note, file_id
     FROM expenses WHERE store_id = ? AND spent_at = ? ORDER BY id DESC`,
    s.store, day)
  return c.json({ date: day, expenses: rows, total_cents: rows.reduce((sum, r) => sum + r.amount_cents, 0) })
})

app.post('/', async (c) => {
  const s = c.get('session')
  const body = await readJson<{ amount_cents?: number; spent_at?: string; category?: string; vendor?: string; note?: string; file_id?: string }>(c)

  const amount = Math.trunc(Number(body.amount_cents ?? 0))
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('El monto del gasto debe ser mayor a cero.')
  const spentAt = String(body.spent_at ?? todayISO())
  if (!isDate(spentAt)) throw badRequest('La fecha del gasto no es válida.')
  const category = String(body.category ?? '').trim()
  if (!category) throw badRequest('Elige la categoría del gasto.')

  let fileId: string | null = null
  if (body.file_id) {
    const file = await one<{ id: string }>(c.env.DB, `SELECT id FROM files WHERE id = ? AND store_id = ?`, body.file_id, s.store)
    if (!file) throw notFound('No se encontró la foto del comprobante.')
    fileId = file.id
  }

  const result = await run(
    c.env.DB,
    `INSERT INTO expenses (store_id, spent_at, category, amount_cents, vendor, note, file_id, created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    s.store, spentAt, category, amount, String(body.vendor ?? '').trim() || null, String(body.note ?? '').trim() || null, fileId, s.userId)
  const id = Number(result.meta.last_row_id)
  await auditStmt(c.env.DB, { session: s, entity: 'expense', entityId: id, action: 'create', after: { amount_cents: amount, category } }).run()
  return c.json({ id }, 201)
})

export default app
