import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { all } from '../lib/db'
import { digitsOnly } from '../lib/db'

const app = new Hono<AppEnv>()

/**
 * Una sola caja: nombre, apellido, dígitos del teléfono, folio, código del
 * artículo y modelo. Sin nada escrito no busca «nada»: lista las clientas más
 * recientes, porque son pocas y una tabla que se puede hojear sirve más que
 * una caja vacía esperando a que alguien sepa qué teclear.
 */
app.get('/', async (c) => {
  const s = c.get('session')
  const q = (c.req.query('q') ?? '').trim()
  const filtering = q.length >= 2
  const like = `%${q}%`
  const digits = digitsOnly(q)

  const where = filtering
    ? `AND (c.folio LIKE ?
            OR cu.name LIKE ? OR cu.apellido LIKE ?
            OR (? <> '' AND cu.phone_digits LIKE ?)
            OR i.code LIKE ? OR i.name LIKE ?)`
    : ''
  const args: (string | number)[] = filtering
    ? [s.store, like, like, like, digits, `%${digits}%`, like, like]
    : [s.store]

  const rows = await all<{
    folio: string; status: string; total_cents: number; paid_cents: number
    name: string | null; apellido: string | null; phone: string | null
    code: string | null; item_name: string | null; signed_at: string | null
  }>(
    c.env.DB,
    `SELECT c.folio, c.status, c.total_cents, c.signed_at,
            IFNULL((SELECT SUM(p.amount_cents) FROM payments p
                    WHERE p.contract_id = c.id AND p.voided_at IS NULL), 0) AS paid_cents,
            cu.name, cu.apellido, cu.phone,
            i.code, i.name AS item_name
     FROM contracts c
     LEFT JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN items i ON i.contract_id = c.id
     WHERE c.store_id = ? ${where}
     ORDER BY c.created_at DESC
     LIMIT ${filtering ? 40 : 200}`,
    ...args,
  )
  return c.json({ results: rows.map((r) => ({ ...r, balance_cents: r.total_cents - r.paid_cents })) })
})

export default app
