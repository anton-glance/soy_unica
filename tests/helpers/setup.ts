import { copyFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'

const STATE = '.wrangler/test-state'
/** El puerto se escribe aquí para que los archivos de prueba lo lean. */
const PORT_FILE = '.wrangler/test-port'

let worker: ChildProcess | null = null

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // CI=1 para que wrangler no pida confirmación de las migraciones.
    const child = spawn(cmd, args, { stdio: 'ignore', env: { ...process.env, CI: '1' } })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`))))
  })
}

/** Puerto libre al azar: dos corridas nunca se pisan, ni con una fuga previa. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port ? resolve(port) : reject(new Error('no se pudo obtener un puerto libre'))))
    })
  })
}

/**
 * Levanta el Worker real contra un D1 y un R2 locales recién sembrados. Las
 * pruebas de integración hablan HTTP igual que la tableta de la tienda.
 */
export async function setup(): Promise<void> {
  // El Worker necesita JWT_SECRET para firmar la cookie. `.dev.vars` está en
  // .gitignore, así que en una clona limpia —o en CI— no existe: se crea desde
  // el ejemplo. Sin esto, `npm test` sólo pasa en una máquina donde ya se
  // hubiera corrido `npm run dev`.
  if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars')

  rmSync(STATE, { recursive: true, force: true })
  mkdirSync('dist', { recursive: true })
  mkdirSync('.wrangler', { recursive: true })
  await run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'soy-unica', '--local', '--persist-to', STATE])

  const port = await freePort()
  writeFileSync(PORT_FILE, String(port))

  // `detached` da un grupo de procesos propio: al terminar se baja wrangler
  // completo, no sólo el envoltorio de npx, y el puerto queda libre.
  worker = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--local', '--persist-to', STATE], {
    stdio: 'ignore',
    detached: true,
  })

  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) break
    } catch {
      // todavía no levanta
    }
    if (Date.now() > deadline) throw new Error('El Worker de pruebas no levantó a tiempo.')
    await new Promise((r) => setTimeout(r, 500))
  }

  await seedItemPhotos(base)
}

/**
 * `reviewFields()` ahora exige una foto; sin ninguna, los vestidos de la
 * semilla quedarían marcados «por verificar» y el resto de las pruebas —que
 * dan por hecho un catálogo listo para vender, no uno a medio llenar— no
 * podrían elegirlos. No se usa `sql()` para esto (existe para una sola cosa,
 * ver más abajo en client.ts): se sube y se amarra por la misma API que usaría
 * la dueña, una vez, aquí, antes de que arranque cualquier prueba.
 */
async function seedItemPhotos(base: string): Promise<void> {
  let cookie = ''
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (cookie) headers.set('Cookie', cookie)
    if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
    const res = await fetch(`${base}${path}`, { ...init, headers })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0] as string
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`)
    return text ? (JSON.parse(text) as T) : (undefined as T)
  }

  await call('/api/auth/pin', { method: 'POST', body: JSON.stringify({ store: 'mty', role: 'owner', pin: '4242' }) })
  const { items } = await call<{ items: { id: number }[] }>('/api/items')

  for (const item of items) {
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], { type: 'image/webp' }), 'foto.webp')
    form.set('kind', 'item_photo')
    const headers = new Headers()
    if (cookie) headers.set('Cookie', cookie)
    const uploadRes = await fetch(`${base}/api/uploads`, { method: 'POST', body: form, headers })
    if (!uploadRes.ok) throw new Error(`${uploadRes.status} /api/uploads: ${await uploadRes.text()}`)
    const { id: fileId } = (await uploadRes.json()) as { id: string }
    await call(`/api/items/${item.id}/photos`, {
      method: 'PUT', body: JSON.stringify({ photos: [{ file_id: fileId, is_primary: true }] }),
    })
  }
}

export async function teardown(): Promise<void> {
  if (worker?.pid) {
    try {
      process.kill(-worker.pid, 'SIGTERM')
    } catch {
      worker.kill('SIGTERM')
    }
  }
  await new Promise((r) => setTimeout(r, 500))
}
