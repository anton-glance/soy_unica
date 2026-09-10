#!/usr/bin/env node
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ensureDevVars, run } from './lib.mjs'

ensureDevVars()

console.log('· Borrando el estado local de D1 y R2…')
rmSync(join(ROOT, '.wrangler', 'state'), { recursive: true, force: true })

console.log('· Aplicando migraciones y semilla…')
await run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'soy-unica', '--local', '--persist-to', '.wrangler/state'])

console.log(`
────────────────────────────────────────────────────────────
  Base de datos lista.

  NIPs de la semilla:
    Monterrey · Dueña      4242
    Monterrey · Vendedora  1111
    CDMX      · Dueña      4242
    CDMX      · Vendedora  2222

  Cámbialos en Ajustes antes de usar el sistema en la tienda.
────────────────────────────────────────────────────────────
`)
