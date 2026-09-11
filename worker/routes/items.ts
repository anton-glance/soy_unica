import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv } from '../lib/env'
import { all, one, run, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound } from '../lib/errors'
import { requireOwner } from '../lib/auth'
import { canTransition, deriveStatus, type ItemAction, type ItemStatus } from '../lib/items'
import { balanceOf } from '../lib/payments'
import { nowIso, todayISO } from '../lib/dates'

const app = new Hono<AppEnv>()

export interface ItemRow {
  id: number
  store_id: string
  code: string
  kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'
  condition: string
  name: string
  brand: string | null
  size: string | null
  cut: string | null
  color: string | null
  cost_cents: number
  price_cents: number
  status: ItemStatus
  location: string | null
  notes: string | null
  intake_date: string | null
  held_by_session: number | null
  contract_id: number | null
  tailoring_started_at: string | null
  tailoring_done_at: string | null
  ready_notified_at: string | null
  delivered_at: string | null
}

/** Las vendedoras no ven el costo ni los vestidos ya entregados. */
function forRole<T extends { cost_cents?: number }>(row: T, role: string): T {
  if (role === 'owner') return row
  const copy = { ...row }
  delete copy.cost_cents
  return copy
}

export async function loadItem(db: D1Database, store: string, id: number): Promise<ItemRow> {
  const item = await one<ItemRow>(db, `SELECT * FROM items WHERE id = ? AND store_id = ?`, id, store)
  if (!item) throw notFound('Ese artículo no está en el inventario de esta sucursal.')
  return item
}

/**
 * `ready` es derivado: costura terminada y saldo en cero. Se recalcula después
 * de cada pago, cancelación y fin de costura; nunca se pone a mano.
 */
export async function refreshReadiness(db: D1Database, itemId: number): Promise<ItemStatus> {
  const item = await one<ItemRow>(db, `SELECT * FROM items WHERE id = ?`, itemId)
  if (!item) return 'available'
  let balance = 0
  if (item.contract_id) {
    const contract = await one<{ total_cents: number }>(db, `SELECT total_cents FROM contracts WHERE id = ?`, item.contract_id)
    const payments = await all<{ id: number; paid_at: string; amount_cents: number; installment_id: number | null; voided_at: string | null }>(
      db,
      `SELECT id, paid_at, amount_cents, installment_id, voided_at FROM payments WHERE contract_id = ?`,
      item.contract_id,
    )
    balance = balanceOf(contract?.total_cents ?? 0, payments)
  }
  const next = deriveStatus(item, balance)
  if (next !== item.status) {
    await run(db, `UPDATE items SET status = ?, updated_at = ? WHERE id = ?`, next, nowIso(), itemId)
  }
  return next
}

// ─────────────────────────────────────────────────────────── consultas ──
app.get('/', async (c) => {
  const s = c.get('session')
  const q = (c.req.query('q') ?? '').trim()
  const status = c.req.query('status') ?? ''
  const kind = c.req.query('kind') ?? ''
  const acquisition = c.req.query('acquisition') ?? ''
  const condition = c.req.query('condition') ?? ''
  const sort = c.req.query('sort') ?? 'code'

  const where: string[] = ['store_id = ?']
  const args: (string | number)[] = [s.store]
  if (q) {
    // Búsqueda ancha: código, nombre, marca, corte.
    where.push('(code LIKE ?1x OR name LIKE ?1x OR IFNULL(brand,\'\') LIKE ?1x OR IFNULL(cut,\'\') LIKE ?1x)'.replace(/\?1x/g, '?'))
    const like = `%${q}%`
    args.push(like, like, like, like)
  }
  if (status) { where.push('status = ?'); args.push(status) }
  if (kind) { where.push('kind = ?'); args.push(kind) }
  if (acquisition) { where.push('acquisition = ?'); args.push(acquisition) }
  if (condition) { where.push('condition = ?'); args.push(condition) }
  if (s.role !== 'owner') where.push("status <> 'sold'")

  const columns: Record<string, string> = {
    code: 'code', name: 'name', brand: 'brand', price: 'price_cents',
    status: 'status', size: 'size', intake: 'intake_date',
  }
  const orderBy = columns[sort] ?? 'code'
  const dir = c.req.query('dir') === 'desc' ? 'DESC' : 'ASC'

  const rows = await all<ItemRow>(
    c.env.DB,
    `SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY ${orderBy} ${dir} LIMIT 500`,
    ...args,
  )
  const counts = await all<{ status: string; n: number }>(
    c.env.DB,
    `SELECT status, COUNT(*) AS n FROM items WHERE store_id = ?
     ${s.role !== 'owner' ? "AND status <> 'sold'" : ''} GROUP BY status`,
    s.store,
  )
  return c.json({ items: rows.map((r) => forRole(r, s.role)), counts })
})

/** Catálogo del kiosko: lo que ve la novia, con los apartados de otras tabletas. */
app.get('/kiosk', async (c) => {
  const s = c.get('session')
  const sessionId = Number(c.req.query('session') ?? 0)
  const rows = await all<ItemRow>(
    c.env.DB,
    `SELECT * FROM items
     WHERE store_id = ? AND status IN ('available','watching') AND kind IN ('dress','accessory')
     ORDER BY kind, code`,
    s.store,
  )
  const store = await one<{ kiosk_show_prices: number }>(c.env.DB, `SELECT kiosk_show_prices FROM stores WHERE id = ?`, s.store)
  const favorites = sessionId
    ? await all<{ item_id: number }>(c.env.DB, `SELECT item_id FROM session_favorites WHERE session_id = ?`, sessionId)
    : []
  const favoriteIds = new Set(favorites.map((f) => f.item_id))

  return c.json({
    show_prices: !!store?.kiosk_show_prices,
    items: rows.map((r) => ({
      ...forRole(r, s.role),
      // Los modelos por pedido nunca se apagan: dos novias pueden encargarlo.
      held_by_other: r.acquisition === 'unidad' && r.held_by_session !== null && r.held_by_session !== sessionId,
      held_by_me: r.held_by_session === sessionId,
      favorite: favoriteIds.has(r.id),
    })),
  })
})

app.get('/:id{[0-9]+}', async (c) => {
  const s = c.get('session')
  const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
  const photos = await all<{ id: string; sort: number; is_primary: number }>(
    c.env.DB,
    `SELECT f.id, p.sort, p.is_primary FROM item_photos p
     JOIN files f ON f.id = p.file_id WHERE p.item_id = ? ORDER BY p.sort`,
    item.id,
  )
  return c.json({ item: forRole(item, s.role), photos })
})

// ─────────────────────────────────────────────────────────────── alta ──
interface ItemInput {
  code?: string; name?: string; kind?: string; acquisition?: string; condition?: string
  brand?: string; size?: string; cut?: string; color?: string
  cost_cents?: number; price_cents?: number; location?: string; notes?: string; intake_date?: string
}

const KINDS = ['dress', 'accessory']
const ACQ = ['unidad', 'pedido']
const CONDITIONS = ['nuevo', 'muestra', 'exhibicion', 'liquidacion']

function validateItem(input: ItemInput, line?: number): Required<Pick<ItemInput, 'code' | 'name' | 'kind' | 'acquisition' | 'condition'>> {
  const at = line ? ` (renglón ${line})` : ''
  const code = String(input.code ?? '').trim()
  const name = String(input.name ?? '').trim()
  if (!code) throw badRequest(`Falta el código del artículo${at}.`)
  if (!name) throw badRequest(`Falta el nombre del artículo${at}.`)
  const kind = String(input.kind ?? 'dress')
  const acquisition = String(input.acquisition ?? 'unidad')
  const condition = String(input.condition ?? 'nuevo')
  if (!KINDS.includes(kind)) throw badRequest(`«${kind}» no es un tipo válido${at}. Usa dress o accessory.`)
  if (!ACQ.includes(acquisition)) throw badRequest(`«${acquisition}» no es una adquisición válida${at}. Usa unidad o pedido.`)
  if (!CONDITIONS.includes(condition)) throw badRequest(`«${condition}» no es una condición válida${at}.`)
  if ((input.price_cents ?? 0) < 0) throw badRequest(`El precio no puede ser negativo${at}.`)
  return { code, name, kind, acquisition, condition }
}

app.post('/', async (c) => {
  const s = c.get('session')
  const body = await readJson<ItemInput>(c)
  const base = validateItem(body)
  const existing = await one<{ id: number }>(c.env.DB, `SELECT id FROM items WHERE store_id = ? AND code = ?`, s.store, base.code)
  if (existing) throw conflict(`Ya hay un artículo con el código «${base.code}». Usa otro.`)

  const result = await run(
    c.env.DB,
    `INSERT INTO items (store_id, code, kind, acquisition, condition, name, brand, size, cut, color,
                        cost_cents, price_cents, location, notes, intake_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    s.store, base.code, base.kind, base.acquisition, base.condition, base.name,
    body.brand ?? null, body.size ?? null, body.cut ?? null, body.color ?? null,
    s.role === 'owner' ? Math.trunc(body.cost_cents ?? 0) : 0,
    Math.trunc(body.price_cents ?? 0),
    body.location ?? null, body.notes ?? null, body.intake_date ?? todayISO(),
  )
  const id = Number(result.meta.last_row_id)
  await auditStmt(c.env.DB, { session: s, entity: 'item', entityId: id, action: 'create', after: { ...base } }).run()
  return c.json({ id }, 201)
})

/**
 * Las fotos del artículo. Se manda la lista completa y reemplaza a la
 * anterior: hasta cinco, una marcada como principal. Los archivos ya están
 * subidos por `/api/files` (el redimensionado ocurre en la tableta), aquí sólo
 * se amarran al artículo.
 */
app.put('/:id{[0-9]+}/photos', async (c) => {
  const s = c.get('session')
  const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
  const body = await readJson<{ photos?: { file_id?: string; is_primary?: boolean }[] }>(c)
  const photos = Array.isArray(body.photos) ? body.photos : []
  if (photos.length > 5) throw badRequest('Son cinco fotos como máximo por artículo.')

  const ids: string[] = []
  for (const photo of photos) {
    const fileId = String(photo.file_id ?? '')
    // Sólo archivos de esta sucursal: nunca se amarra una foto de la otra.
    const file = await one<{ id: string }>(c.env.DB, `SELECT id FROM files WHERE id = ? AND store_id = ?`, fileId, s.store)
    if (!file) throw notFound('No se encontró una de las fotos.')
    if (!ids.includes(file.id)) ids.push(file.id)
  }
  // Si nadie la marcó, la primera es la principal: siempre hay una portada.
  const markedIndex = photos.findIndex((p) => p.is_primary)
  const primary = ids.length === 0 ? null : (ids[markedIndex === -1 ? 0 : Math.min(markedIndex, ids.length - 1)] as string)

  const writes = [stmt(c.env.DB, `DELETE FROM item_photos WHERE item_id = ?`, item.id)]
  ids.forEach((fileId, i) => {
    writes.push(stmt(
      c.env.DB,
      `INSERT INTO item_photos (item_id, file_id, sort, is_primary) VALUES (?,?,?,?)`,
      item.id, fileId, i, fileId === primary ? 1 : 0,
    ))
  })
  writes.push(auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action: 'photos', after: { photos: ids.length } }))
  await c.env.DB.batch(writes)

  return c.json({ photos: ids.length })
})

app.patch('/:id{[0-9]+}', requireOwner, async (c) => {
  const s = c.get('session')
  const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
  const body = await readJson<ItemInput>(c)
  validateItem({
    code: body.code ?? item.code,
    name: body.name ?? item.name,
    kind: body.kind ?? item.kind,
    acquisition: body.acquisition ?? item.acquisition,
    condition: body.condition ?? item.condition,
    price_cents: body.price_cents ?? item.price_cents,
  })

  const fields = ['name', 'brand', 'size', 'cut', 'color', 'location', 'notes', 'condition', 'kind', 'acquisition', 'intake_date'] as const
  const sets: string[] = []
  const args: (string | number | null)[] = []
  for (const f of fields) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); args.push(body[f] as string) }
  }
  for (const f of ['cost_cents', 'price_cents'] as const) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); args.push(Math.trunc(body[f] as number)) }
  }
  if (sets.length === 0) return c.json({ ok: true })
  sets.push('updated_at = ?'); args.push(nowIso())
  args.push(item.id, s.store)

  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE items SET ${sets.join(', ')} WHERE id = ? AND store_id = ?`, ...args),
    auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action: 'update', before: item, after: body }),
  ])
  return c.json({ ok: true })
})

app.delete('/:id{[0-9]+}', requireOwner, async (c) => {
  const s = c.get('session')
  const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
  if (item.contract_id) throw conflict('Ese vestido está en un contrato. Retíralo del inventario en lugar de borrarlo.')
  await c.env.DB.batch([
    stmt(c.env.DB, `DELETE FROM items WHERE id = ? AND store_id = ?`, item.id, s.store),
    auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action: 'delete', before: item }),
  ])
  return c.json({ ok: true })
})

// ──────────────────────────────────────────── transiciones con nombre ──
const ACTIONS: ItemAction[] = ['hold', 'release', 'reserve', 'tailoring/start', 'tailoring/done', 'deliver', 'retire', 'unretire']

for (const action of ACTIONS) {
  app.post(`/:id{[0-9]+}/${action}`, async (c) => {
    const s = c.get('session')
    const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
    const verdict = canTransition(item, action)
    if (!verdict.ok) throw conflict(verdict.message)

    const now = nowIso()
    const sets: string[] = ['status = ?', 'updated_at = ?']
    const args: (string | number | null)[] = [verdict.to, now]

    if (action === 'hold') {
      const body = await readJson<{ session_id?: number }>(c)
      sets.push('held_by_session = ?'); args.push(Number(body.session_id ?? 0) || null)
    }
    if (action === 'release') { sets.push('held_by_session = ?'); args.push(null) }
    if (action === 'tailoring/start') { sets.push('tailoring_started_at = ?'); args.push(now) }
    if (action === 'tailoring/done') { sets.push('tailoring_done_at = ?'); args.push(now) }
    if (action === 'deliver') { sets.push('delivered_at = ?'); args.push(now) }

    args.push(item.id, s.store)
    await c.env.DB.batch([
      stmt(c.env.DB, `UPDATE items SET ${sets.join(', ')} WHERE id = ? AND store_id = ?`, ...args),
      auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action, before: { status: item.status }, after: { status: verdict.to } }),
    ])
    if (action === 'tailoring/done') await refreshReadiness(c.env.DB, item.id)
    if (action === 'deliver' && item.contract_id) {
      await c.env.DB.batch([
        stmt(c.env.DB, `UPDATE contracts SET status = 'delivered', updated_at = ? WHERE id = ?`, now, item.contract_id),
        auditStmt(c.env.DB, { session: s, entity: 'contract', entityId: item.contract_id, action: 'delivered' }),
      ])
    }
    return c.json({ status: verdict.to })
  })
}

/** Aviso a la novia de que el vestido está listo. De aquí corre el hotel de vestido. */
app.post('/:id{[0-9]+}/notify-ready', async (c) => {
  const s = c.get('session')
  const item = await loadItem(c.env.DB, s.store, Number(c.req.param('id')))
  const status = await refreshReadiness(c.env.DB, item.id)
  if (status !== 'ready') {
    throw conflict('Todavía no está listo: falta terminar la costura o liquidar el saldo.')
  }
  const now = nowIso()
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE items SET ready_notified_at = ?, updated_at = ? WHERE id = ? AND store_id = ?`, now, now, item.id, s.store),
    auditStmt(c.env.DB, { session: s, entity: 'item', entityId: item.id, action: 'notify-ready', after: { ready_notified_at: now } }),
  ])
  return c.json({ ready_notified_at: now })
})

// ─────────────────────────────────────────────────────── importar CSV ──
/** Valida todos los renglones; si uno falla no se inserta ninguno. */
app.post('/import', requireOwner, async (c) => {
  const s = c.get('session')
  const text = await c.req.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw badRequest('El archivo no trae renglones.')

  const header = splitCsvLine(lines[0] as string).map((h) => h.trim().toLowerCase())
  const required = ['code', 'name', 'price']
  for (const col of required) {
    if (!header.includes(col)) throw badRequest(`Falta la columna «${col}» en el encabezado.`)
  }
  const index = (name: string) => header.indexOf(name)

  const parsed: ItemInput[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] as string)
    const cell = (name: string) => (index(name) >= 0 ? (cells[index(name)] ?? '').trim() : '')
    const priceRaw = cell('price').replace(/[^0-9.]/g, '')
    if (priceRaw === '') throw badRequest(`Falta el precio (renglón ${i + 1}).`)
    const photoUrl = cell('photo_url')
    const item: ItemInput = {
      code: cell('code'), name: cell('name'), brand: cell('brand') || undefined,
      cut: cell('cut') || undefined, size: cell('size') || undefined,
      kind: cell('kind') || 'dress', acquisition: cell('acquisition') || 'unidad',
      condition: cell('condition') || 'nuevo',
      price_cents: Math.round(Number(priceRaw) * 100),
      // La descarga de photo_url queda para el siguiente paso; el enlace se
      // guarda en las notas para no perderlo.
      notes: photoUrl ? `foto: ${photoUrl}` : undefined,
    }
    validateItem(item, i + 1)
    parsed.push(item)
  }

  const codes = parsed.map((p) => p.code as string)
  const dupes = codes.filter((code, i) => codes.indexOf(code) !== i)
  if (dupes.length) throw badRequest(`El archivo repite el código «${dupes[0]}».`)
  const placeholders = codes.map(() => '?').join(',')
  const clashes = await all<{ code: string }>(
    c.env.DB, `SELECT code FROM items WHERE store_id = ? AND code IN (${placeholders})`, s.store, ...codes,
  )
  if (clashes.length) throw conflict(`El código «${clashes[0]?.code}» ya existe en el inventario. No se importó nada.`)

  await c.env.DB.batch([
    ...parsed.map((p) =>
      stmt(
        c.env.DB,
        `INSERT INTO items (store_id, code, kind, acquisition, condition, name, brand, size, cut, price_cents, notes, intake_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        s.store, p.code as string, p.kind as string, p.acquisition as string, p.condition as string,
        p.name as string, p.brand ?? null, p.size ?? null, p.cut ?? null,
        p.price_cents ?? 0, p.notes ?? null, todayISO(),
      ),
    ),
    auditStmt(c.env.DB, { session: s, entity: 'item', entityId: null, action: 'import', after: { rows: parsed.length } }),
  ])
  return c.json({ imported: parsed.length })
})

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(current); current = '' }
    else current += ch
  }
  out.push(current)
  return out
}

export default app
