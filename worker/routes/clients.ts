import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { all, digitsOnly, one } from '../lib/db'
import { notFound } from '../lib/errors'
import { csvResponse, toCsv } from '../lib/csv'
import { contractDetail, type ContractFull } from './contracts'

const app = new Hono<AppEnv>()

/**
 * Cada `customers` row nace de una sola sesión (`POST /sessions/:id/bride`),
 * así que hoy es 1∶1 con la sesión que la capturó y 0∶1 con el contrato que
 * esa misma sesión haya abierto — una clienta no tiene todavía varias visitas
 * fusionadas en un solo renglón (eso queda para más adelante, ver
 * docs/NEXT.md). Por eso este LEFT JOIN no duplica renglones.
 */
interface ClientRow {
  customer_id: number
  name: string
  apellido: string
  phone: string
  registrada: string
  wedding_date: string | null
  session_id: number | null
  session_stage: string | null
  outcome: string | null
  closed_at: string | null
  folio: string | null
  contract_status: string | null
  total_cents: number | null
  paid_cents: number
}

app.get('/', async (c) => {
  const s = c.get('session')
  const q = (c.req.query('q') ?? '').trim()
  const filtering = q.length >= 2
  const like = `%${q}%`
  const digits = digitsOnly(q)

  const where = filtering
    ? `AND (cu.name LIKE ? OR cu.apellido LIKE ? OR c.folio LIKE ? OR (? <> '' AND cu.phone_digits LIKE ?))`
    : ''
  const args: (string | number)[] = filtering ? [like, like, like, digits, `%${digits}%`] : []

  const rows = await all<ClientRow>(
    c.env.DB,
    `SELECT cu.id AS customer_id, cu.name, cu.apellido, cu.phone, cu.created_at AS registrada, cu.wedding_date,
            k.id AS session_id, k.stage AS session_stage, k.outcome, k.closed_at,
            c.folio, c.status AS contract_status, c.total_cents,
            IFNULL((SELECT SUM(p.amount_cents) FROM payments p WHERE p.contract_id = c.id AND p.voided_at IS NULL), 0) AS paid_cents
       FROM customers cu
       LEFT JOIN kiosk_sessions k ON k.customer_id = cu.id
       LEFT JOIN contracts c ON c.customer_id = cu.id AND c.status <> 'void'
      WHERE cu.store_id = ? ${where}
      ORDER BY cu.created_at DESC
      LIMIT ${filtering ? 60 : 300}`,
    s.store, ...args,
  )
  return c.json({
    results: rows.map((r) => ({ ...r, total_cents: r.total_cents ?? 0, balance_cents: (r.total_cents ?? 0) - r.paid_cents })),
  })
})

/** El mismo renglón que arriba, todo, sin el límite de 300 ni el buscador. */
app.get('/export', async (c) => {
  const s = c.get('session')
  const rows = await all<ClientRow>(
    c.env.DB,
    `SELECT cu.id AS customer_id, cu.name, cu.apellido, cu.phone, cu.created_at AS registrada, cu.wedding_date,
            k.id AS session_id, k.stage AS session_stage, k.outcome, k.closed_at,
            c.folio, c.status AS contract_status, c.total_cents,
            IFNULL((SELECT SUM(p.amount_cents) FROM payments p WHERE p.contract_id = c.id AND p.voided_at IS NULL), 0) AS paid_cents
       FROM customers cu
       LEFT JOIN kiosk_sessions k ON k.customer_id = cu.id
       LEFT JOIN contracts c ON c.customer_id = cu.id AND c.status <> 'void'
      WHERE cu.store_id = ?
      ORDER BY cu.created_at DESC`,
    s.store,
  )
  const withBalance = rows.map((r) => ({ ...r, total_cents: r.total_cents ?? 0, balance_cents: (r.total_cents ?? 0) - r.paid_cents }))
  const columns = [
    'customer_id', 'name', 'apellido', 'phone', 'registrada', 'wedding_date',
    'folio', 'contract_status', 'session_stage', 'outcome', 'total_cents', 'paid_cents', 'balance_cents',
  ]
  return csvResponse('clientes.csv', toCsv(columns, withBalance))
})

/**
 * La ficha de una clienta: su sesión (con favoritos y por qué terminó como
 * terminó) y, si la hubo, su compra. Reusa `contractDetail` de contracts.ts:
 * es exactamente lo que la ficha de un contrato ya muestra.
 */
app.get('/:id{[0-9]+}', async (c) => {
  const s = c.get('session')
  const id = Number(c.req.param('id'))
  const customer = await one<{ id: number; name: string; apellido: string; phone: string; wedding_date: string | null; created_at: string }>(
    c.env.DB, `SELECT id, name, apellido, phone, wedding_date, created_at FROM customers WHERE id = ? AND store_id = ?`, id, s.store,
  )
  if (!customer) throw notFound('No se encontró esa clienta en esta sucursal.')

  const session = await one<{
    id: number; stage: string; opened_at: string; closed_at: string | null; closed_at_stage: string | null
    outcome: string | null; reason: string | null; note: string | null; contract_id: number | null
  }>(c.env.DB, `SELECT id, stage, opened_at, closed_at, closed_at_stage, outcome, reason, note, contract_id FROM kiosk_sessions WHERE customer_id = ? AND store_id = ?`, id, s.store)

  const favorites = session
    ? (await all<{ item_id: number }>(c.env.DB, `SELECT item_id FROM session_favorites WHERE session_id = ?`, session.id)).map((f) => f.item_id)
    : []
  const favoriteItems = favorites.length
    ? await all<{ id: number; code: string; name: string; kind: string; price_cents: number }>(
        c.env.DB,
        `SELECT id, code, name, kind, price_cents FROM items WHERE id IN (${favorites.map(() => '?').join(',')})`,
        ...favorites,
      )
    : []

  const contractRow = session?.contract_id
    ? await one<ContractFull>(c.env.DB, `SELECT * FROM contracts WHERE id = ?`, session.contract_id)
    : null
  const contract = contractRow && contractRow.status !== 'void' ? await contractDetail(c.env.DB, s.store, contractRow) : null

  return c.json({ customer, session, favorite_items: favoriteItems, contract })
})

export default app
