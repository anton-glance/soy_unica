#!/usr/bin/env node
import { ensureDevVars, migrate } from './lib.mjs'

ensureDevVars()
await migrate('.wrangler/state')
console.log('· Migraciones al día.')
