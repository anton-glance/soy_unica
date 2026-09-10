import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { one } from '../lib/db'
import { notFound } from '../lib/errors'
import { get } from '../lib/storage'

const app = new Hono<AppEnv>()

/** Sólo con sesión de la misma sucursal. Nunca se sirve un archivo de la otra. */
app.get('/:id', async (c) => {
  const s = c.get('session')
  const file = await one<{ r2_key: string; mime: string }>(
    c.env.DB, `SELECT r2_key, mime FROM files WHERE id = ? AND store_id = ?`, c.req.param('id'), s.store)
  if (!file) throw notFound('No se encontró esa foto.')

  const object = await get(c.env.R2, file.r2_key)
  if (!object) throw notFound('La foto ya no está guardada.')

  return new Response(object.body, {
    headers: {
      'Content-Type': object.contentType || file.mime,
      'Content-Length': String(object.size),
      ETag: object.httpEtag,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
})

export default app
