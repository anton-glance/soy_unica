import { Hono } from 'hono'
import type { AppEnv } from './lib/env'
import { errorResponse } from './lib/errors'
import { requireSession, sellersInsertAndSelectOnly } from './lib/auth'
import auth from './routes/auth'
import items from './routes/items'
import sessions from './routes/sessions'
import contracts from './routes/contracts'
import payments from './routes/payments'
import expenses from './routes/expenses'
import uploads from './routes/uploads'
import files from './routes/files'
import settings from './routes/settings'
import storage from './routes/storage'
import maintenance from './routes/maintenance'
import search from './routes/search'

const app = new Hono<AppEnv>()

app.onError((err, c) => errorResponse(c, err))

app.get('/api/health', (c) => c.json({ ok: true }))

// Sin cookie no se llega a nada más. La sucursal y el rol viven ahí y en
// ningún otro lado: ninguna ruta lee `store_id` ni `role` del cuerpo.
app.route('/api/auth', auth)
app.use('/api/*', requireSession, sellersInsertAndSelectOnly)

app.route('/api/items', items)
app.route('/api/sessions', sessions)
app.route('/api/contracts', contracts)
app.route('/api/payments', payments)
app.route('/api/expenses', expenses)
app.route('/api/uploads', uploads)
app.route('/api/files', files)
app.route('/api/settings', settings)
app.route('/api/storage', storage)
app.route('/api/maintenance', maintenance)
app.route('/api/search', search)

app.all('/api/*', (c) => c.json({ error: 'Esa ruta no existe.', code: 'not_found' }, 404))

// Todo lo demás es la aplicación: el router del cliente also owns /print/...
app.all('*', async (c) => {
  if (!c.env.ASSETS) return c.text('La aplicación no está compilada. Usa `npm run dev`.', 404)
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
