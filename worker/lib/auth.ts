import type { Context, MiddlewareHandler } from 'hono'
import { all, one } from './db'
import { auditStmt } from './audit'
import { forbidden, locked, unauthorized } from './errors'
import { SESSION_TTL_SECONDS, signSession, verifyPin, verifySession } from './crypto'
import type { AppEnv, Role, Session, StoreId } from './env'

export const COOKIE_NAME = 'su_session'

/** Cinco fallos en 10 minutos bloquean esa sucursal+rol durante 60 segundos. */
export const LOCKOUT_THRESHOLD = 5
export const LOCKOUT_WINDOW_SECONDS = 10 * 60
export const LOCKOUT_SECONDS = 60

export interface LockoutState {
  locked: boolean
  retry_in_seconds: number
  failures: number
}

/**
 * Estado de bloqueo a partir de las marcas de tiempo de los intentos fallidos
 * ocurridos después del último acceso correcto, de más reciente a más antiguo.
 */
export function evaluateLockout(failureTimestamps: readonly string[], now: Date = new Date()): LockoutState {
  const nowMs = now.getTime()
  const recent = failureTimestamps
    .map((t) => Date.parse(t.endsWith('Z') ? t : `${t}Z`))
    .filter((ms) => Number.isFinite(ms) && nowMs - ms <= LOCKOUT_WINDOW_SECONDS * 1000)
    .sort((a, b) => b - a)

  if (recent.length < LOCKOUT_THRESHOLD) {
    return { locked: false, retry_in_seconds: 0, failures: recent.length }
  }
  const newest = recent[0] as number
  const elapsed = (nowMs - newest) / 1000
  if (elapsed >= LOCKOUT_SECONDS) {
    return { locked: false, retry_in_seconds: 0, failures: recent.length }
  }
  return { locked: true, retry_in_seconds: Math.ceil(LOCKOUT_SECONDS - elapsed), failures: recent.length }
}

/** Intentos fallidos registrados en la bitácora desde el último acceso correcto. */
export async function recentFailures(db: D1Database, store: StoreId, role: Role): Promise<string[]> {
  const lastOk = await one<{ at: string }>(
    db,
    `SELECT at FROM audit_log
     WHERE entity = 'auth' AND store_id = ? AND entity_id = ? AND action = 'pin_ok'
     ORDER BY at DESC, id DESC LIMIT 1`,
    store,
    role,
  )
  const rows = await all<{ at: string }>(
    db,
    `SELECT at FROM audit_log
     WHERE entity = 'auth' AND store_id = ? AND entity_id = ? AND action = 'pin_failed'
       AND at > ?
     ORDER BY at DESC LIMIT 50`,
    store,
    role,
    lastOk?.at ?? '',
  )
  return rows.map((r) => r.at)
}

export interface UserRow {
  id: number
  name: string
  role: Role
  store_id: StoreId
  pin_hash: string
  pin_salt: string
}

/**
 * Verifica el NIP contra los usuarios activos de esa sucursal y rol. Un NIP
 * equivocado nunca dice qué parte falló.
 */
export async function findUserByPin(db: D1Database, store: StoreId, role: Role, pin: string): Promise<UserRow | null> {
  const users = await all<UserRow>(
    db,
    `SELECT id, name, role, store_id, pin_hash, pin_salt
     FROM users WHERE store_id = ? AND role = ? AND active = 1
     ORDER BY id`,
    store,
    role,
  )
  for (const user of users) {
    if (await verifyPin(pin, user.pin_hash, user.pin_salt)) return user
  }
  return null
}

export async function recordAttempt(db: D1Database, store: StoreId, role: Role, ok: boolean, userId: number | null): Promise<void> {
  await auditStmt(db, {
    session: userId ? { userId, store } : null,
    entity: 'auth',
    entityId: role,
    action: ok ? 'pin_ok' : 'pin_failed',
  }).run()
}

export function sessionCookie(token: string, secure: boolean): string {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_TTL_SECONDS}`]
  if (secure) flags.push('Secure')
  return `${COOKIE_NAME}=${token}; ${flags.join('; ')}`
}

export function clearedCookie(secure: boolean): string {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) flags.push('Secure')
  return `${COOKIE_NAME}=; ${flags.join('; ')}`
}

export async function issueSession(user: UserRow, secret: string): Promise<string> {
  return signSession({ sub: user.id, store: user.store_id, role: user.role, name: user.name }, secret)
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

/**
 * La sucursal y el rol viven en la cookie y en ningún otro lado. Ningún
 * endpoint acepta `store_id` ni `role` desde el cuerpo o la query.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readCookie(c.req.header('Cookie'), COOKIE_NAME)
  if (!token) throw unauthorized()
  const claims = await verifySession(token, c.env.JWT_SECRET)
  if (!claims) throw unauthorized('Tu sesión expiró. Vuelve a marcar tu NIP.')
  const session: Session = { userId: claims.sub, store: claims.store, role: claims.role, name: claims.name }
  c.set('session', session)
  await next()
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('session').role !== 'owner') {
    throw forbidden('Esta pantalla es sólo para la dueña.')
  }
  await next()
}

/**
 * Las vendedoras sólo insertan y consultan. Ningún PATCH ni DELETE genérico es
 * alcanzable con su token; los cambios de estado pasan por endpoints con
 * nombre, que son POST y validan el estado de origen.
 */
export const sellersInsertAndSelectOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method
  if ((method === 'PATCH' || method === 'PUT' || method === 'DELETE') && c.get('session').role === 'seller') {
    throw forbidden('Las vendedoras no pueden modificar ni borrar registros. Pídeselo a la dueña.')
  }
  await next()
}

export function session(c: Context<AppEnv>): Session {
  return c.get('session')
}

export function assertNotLocked(state: LockoutState): void {
  if (state.locked) {
    throw locked(`Demasiados intentos. Espera ${state.retry_in_seconds} segundos y vuelve a marcar.`)
  }
}

export { signSession }
