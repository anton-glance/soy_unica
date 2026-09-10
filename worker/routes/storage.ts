import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { all, one } from '../lib/db'

const app = new Hono<AppEnv>()

/** Plan gratuito de R2. Se muestra en Ajustes para que la dueña lo vea venir. */
export const QUOTA_BYTES = 10 * 1024 * 1024 * 1024
const GROWTH_WINDOW_DAYS = 90

app.get('/', async (c) => {
  const s = c.get('session')
  const totals = await one<{ bytes: number; files: number }>(
    c.env.DB, `SELECT IFNULL(SUM(bytes),0) AS bytes, COUNT(*) AS files FROM files WHERE store_id = ?`, s.store)
  const byKind = await all<{ kind: string; bytes: number; files: number }>(
    c.env.DB,
    `SELECT kind, IFNULL(SUM(bytes),0) AS bytes, COUNT(*) AS files
     FROM files WHERE store_id = ? GROUP BY kind ORDER BY bytes DESC`, s.store)

  const window = await one<{ bytes: number }>(
    c.env.DB,
    `SELECT IFNULL(SUM(bytes),0) AS bytes FROM files
     WHERE store_id = ? AND created_at >= datetime('now', ?)`,
    s.store, `-${GROWTH_WINDOW_DAYS} days`)

  const used = totals?.bytes ?? 0
  const perMonth = ((window?.bytes ?? 0) / GROWTH_WINDOW_DAYS) * 30
  const remaining = Math.max(0, QUOTA_BYTES - used)
  const months_to_full = perMonth > 0 ? Math.floor(remaining / perMonth) : null

  const full_on = months_to_full === null ? null : new Date(Date.now() + months_to_full * 30 * 86_400_000).getUTCFullYear()

  return c.json({
    used_bytes: used,
    quota_bytes: QUOTA_BYTES,
    files: totals?.files ?? 0,
    by_kind: byKind,
    growth_bytes_per_month: Math.round(perMonth),
    months_to_full,
    full_on,
  })
})

export default app
