import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { all, one, stmt } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, conflict, notFound } from '../lib/errors'
import { readJson } from '../lib/http'
import { requireOwner } from '../lib/auth'
import { del, put, twinPhotoKey } from '../lib/storage'

const app = new Hono<AppEnv>()
app.use('*', requireOwner)

interface Candidate {
  id: string
  r2_key: string
  kind: string
  bytes: number
  created_at: string
  archived_at: string | null
  contract_id: number | null
  reason: string
}

/**
 * Qué se borraría por retención, y por qué cada archivo sí o no. Nunca borra
 * mientras haya saldo, dentro de los 12 meses posteriores a la entrega, ni con
 * archivo-antes-de-borrar encendido y el archivo sin sellar.
 */
async function candidates(db: D1Database, store: string): Promise<{ deletable: Candidate[]; held: Candidate[] }> {
  const settings = await one<{
    retention_sold_photos_months: number; retention_client_docs_months: number
    retention_expense_photos_months: number; archive_before_delete: number; archive_target: string
  }>(db, `SELECT retention_sold_photos_months, retention_client_docs_months, retention_expense_photos_months,
                 archive_before_delete, archive_target FROM stores WHERE id = ?`, store)
  if (!settings) throw notFound('No se encontró la sucursal.')

  const groups: { kinds: string[]; months: number }[] = [
    { kinds: ['item_photo'], months: settings.retention_sold_photos_months },
    { kinds: ['measurement_sheet', 'contract', 'adjustments', 'delivery', 'receipt'], months: settings.retention_client_docs_months },
    { kinds: ['expense'], months: settings.retention_expense_photos_months },
  ]

  const deletable: Candidate[] = []
  const held: Candidate[] = []

  for (const group of groups) {
    if (group.months === 0) continue
    const rows = await all<Candidate & { balance_cents: number | null; delivered_at: string | null; item_status: string | null }>(
      db,
      `SELECT f.id, f.r2_key, f.kind, f.bytes, f.created_at, f.archived_at, f.contract_id,
              c.total_cents - IFNULL((SELECT SUM(p.amount_cents) FROM payments p
                 WHERE p.contract_id = c.id AND p.voided_at IS NULL), 0) AS balance_cents,
              i.delivered_at AS delivered_at, i.status AS item_status
       FROM files f
       LEFT JOIN contracts c ON c.id = f.contract_id
       LEFT JOIN items i ON i.contract_id = c.id
       WHERE f.store_id = ?
         AND f.kind IN (${group.kinds.map(() => '?').join(',')})
         AND f.created_at < datetime('now', ?)`,
      store, ...group.kinds, `-${group.months} months`,
    )

    for (const row of rows) {
      const entry: Candidate = { ...row, reason: '' }
      // La retención de fotos de artículo corre sólo una vez que ya no está en
      // el catálogo activo — vendido, o retirado a mano por la dueña, que es
      // como se quita casi todo lo que se manda a hacer, no sólo lo vendido.
      if (row.kind === 'item_photo' && row.item_status !== 'sold' && row.item_status !== 'retired') {
        continue
      }
      if (row.balance_cents !== null && row.balance_cents > 0) {
        held.push({ ...entry, reason: 'El contrato todavía tiene saldo.' }); continue
      }
      if (row.delivered_at && Date.parse(row.delivered_at) > Date.now() - 365 * 86_400_000) {
        held.push({ ...entry, reason: 'La entrega tiene menos de 12 meses.' }); continue
      }
      if (settings.archive_before_delete && row.archived_at === null) {
        held.push({
          ...entry,
          reason: settings.archive_target === 'none'
            ? 'Archivar antes de borrar está encendido pero no hay destino de archivo configurado.'
            : 'Todavía no se ha archivado en Google Drive.',
        })
        continue
      }
      deletable.push({ ...entry, reason: `Pasaron ${group.months} meses.` })
    }
  }

  return { deletable, held }
}

app.get('/retention', async (c) => {
  const s = c.get('session')
  const { deletable, held } = await candidates(c.env.DB, s.store)
  return c.json({
    dry_run: true,
    deletable,
    held,
    deletable_bytes: deletable.reduce((sum, f) => sum + f.bytes, 0),
  })
})

app.post('/retention/run', async (c) => {
  const s = c.get('session')
  const { deletable, held } = await candidates(c.env.DB, s.store)
  if (deletable.length === 0) {
    throw conflict(
      held.length > 0
        ? 'No se borró nada: todos los archivos vencidos están retenidos. Revisa el detalle antes de insistir.'
        : 'No hay nada que borrar todavía.',
    )
  }
  for (const file of deletable) await del(c.env.R2, file.r2_key)
  await c.env.DB.batch([
    ...deletable.map((f) => stmt(c.env.DB, `DELETE FROM files WHERE id = ? AND store_id = ?`, f.id, s.store)),
    auditStmt(c.env.DB, { session: s, entity: 'file', entityId: null, action: 'retention_delete', before: { ids: deletable.map((f) => f.id) } }),
  ])
  return c.json({ deleted: deletable.length, bytes: deletable.reduce((sum, f) => sum + f.bytes, 0) })
})

/**
 * Restaura las fotos del catálogo importado que están en la base pero no en el
 * almacén de archivos (R2). El importador guarda cada foto dos veces, una por
 * sucursal; si la copia de ésta nunca se subió, se copia de la otra, que trae
 * los mismos bytes.
 *
 * Trabaja por tandas, con un cursor (`after`): cada llamada toca a lo mucho
 * `BATCH` fotos para no pasarse del límite de operaciones de una sola petición
 * del Worker. La pantalla repite hasta que `next` es null. Sólo agrega lo que
 * falta: nunca sobrescribe una foto que ya está.
 */
const OTHER_STORE: Record<string, string> = { mty: 'cdmx', cdmx: 'mty' }
const PHOTO_BATCH = 14

app.post('/catalog-photos/restore', async (c) => {
  const s = c.get('session')
  const other = OTHER_STORE[s.store]
  if (!other) throw badRequest('Esta sucursal no tiene una sucursal gemela de dónde copiar.')
  const body = await readJson<{ after?: string }>(c)
  const after = String(body.after ?? '')

  const rows = await all<{ id: string; r2_key: string }>(
    c.env.DB,
    `SELECT id, r2_key FROM files
      WHERE store_id = ? AND kind = 'item_photo' AND id LIKE ? AND id > ?
      ORDER BY id LIMIT ?`,
    s.store, `${s.store}-%`, after, PHOTO_BATCH,
  )
  const total = (await one<{ n: number }>(
    c.env.DB, `SELECT COUNT(*) AS n FROM files WHERE store_id = ? AND kind = 'item_photo' AND id LIKE ?`, s.store, `${s.store}-%`,
  ))?.n ?? 0

  let copied = 0
  let already = 0
  const noSource: string[] = []
  for (const row of rows) {
    if (await c.env.R2.head(row.r2_key)) { already++; continue }
    const twin = twinPhotoKey(row.r2_key, s.store, other)
    const source = twin ? await c.env.R2.get(twin) : null
    if (!source) { noSource.push(row.id); continue }
    await put(c.env.R2, row.r2_key, await source.arrayBuffer(), 'image/webp')
    copied++
  }
  if (copied > 0) {
    await auditStmt(c.env.DB, { session: s, entity: 'file', entityId: null, action: 'restore_catalog_photos', after: { copied } }).run()
  }

  return c.json({
    checked: rows.length, copied, already, no_source: noSource, total,
    next: rows.length === PHOTO_BATCH ? (rows[rows.length - 1] as { id: string }).id : null,
  })
})

export default app
