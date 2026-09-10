#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { ROOT, ensureDevVars } from './lib.mjs'

ensureDevVars()
// wrangler refuses to boot without the assets directory, even in API-only dev.
mkdirSync(join(ROOT, 'dist'), { recursive: true })

const procs = [
  ['api', 'npx', ['wrangler', 'dev', '--port', '8790', '--local', '--persist-to', '.wrangler/state']],
  ['web', 'npx', ['vite', '--port', '5180', '--strictPort']],
].map(([label, cmd, args]) => {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = (stream) => (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) stream.write(`[${label}] ${line}\n`)
    }
  }
  child.stdout.on('data', tag(process.stdout))
  child.stderr.on('data', tag(process.stderr))
  child.on('exit', (code) => {
    console.log(`[${label}] terminó (${code})`)
    shutdown(code ?? 0)
  })
  return child
})

let closing = false
function shutdown(code) {
  if (closing) return
  closing = true
  for (const p of procs) p.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('\n  Kiosko:  http://localhost:5180')
console.log('  API:     http://localhost:8790/api/health\n')
