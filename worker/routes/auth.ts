import { Hono } from 'hono'
import { readJson } from '../lib/http'
import type { AppEnv, Role, StoreId } from '../lib/env'
import { badRequest, unauthorized } from '../lib/errors'
import {
  assertNotLocked, clearedCookie, evaluateLockout, findUserByPin, issueSession,
  recentFailures, recordAttempt, requireSession, sessionCookie,
} from '../lib/auth'
import { one } from '../lib/db'

const app = new Hono<AppEnv>()

const STORES: StoreId[] = ['mty', 'cdmx']
const ROLES: Role[] = ['owner', 'seller']

/** Las sucursales son públicas: es la primera pantalla, antes de identificarse. */
app.get('/stores', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, address FROM stores ORDER BY name`,
  ).all<{ id: string; name: string; address: string }>()
  return c.json({ stores: results ?? [] })
})

app.post('/pin', async (c) => {
  const body = await readJson<{ store?: string; role?: string; pin?: string }>(c)
  const store = body.store as StoreId
  const role = body.role as Role
  const pin = String(body.pin ?? '')

  if (!STORES.includes(store) || !ROLES.includes(role)) throw badRequest('Falta la sucursal o el rol.')
  if (!/^\d{4,6}$/.test(pin)) throw badRequest('El NIP son de 4 a 6 dígitos.')

  assertNotLocked(evaluateLockout(await recentFailures(c.env.DB, store, role)))

  const user = await findUserByPin(c.env.DB, store, role, pin)
  if (!user) {
    await recordAttempt(c.env.DB, store, role, false, null)
    // Un solo mensaje: no se dice si falló la sucursal, el rol o el NIP.
    throw unauthorized('NIP incorrecto.', 'bad_pin')
  }

  await recordAttempt(c.env.DB, store, role, true, user.id)
  const token = await issueSession(user, c.env.JWT_SECRET)
  c.header('Set-Cookie', sessionCookie(token, new URL(c.req.url).protocol === 'https:'))
  return c.json({ store: user.store_id, role: user.role, name: user.name })
})

app.post('/logout', (c) => {
  c.header('Set-Cookie', clearedCookie(new URL(c.req.url).protocol === 'https:'))
  return c.json({ ok: true })
})

app.get('/me', requireSession, async (c) => {
  const s = c.get('session')
  const store = await one<{ name: string; kiosk_show_prices: number }>(
    c.env.DB,
    `SELECT name, kiosk_show_prices FROM stores WHERE id = ?`,
    s.store,
  )
  return c.json({ ...s, store_name: store?.name ?? '', kiosk_show_prices: !!store?.kiosk_show_prices })
})

export default app
