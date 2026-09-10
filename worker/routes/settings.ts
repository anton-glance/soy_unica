import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv } from '../lib/env'
import { all, one, run, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound } from '../lib/errors'
import { requireOwner } from '../lib/auth'
import { hashPin, randomSalt } from '../lib/crypto'
import { nowIso } from '../lib/dates'
import { renderTemplate } from '../lib/template'

const app = new Hono<AppEnv>()
app.use('*', requireOwner)

/** Pisos de retención de §8. Nunca se puede guardar por debajo. */
export const RETENTION_FLOORS = {
  retention_sold_photos_months: 0,
  retention_client_docs_months: 24,
  retention_expense_photos_months: 12,
} as const

app.get('/', async (c) => {
  const s = c.get('session')
  const store = await one(c.env.DB, `SELECT * FROM stores WHERE id = ?`, s.store)
  const users = await all(c.env.DB, `SELECT id, name, role, active FROM users WHERE store_id = ? ORDER BY role, name`, s.store)
  const plans = await all(c.env.DB, `SELECT * FROM plans WHERE store_id = ? ORDER BY sort, id`, s.store)
  const surcharges = await all(c.env.DB, `SELECT * FROM surcharges WHERE store_id = ? ORDER BY sort, id`, s.store)
  const commissions = await all(c.env.DB, `SELECT * FROM commission_rules WHERE store_id = ? ORDER BY priority, id`, s.store)
  const categories = await all(c.env.DB, `SELECT * FROM expense_categories WHERE store_id = ? ORDER BY sort, name`, s.store)
  return c.json({ store, users, plans, surcharges, commissions, categories, retention_floors: RETENTION_FLOORS })
})

const NUMERIC = [
  'min_days_before_wedding', 'hotel_daily_cents', 'hotel_free_days', 'late_fee_pct',
  'retention_sold_photos_months', 'retention_client_docs_months', 'retention_expense_photos_months',
] as const
const TEXT = ['name', 'address', 'phone', 'report_email', 'contract_template', 'archive_target'] as const

app.patch('/store', async (c) => {
  const s = c.get('session')
  const before = await one<Record<string, unknown>>(c.env.DB, `SELECT * FROM stores WHERE id = ?`, s.store)
  const body = await readJson<Record<string, unknown>>(c)

  const sets: string[] = []
  const args: (string | number)[] = []
  for (const field of NUMERIC) {
    if (body[field] === undefined) continue
    const value = Number(body[field])
    if (!Number.isFinite(value) || value < 0) throw badRequest(`El valor de «${field}» no es válido.`)
    const floor = RETENTION_FLOORS[field as keyof typeof RETENTION_FLOORS]
    if (floor !== undefined && value < floor) {
      throw conflict(`Ese periodo no puede bajar de ${floor} meses. Estas fotos son la única prueba de la tienda en una aclaración.`)
    }
    sets.push(`${field} = ?`); args.push(field === 'late_fee_pct' ? value : Math.trunc(value))
  }
  for (const field of TEXT) {
    if (body[field] === undefined) continue
    if (field === 'archive_target' && !['none', 'gdrive'].includes(String(body[field]))) {
      throw badRequest('El destino de archivo no es válido.')
    }
    sets.push(`${field} = ?`); args.push(String(body[field]))
  }
  for (const field of ['kiosk_show_prices', 'archive_before_delete'] as const) {
    if (body[field] === undefined) continue
    sets.push(`${field} = ?`); args.push(body[field] ? 1 : 0)
  }
  if (sets.length === 0) return c.json({ ok: true })

  sets.push('updated_at = ?'); args.push(nowIso())
  args.push(s.store)
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE stores SET ${sets.join(', ')} WHERE id = ?`, ...args),
    auditStmt(c.env.DB, { session: s, entity: 'store', entityId: s.store, action: 'update', before, after: body }),
  ])
  return c.json({ ok: true })
})

/** Vista previa en vivo de la plantilla del contrato, con datos de ejemplo. */
app.post('/template/preview', async (c) => {
  const s = c.get('session')
  const body = await readJson<{ template?: string }>(c)
  const store = await one<{ name: string; address: string }>(c.env.DB, `SELECT name, address FROM stores WHERE id = ?`, s.store)
  return c.json({
    preview: renderTemplate(String(body.template ?? ''), {
      bride_name: 'María Fernanda', apellido: 'González', phone: '81 1234 5678',
      wedding_date: '2026-11-14', dress: 'Madelyn', code: 'p139', color: 'Ivory',
      total_cents: 1850000, anticipo_cents: 925000, plan_name: 'Mitad y mitad',
      schedule: [
        { seq: 1, due_type: 'fixed', due_date: '2026-09-10', amount_cents: 925000 },
        { seq: 2, due_type: 'on_pickup', due_date: null, amount_cents: 925000 },
      ],
      accessories: [{ description: 'Mantilla larga (mantilla 039)', price_cents: 90000 }],
      store: store?.name ?? '', address: store?.address ?? '', folio: 'MTY-00042', date: '2026-09-10',
    }),
  })
})

app.patch('/users/:id{[0-9]+}/pin', async (c) => {
  const s = c.get('session')
  const id = Number(c.req.param('id'))
  const body = await readJson<{ pin?: string }>(c)
  const pin = String(body.pin ?? '')
  if (!/^\d{4,6}$/.test(pin)) throw badRequest('El NIP son de 4 a 6 dígitos.')

  const user = await one<{ id: number; name: string }>(c.env.DB, `SELECT id, name FROM users WHERE id = ? AND store_id = ?`, id, s.store)
  if (!user) throw notFound('Esa persona no está registrada en esta sucursal.')

  const salt = randomSalt()
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ?`, await hashPin(pin, salt), salt, nowIso(), user.id),
    // Nunca se registra el NIP, ni el nuevo ni el viejo.
    auditStmt(c.env.DB, { session: s, entity: 'user', entityId: user.id, action: 'pin_change', after: { name: user.name } }),
  ])
  return c.json({ ok: true })
})

/** Alta y baja de renglones de configuración, todo auditado. */
function crud(resource: 'plans' | 'surcharges' | 'commission_rules' | 'expense_categories', columns: readonly string[]) {
  app.post(`/${resource}`, async (c) => {
    const s = c.get('session')
    const body = await readJson<Record<string, unknown>>(c)
    const provided = columns.filter((col) => body[col] !== undefined)
    if (provided.length === 0) throw badRequest('No llegó ningún dato.')
    const result = await run(
      c.env.DB,
      `INSERT INTO ${resource} (store_id, ${provided.join(', ')}) VALUES (?, ${provided.map(() => '?').join(', ')})`,
      s.store, ...provided.map((col) => body[col] as string | number),
    )
    const id = Number(result.meta.last_row_id)
    await auditStmt(c.env.DB, { session: s, entity: resource, entityId: id, action: 'create', after: body }).run()
    return c.json({ id }, 201)
  })

  app.patch(`/${resource}/:id{[0-9]+}`, async (c) => {
    const s = c.get('session')
    const id = Number(c.req.param('id'))
    const before = await one<Record<string, unknown>>(c.env.DB, `SELECT * FROM ${resource} WHERE id = ? AND store_id = ?`, id, s.store)
    if (!before) throw notFound('Ese registro no existe en esta sucursal.')
    const body = await readJson<Record<string, unknown>>(c)
    const provided = columns.filter((col) => body[col] !== undefined)
    if (provided.length === 0) return c.json({ ok: true })
    await c.env.DB.batch([
      stmt(c.env.DB, `UPDATE ${resource} SET ${provided.map((col) => `${col} = ?`).join(', ')} WHERE id = ? AND store_id = ?`,
        ...provided.map((col) => body[col] as string | number), id, s.store),
      auditStmt(c.env.DB, { session: s, entity: resource, entityId: id, action: 'update', before, after: body }),
    ])
    return c.json({ ok: true })
  })
}

crud('plans', ['name', 'splits', 'min_price_cents', 'max_price_cents', 'max_months', 'discount_pct', 'active', 'sort'])
crud('surcharges', ['name', 'kind', 'applies_to', 'amount_cents', 'pct', 'active', 'sort'])
crud('commission_rules', ['priority', 'min_price_cents', 'max_price_cents', 'sold_at_or_above_list', 'rate_pct', 'basis', 'period', 'active'])
crud('expense_categories', ['name', 'sort', 'active'])

export default app
