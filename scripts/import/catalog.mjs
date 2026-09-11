#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { toItem, STORE_RULES, DEFAULT_STORE } from './map-product.mjs'

/**
 * Imports the soyunicanovias.com catalog into the two branches.
 *
 * Reads the public WooCommerce Store API — `/wp-json/wc/store/v1/products` —
 * which needs no key. Downloads the images, re-encodes them with the same
 * limits the tablet uses (1600 px, WebP, <=300 KB) and writes them next to a
 * manifest that says which R2 key each one belongs under. Nothing links to the
 * site's own images: if it goes down or moves host tomorrow, the kiosk would be
 * left with no photos.
 *
 * The site runs two catalogs, so a product is split by its categories: CDMX
 * rows go to `cdmx` with the CDMX price, Monterrey rows to `mty` with the
 * Monterrey price, and a product carrying both categories is written into both.
 *
 * Like the ledger importer, it writes to no database: it produces the report,
 * a `.sql` applied by hand, and the image manifest.
 *
 * Usage:
 *   node scripts/import/catalog.mjs --fetch        download the catalog to docs/import/catalog-raw.json
 *   node scripts/import/catalog.mjs                read that file and produce report + sql
 *   node scripts/import/catalog.mjs --images       also download and re-encode the images
 *   node scripts/import/catalog.mjs --categories   print the site's category census and stop
 */

const BASE = 'https://soyunicanovias.com/wp-json/wc/store/v1/products'
const STORES = ['mty', 'cdmx']
const OUT = 'docs/import'
const RAW = `${OUT}/catalog-raw.json`
const IMAGES = `${OUT}/catalog-images`
const MANIFEST = `${OUT}/catalog-r2.tsv`

/** The same limits src/lib/image.ts uses on the tablet. */
const TARGET = { maxEdge: 1600, startQuality: 72, minQuality: 40, maxBytes: 300 * 1024 }

const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const pesos = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
/** Model names as the shop says them out loud, for matching the same dress across branches. */
const modelKey = (name) => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/^(vestido|traje)\s+(de\s+(novia|gala|noche)\s+)?/, '').replace(/[^a-z0-9]+/g, ' ').trim()

// ────────────────────────────────────────────────────────────── download ──
async function fetchAll() {
  const products = []
  for (let page = 1; page <= 100; page++) {
    const url = `${BASE}?per_page=100&page=${page}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`)
    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) break
    products.push(...batch)
    process.stdout.write(`\rpage ${page}: ${products.length} products`)
    if (batch.length < 100) break
  }
  process.stdout.write('\n')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(RAW, JSON.stringify(products, null, 2))
  return products
}

// ──────────────────────────────────────────────────────────────── images ──
async function encode(buffer) {
  const require = createRequire(import.meta.url)
  const sharp = require('sharp')
  const img = sharp(buffer, { failOn: 'none' })
  const meta = await img.metadata()
  const resized = img.rotate().resize({
    width: meta.width >= meta.height ? TARGET.maxEdge : null,
    height: meta.height > meta.width ? TARGET.maxEdge : null,
    withoutEnlargement: true,
    fit: 'inside',
  })
  // The same quality ladder as the tablet: it steps down until it fits.
  for (let quality = TARGET.startQuality; quality >= TARGET.minQuality; quality -= 8) {
    const out = await resized.clone().webp({ quality }).toBuffer()
    if (out.length <= TARGET.maxBytes || quality === TARGET.minQuality) {
      const m = await sharp(out).metadata()
      return { buffer: out, quality, width: m.width, height: m.height, tooBig: out.length > TARGET.maxBytes }
    }
  }
  throw new Error('unreachable')
}

// ────────────────────────────────────────────────────────────────── main ──
const wantFetch = process.argv.includes('--fetch')
const wantImages = process.argv.includes('--images')
const wantCategories = process.argv.includes('--categories')

let raw
if (wantFetch) {
  raw = await fetchAll()
} else if (existsSync(RAW)) {
  raw = JSON.parse(readFileSync(RAW, 'utf8'))
} else {
  console.error(`${RAW} does not exist. Run this first:  node scripts/import/catalog.mjs --fetch`)
  console.error('(needs outbound access to soyunicanovias.com)')
  process.exit(1)
}

/*
 * The category census. The branch split is only as good as these patterns, and
 * they were written without ever seeing the site, so print what it actually
 * uses and check before importing anything.
 */
const census = new Map()
for (const product of raw) {
  for (const c of product.categories ?? []) {
    const name = String(c.name ?? '').replace(/<[^>]*>/g, '').trim()
    if (!name) continue
    const row = census.get(name) ?? { name, n: 0 }
    row.n++
    census.set(name, row)
  }
}
const categoryRows = [...census.values()].sort((a, b) => b.n - a.n).map((row) => ({
  ...row,
  store: STORE_RULES.filter((r) => r.test.test(row.name)).map((r) => r.store).join(' + ') || `— (falls back to ${DEFAULT_STORE})`,
}))

if (wantCategories) {
  console.log(`${raw.length} products, ${categoryRows.length} categories\n`)
  for (const row of categoryRows) console.log(`${String(row.n).padStart(4)}  ${row.name.padEnd(42)} → ${row.store}`)
  process.exit(0)
}

const products = raw.map(toItem)
const rejected = products.filter((p) => p.problems.length > 0)
const usable = products.filter((p) => p.problems.length === 0)

/*
 * One product becomes one row per branch it belongs to. The code is unique per
 * branch, so the collision check runs per branch too: the same `A12` in both
 * catalogs is not a collision, it is the same dress on two racks.
 */
const rows = []
const collisions = []
const byStore = new Map(STORES.map((s) => [s, new Map()]))
for (const product of usable) {
  for (const store of product.stores) {
    if (!byStore.has(store)) byStore.set(store, new Map())
    const seen = byStore.get(store)
    if (seen.has(product.code)) { collisions.push({ store, product, first: seen.get(product.code) }); continue }
    const row = { ...product, store }
    seen.set(product.code, row)
    rows.push(row)
  }
}

const bothCatalogs = usable.filter((p) => p.stores.length > 1)
const noBranch = usable.filter((p) => (p.categories ?? []).every((c) => !STORE_RULES.some((r) => r.test.test(c))))

/* The same model sold by both branches, whether as one product or as two. */
const byModel = new Map()
for (const row of rows) {
  const key = modelKey(row.name)
  if (!key) continue
  const bucket = byModel.get(key) ?? []
  bucket.push(row)
  byModel.set(key, bucket)
}
const sharedModels = [...byModel.entries()]
  .filter(([, bucket]) => new Set(bucket.map((r) => r.store)).size > 1)
  .map(([key, bucket]) => ({ key, rows: bucket }))
  .sort((a, b) => a.key.localeCompare(b.key))

// Images are downloaded once per product and referenced by every branch row.
let imageReport = { downloaded: 0, reused: 0, bytesIn: 0, bytesOut: 0, failed: [], tooBig: [] }
const shots = new Map()
if (wantImages) {
  mkdirSync(IMAGES, { recursive: true })
  for (const product of usable) {
    const list = []
    for (const [i, img] of product.images.slice(0, 5).entries()) {
      // Named by the site's product id, not by the code: the code can change
      // when she fixes it, and a re-run must not re-download the whole catalog.
      const name = `${product.source_id}-${i}.webp`
      const path = `${IMAGES}/${name}`
      if (existsSync(path)) {
        const { size } = statSync(path)
        const require = createRequire(import.meta.url)
        const meta = await require('sharp')(readFileSync(path)).metadata()
        list.push({ name, bytes: size, width: meta.width, height: meta.height, primary: i === 0 })
        imageReport.reused++
        continue
      }
      try {
        const res = await fetch(img.src)
        if (!res.ok) throw new Error(`${res.status}`)
        const input = Buffer.from(await res.arrayBuffer())
        const out = await encode(input)
        writeFileSync(path, out.buffer)
        list.push({ name, bytes: out.buffer.length, width: out.width, height: out.height, primary: i === 0 })
        imageReport.downloaded++
        imageReport.bytesIn += input.length
        imageReport.bytesOut += out.buffer.length
        if (out.tooBig) imageReport.tooBig.push({ code: product.code, bytes: out.buffer.length })
      } catch (err) {
        imageReport.failed.push({ code: product.code, src: img.src, why: String(err.message ?? err) })
      }
    }
    shots.set(product.source_id, list)
    process.stdout.write(`\rimages: ${imageReport.downloaded} downloaded, ${imageReport.reused} already there`)
  }
  process.stdout.write('\n')
}

/*
 * A file row belongs to one branch, so a product in both catalogs gets two file
 * rows pointing at the same picture. The manifest says which local file goes to
 * which R2 key; the deploy loops over it rather than guessing the layout.
 */
const uploads = []
for (const row of rows) {
  row.files = (shots.get(row.source_id) ?? []).map((shot) => {
    const id = `${row.store}-${shot.name.replace(/\.webp$/, '')}`
    const key = `${row.store}/item_photo/${id}.webp`
    uploads.push({ local: `${IMAGES}/${shot.name}`, key })
    return { ...shot, id, key }
  })
}

// ──────────────────────────────────────────────────────────────── report ──
const lines = []
const say = (s = '') => lines.push(s)
const storeRows = (store) => rows.filter((r) => r.store === store)
const flagged = rows.filter((r) => r.review.length > 0)

say('# Catalog import — soyunicanovias.com')
say()
say(`Source: \`${BASE}\`.`)
say('**None of this has been written to any database.**')
say()
say('## Summary')
say()
say('| | |')
say('|---|---|')
say(`| products on the site | ${products.length} |`)
say(`| rejected outright | ${rejected.length} |`)
say(`| inventory rows to write | **${rows.length}** |`)
say(`| of those, flagged for review | ${flagged.length} |`)
say(`| duplicate codes within a branch | ${collisions.length} |`)
say()
say('## By branch')
say()
say('| branch | rows | dresses | accessories | flagged | catalog value |')
say('|---|---|---|---|---|---|')
for (const store of STORES) {
  const mine = storeRows(store)
  say(`| \`${store}\` | ${mine.length} | ${mine.filter((r) => r.kind === 'dress').length} | `
    + `${mine.filter((r) => r.kind === 'accessory').length} | ${mine.filter((r) => r.review.length > 0).length} | `
    + `${pesos(mine.reduce((n, r) => n + r.price_cents, 0))} |`)
}
say()
say('Everything comes in as **made to order**: the site\'s stock flags are not trustworthy and')
say('claiming a physical unit that may not exist is worse than the reverse. Size and cost stay')
say('empty on purpose — a made-to-order dress is cut to the bride\'s measurements and was never')
say('bought up front — so neither counts as a gap.')
say()

say('## Branch split')
say()
say('The branch is read off each product\'s categories. Check this table against the site before')
say('importing: the patterns live in `STORE_RULES` in `scripts/import/map-product.mjs`, and a')
say('category that matches nothing falls back to `' + DEFAULT_STORE + '`.')
say()
say('| products | category | branch |')
say('|---|---|---|')
for (const row of categoryRows) say(`| ${row.n} | ${row.name} | ${row.store} |`)
say()

if (bothCatalogs.length > 0) {
  say('### Products carrying both branches\' categories')
  say()
  say('One product on the site, one row in each branch, at the same price.')
  say()
  say('| code | model | price |')
  say('|---|---|---|')
  for (const p of bothCatalogs) say(`| \`${p.code}\` | ${p.name} | ${pesos(p.price_cents)} |`)
  say()
}
if (sharedModels.length > 0) {
  say('### The same model in both branches')
  say()
  say('Matched on the model name, so this also catches the pairs the site lists as two separate')
  say('products. A price of $0.00 is the Monterrey row she leaves unpriced on purpose because the')
  say('dress also sits in the CDMX catalog — it comes in flagged, and cannot be sold until it has a price.')
  say()
  say('| model | branch | code | price |')
  say('|---|---|---|---|')
  for (const m of sharedModels) {
    for (const r of m.rows.sort((a, b) => a.store.localeCompare(b.store))) {
      say(`| ${r.name} | \`${r.store}\` | \`${r.code}\` | ${pesos(r.price_cents)} |`)
    }
  }
  say()
}
if (noBranch.length > 0) {
  say(`### No branch category — ${noBranch.length} products`)
  say()
  say(`These carry no category naming a branch, so they go to \`${DEFAULT_STORE}\` only.`)
  say()
  say('| code | model | categories |')
  say('|---|---|---|')
  for (const p of noBranch) say(`| \`${p.code}\` | ${p.name} | ${p.categories.join(', ') || '—'} |`)
  say()
}

if (flagged.length > 0) {
  const byReason = new Map()
  for (const row of flagged) for (const r of row.review) byReason.set(r, (byReason.get(r) ?? 0) + 1)
  say('## Flagged for review')
  say()
  say('These come in with everything the site does give, and land under the **Por verificar** chip')
  say('in Inventario with the missing fields marked. Nothing is guessed. An item with a flag or a')
  say('zero price is refused server-side when a seller tries to pick it in a session, so a zero can')
  say('never reach a printed contract.')
  say()
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) say(`- \`${reason}\` — ${n} rows`)
  say()
  say('| branch | code | model | missing | what the site gave |')
  say('|---|---|---|---|---|')
  for (const row of flagged) {
    const gave = [row.brand && `marca ${row.brand}`, row.color && `color ${row.color}`,
      row.images.length && `${row.images.length} fotos`, row.categories.join(' / ')].filter(Boolean).join(' · ')
    say(`| \`${row.store}\` | \`${row.code}\` | ${row.name} | ${row.review.join(', ')} | ${gave || '—'} |`)
  }
  say()
}

if (rejected.length > 0) {
  say('## Rejected')
  say()
  say('A missing price is no longer a rejection. The only thing that still is, is a product the')
  say('site gives no name for: there would be nothing to show the bride and nothing to search.')
  say()
  say('| id | permalink | why |')
  say('|---|---|---|')
  for (const r of rejected) say(`| ${r.source_id} | ${r.permalink ?? '—'} | ${r.problems.join('; ')} |`)
  say()
}
if (collisions.length > 0) {
  say('## Duplicate codes')
  say()
  say('The code is unique per branch, so only the first row is written.')
  say()
  say('| branch | code | kept | dropped |')
  say('|---|---|---|---|')
  for (const c of collisions) {
    say(`| \`${c.store}\` | \`${c.product.code}\` | ${c.first.name} (${c.first.source_id}) | ${c.product.name} (${c.product.source_id}) |`)
  }
  say()
}

say('## Codes')
say()
const fromCount = (from) => usable.filter((p) => p.code_from === from).length
say('`items.code` is what the seller types to search and what is written on paper — `p139`, `A12`,')
say('`s14`, `madelyn`. It is taken, in this order:')
say()
say(`1. the site's **SKU**, when there is one — ${fromCount('sku')} products;`)
say(`2. otherwise the **model name**, lowercased, with a leading "Vestido" dropped — ${fromCount('name')} products;`)
say(`3. otherwise a visible \`s/n-\` placeholder, flagged \`code\` — ${fromCount('placeholder')} products.`)
say()
say('The website slug and the WooCommerce id are never passed off as a code. A placeholder row')
say('stays flagged until she types the code on the tag, and the flag clears itself when she does.')
say()

say('## Images')
say()
if (!wantImages) {
  say('_Not run with `--images`, so nothing was downloaded._')
  const total = usable.reduce((n, p) => n + Math.min(p.images.length, 5), 0)
  say(`The site offers ${total} images for these products (five per item at most).`)
} else {
  say(`Downloaded and re-encoded: **${imageReport.downloaded}**, from ${bytes(imageReport.bytesIn)} to ${bytes(imageReport.bytesOut)}.`)
  if (imageReport.reused > 0) say(`Another ${imageReport.reused} were already on disk and were left alone.`)
  say(`Tablet limits: ${TARGET.maxEdge} px, WebP, <=${bytes(TARGET.maxBytes)}.`)
  say()
  say(`\`${MANIFEST}\` lists ${uploads.length} uploads as \`local<TAB>r2key\`. A product in both`)
  say('catalogs is uploaded twice, once per branch, because a file row belongs to one branch.')
  say()
  if (imageReport.tooBig.length > 0) {
    say(`${imageReport.tooBig.length} images are still over the cap with quality at the floor; they are kept anyway.`)
    say()
  }
  if (imageReport.failed.length > 0) {
    say('### Could not be downloaded')
    say()
    say('| code | why |')
    say('|---|---|')
    for (const f of imageReport.failed) say(`| \`${f.code}\` | ${f.why} |`)
    say()
  }
}
say()

// ─────────────────────────────────────────────────────────────────── sql ──
const sql = []
sql.push('-- Generated by scripts/import/catalog.mjs. Do not edit by hand.')
sql.push('-- Apply to the LOCAL database only until the report has been reviewed:')
sql.push('--   npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/catalog.sql')
sql.push('--')
sql.push('-- Every statement is INSERT OR IGNORE, so re-running it changes nothing that is')
sql.push('-- already there: items already carrying the same code in the same branch are left')
sql.push('-- alone, and so are edits she has since made to them.')
for (const row of rows) {
  sql.push('')
  sql.push(`-- ${row.store} · ${row.permalink ?? row.source_id}`)
  sql.push('INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, color,')
  sql.push('                            price_cents, notes, intake_date, needs_review, review_fields)')
  sql.push(`  VALUES ('${row.store}', ${q(row.code)}, '${row.kind}', 'pedido', 'nuevo', ${q(row.name)}, ${q(row.brand)}, ${q(row.color)},`)
  sql.push(`          ${row.price_cents}, ${q(`importado del sitio · ${row.categories.join(', ')}`)}, date('now'),`)
  sql.push(`          ${row.review.length > 0 ? 1 : 0}, ${row.review.length > 0 ? q(row.review.join(',')) : 'NULL'});`)
  for (const f of row.files ?? []) {
    sql.push('INSERT OR IGNORE INTO files (id, store_id, kind, r2_key, mime, bytes, width, height, created_by)')
    sql.push(`  SELECT ${q(f.id)}, '${row.store}', 'item_photo', ${q(f.key)}, 'image/webp', ${f.bytes}, ${f.width}, ${f.height}, u.id`)
    sql.push(`    FROM users u WHERE u.store_id = '${row.store}' AND u.role = 'owner' ORDER BY u.id LIMIT 1;`)
    sql.push('INSERT OR IGNORE INTO item_photos (item_id, file_id, sort, is_primary)')
    sql.push(`  SELECT i.id, ${q(f.id)}, ${f.primary ? 0 : 1}, ${f.primary ? 1 : 0} FROM items i`)
    sql.push(`   WHERE i.store_id = '${row.store}' AND i.code = ${q(row.code)};`)
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/catalog.md`, lines.join('\n'))
writeFileSync(`${OUT}/catalog.sql`, sql.join('\n'))
if (wantImages) writeFileSync(MANIFEST, uploads.map((u) => `${u.local}\t${u.key}`).join('\n') + '\n')
console.log(`report   → ${OUT}/catalog.md`)
console.log(`sql      → ${OUT}/catalog.sql   (${rows.length} rows: ${STORES.map((s) => `${s} ${storeRows(s).length}`).join(', ')})`)
if (wantImages) console.log(`manifest → ${MANIFEST}   (${uploads.length} uploads)`)
