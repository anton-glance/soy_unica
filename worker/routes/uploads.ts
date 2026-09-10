import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { one, run } from '../lib/db'
import { auditStmt } from '../lib/audit'
import { badRequest, notFound, tooLarge, unsupportedMedia } from '../lib/errors'
import { objectKey, put } from '../lib/storage'

const app = new Hono<AppEnv>()

export const MAX_UPLOAD_BYTES = 600 * 1024
export const ALLOWED_MIME = ['image/webp', 'image/jpeg'] as const

const KINDS = ['item_photo', 'receipt', 'expense', 'measurement_sheet', 'contract', 'adjustments', 'delivery']

app.post('/', async (c) => {
  const s = c.get('session')
  const form = await c.req.raw.formData().catch(() => null)
  if (!form) throw badRequest('No llegó el archivo.')

  const file = form.get('file')
  if (!file || typeof file === 'string') throw badRequest('No llegó el archivo.')
  const kind = String(form.get('kind') ?? '')
  if (!KINDS.includes(kind)) throw badRequest('Ese tipo de foto no existe.')

  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    throw unsupportedMedia('La foto debe ser WebP o JPEG. Vuelve a tomarla desde la aplicación.')
  }
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw tooLarge('La foto pesa más de 600 KB. Vuelve a tomarla desde la aplicación para que se comprima.')
  }
  if (bytes.byteLength === 0) throw badRequest('La foto llegó vacía. Vuelve a tomarla.')

  let contractId: number | null = null
  const rawContract = form.get('contract_id')
  if (rawContract) {
    const found = await one<{ id: number }>(
      c.env.DB, `SELECT id FROM contracts WHERE id = ? AND store_id = ?`, Number(rawContract), s.store)
    if (!found) throw notFound('Ese contrato no existe en esta sucursal.')
    contractId = found.id
  }

  const extension = file.type === 'image/webp' ? 'webp' : 'jpg'
  const key = objectKey(s.store, kind, new Date(), extension)
  await put(c.env.R2, key, bytes, file.type)

  const id = crypto.randomUUID()
  const width = Number(form.get('width') ?? 0) || null
  const height = Number(form.get('height') ?? 0) || null
  await run(
    c.env.DB,
    `INSERT INTO files (id, store_id, r2_key, kind, bytes, mime, width, height, uploaded_by, contract_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, s.store, key, kind, bytes.byteLength, file.type, width, height, s.userId, contractId,
  )
  await auditStmt(c.env.DB, { session: s, entity: 'file', entityId: id, action: 'upload', after: { kind, bytes: bytes.byteLength } }).run()

  return c.json({ id, kind, bytes: bytes.byteLength }, 201)
})

export default app
