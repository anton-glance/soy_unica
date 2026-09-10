/**
 * NIP y sesión. Sin dependencias: WebCrypto tal cual.
 *
 *   · El NIP se guarda como PBKDF2-SHA256, 100 000 iteraciones, sal por usuario.
 *   · La sesión es un JWT HS256 de 12 horas en una cookie HttpOnly.
 */

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_BITS = 256
export const SESSION_TTL_SECONDS = 12 * 60 * 60

const enc = new TextEncoder()

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Comparación de tiempo constante: no filtra en qué carácter difiere. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function randomSalt(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64Url(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    PBKDF2_BITS,
  )
  return toBase64Url(bits)
}

export async function verifyPin(pin: string, expectedHash: string, salt: string): Promise<boolean> {
  return timingSafeEqual(await hashPin(pin, salt), expectedHash)
}

export interface SessionClaims {
  /** id del usuario */
  sub: number
  store: 'mty' | 'cdmx'
  role: 'owner' | 'seller'
  name: string
  iat: number
  exp: number
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signSession(claims: Omit<SessionClaims, 'iat' | 'exp'>, secret: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000)
  const payload: SessionClaims = { ...claims, iat, exp: iat + SESSION_TTL_SECONDS }
  const header = toBase64Url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = toBase64Url(enc.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${header}.${body}`))
  return `${header}.${body}.${toBase64Url(signature)}`
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<SessionClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts as [string, string, string]
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    fromBase64Url(signature),
    enc.encode(`${header}.${body}`),
  )
  if (!valid) return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionClaims
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    return claims
  } catch {
    return null
  }
}
