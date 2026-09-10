import { readFileSync } from 'node:fs'

/** El puerto lo escoge el arranque global; aquí sólo se lee. */
const BASE = `http://127.0.0.1:${readFileSync('.wrangler/test-port', 'utf8').trim()}`

/** Una tableta: guarda su propia cookie, como un navegador distinto. */
export class Kiosk {
  private cookie = ''

  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.cookie) headers.set('Cookie', this.cookie)
    if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0] as string
    return res
  }

  async get<T>(path: string): Promise<T> {
    return this.unwrap<T>(await this.raw(path))
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.unwrap<T>(await this.raw(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }))
  }

  /** El rechazo esperado: el estado y el mensaje en español que vio la vendedora. */
  async refusal(path: string, body?: unknown, method = 'POST'): Promise<{ status: number; error: string }> {
    const res = await this.raw(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = (await res.json()) as { error?: string }
    return { status: res.status, error: json.error ?? '' }
  }

  async upload(kind: string, contractId?: number): Promise<string> {
    const form = new FormData()
    // El contenido no importa aquí; el tipo y el peso sí, que es lo que valida.
    form.set('file', new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], { type: 'image/webp' }), 'foto.webp')
    form.set('kind', kind)
    if (contractId) form.set('contract_id', String(contractId))
    const res = await this.raw('/api/uploads', { method: 'POST', body: form })
    const json = (await res.json()) as { id?: string; error?: string }
    if (!res.ok || !json.id) throw new Error(`no se pudo subir la foto: ${json.error}`)
    return json.id
  }

  async login(store: string, role: string, pin: string): Promise<void> {
    await this.post('/api/auth/pin', { store, role, pin })
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${res.url}: ${text}`)
    return JSON.parse(text) as T
  }
}
