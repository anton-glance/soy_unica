/**
 * Cliente del API.
 *
 * Las lecturas siguen sirviendo desde caché cuando no hay red, marcadas como
 * viejas. Las escrituras fallan de frente: no hay cola de escritura y nunca se
 * le dice a la vendedora que algo se guardó cuando no se guardó.
 */

const CACHE_PREFIX = 'su:cache:'

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export class OfflineError extends Error {
  constructor() {
    super('No hay conexión. Este cambio NO se guardó. Vuelve a intentar cuando regrese la señal.')
    this.name = 'OfflineError'
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function cacheRead<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + path)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function cacheWrite(path: string, data: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(data))
  } catch {
    // La caché es una comodidad, no un requisito: si no cabe, ni modo.
  }
}

export function clearCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // sin caché que limpiar
  }
}

export interface Read<T> {
  data: T
  /** Vino de la caché porque no había red. */
  stale: boolean
}

export async function get<T>(path: string): Promise<Read<T>> {
  try {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin' })
    const body = await parse(res)
    if (!res.ok) {
      const err = body as { error?: string; code?: string }
      throw new ApiError(err?.error ?? 'No se pudo consultar.', res.status, err?.code ?? 'error')
    }
    cacheWrite(path, body)
    return { data: body as T, stale: false }
  } catch (err) {
    if (err instanceof ApiError) throw err
    const cached = cacheRead<T>(path)
    if (cached !== null) return { data: cached, stale: true }
    throw new OfflineError()
  }
}

async function write<T>(path: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new OfflineError()
  }
  const parsed = await parse(res)
  if (!res.ok) {
    const err = parsed as { error?: string; code?: string }
    throw new ApiError(err?.error ?? 'No se pudo guardar.', res.status, err?.code ?? 'error')
  }
  return parsed as T
}

export const post = <T>(path: string, body?: unknown) => write<T>(path, 'POST', body)
export const patch = <T>(path: string, body?: unknown) => write<T>(path, 'PATCH', body)
export const del = <T>(path: string) => write<T>(path, 'DELETE')

/** Sube una foto ya comprimida en la tableta. */
export async function upload(blob: Blob, kind: string, extra: { contract_id?: number; width?: number; height?: number } = {}): Promise<{ id: string }> {
  const form = new FormData()
  form.set('file', blob, `foto.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`)
  form.set('kind', kind)
  if (extra.contract_id) form.set('contract_id', String(extra.contract_id))
  if (extra.width) form.set('width', String(extra.width))
  if (extra.height) form.set('height', String(extra.height))
  return write<{ id: string }>('/uploads', 'POST', form)
}
