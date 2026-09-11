import { existsSync, copyFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Local dev needs a JWT secret; production uses `wrangler secret put JWT_SECRET`. */
export function ensureDevVars() {
  const target = join(ROOT, '.dev.vars')
  if (!existsSync(target)) {
    copyFileSync(join(ROOT, '.dev.vars.example'), target)
    console.log('· .dev.vars creado desde .dev.vars.example (solo para desarrollo local)')
  }
}

/**
 * Aplica las migraciones sin preguntar nada. Wrangler sólo pide confirmación
 * cuando cree estar en una terminal interactiva; `CI=1` le dice que no lo está
 * y responde que sí solo. No hay una bandera `-y` en este subcomando.
 */
export function migrate(persistTo) {
  return run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'soy-unica', '--local', '--persist-to', persistTo], {
    env: { ...process.env, CI: '1' },
  })
}

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))))
  })
}
