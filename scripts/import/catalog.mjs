#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  toItem, ACCESSORY_CATEGORIES, CUT_CATEGORIES, LIQUIDATION_CATEGORY, PROMO_CATEGORY, RENTAL_CATEGORY,
} from './map-product.mjs'

/**
 * Imports the soyunicanovias.com catalog into Monterrey.
 *
 * Reads the public WooCommerce Store API — `/wp-json/wc/store/v1/products` —
 * which needs no key. Downloads the images, re-encodes them with the same
 * limits the tablet uses (1600 px, WebP, <=300 KB) and writes them next to a
 * manifest that says which R2 key each one belongs under. Nothing links to the
 * site's own images: if it goes down or moves host tomorrow, the kiosk would be
 * left with no photos.
 *
 * This catalog is Monterrey's alone. Its 200 products carry no branch signal
 * anywhere — no category, no tag, no field of any kind names CDMX or
 * Monterrey — so everything here goes into `mty`, and CDMX's catalog has to be
 * built from wherever CDMX's actual data lives. See `--categories` below.
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
const STORE = 'mty'
const OUT = 'docs/import'
const RAW = `${OUT}/catalog-raw.json`
const IMAGES = `${OUT}/catalog-images`
const MANIFEST = `${OUT}/catalog-r2.tsv`

/** The same limits src/lib/image.ts uses on the tablet. */
const TARGET = { maxEdge: 1600, startQuality: 72, minQuality: 40, maxBytes: 300 * 1024 }

const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const pesos = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const plural = (n, one, many) => (n === 1 ? one : many)

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
 * The category census. There is no branch signal in this catalog at all — this
 * printout is for checking what field, if any, each category feeds: kind, cut,
 * condition, the promo note, or an outright exclusion (rentals).
 */
const census = new Map()
for (const product of raw) {
  const cats = product.categories ?? []
  if (cats.length === 0) {
    const row = census.get('(sin categorizar)') ?? { name: '(sin categorizar)', n: 0 }
    row.n++
    census.set('(sin categorizar)', row)
    continue
  }
  for (const c of cats) {
    const name = String(c.name ?? '').replace(/<[^>]*>/g, '').trim()
    if (!name) continue
    const row = census.get(name) ?? { name, n: 0 }
    row.n++
    census.set(name, row)
  }
}
const fieldFor = (name) => {
  if (name === '(sin categorizar)') return 'flagged for review — no data to categorize from'
  if (RENTAL_CATEGORY.test(name)) return 'excluded — rental, out of scope'
  if (ACCESSORY_CATEGORIES.test(name)) return 'kind = accessory'
  if (/^vestidos de novia$/i.test(name)) return 'kind = dress'
  const cut = CUT_CATEGORIES.find((rule) => rule.test.test(name))
  if (cut) return `cut = ${cut.cut}`
  if (LIQUIDATION_CATEGORY.test(name)) return 'condition = liquidacion'
  if (PROMO_CATEGORY.test(name)) return 'note only (promotion) — price and condition untouched'
  return '— not used'
}
const categoryRows = [...census.values()].sort((a, b) => b.n - a.n).map((row) => ({ ...row, field: fieldFor(row.name) }))

if (wantCategories) {
  console.log(`${raw.length} products, ${categoryRows.length} categories\n`)
  for (const row of categoryRows) console.log(`${String(row.n).padStart(4)}  ${row.name.padEnd(42)} → ${row.field}`)
  process.exit(0)
}

const mapped = raw.map(toItem)
const rejected = mapped.filter((p) => p.problems.length > 0)
const excluded = mapped.filter((p) => p.problems.length === 0 && p.excluded)
const candidates = mapped.filter((p) => p.problems.length === 0 && !p.excluded)

/* The code is unique per branch (there is only one branch here). */
const rows = []
const collisions = []
const seen = new Map()
for (const product of candidates) {
  if (seen.has(product.code)) { collisions.push({ product, first: seen.get(product.code) }); continue }
  const row = { ...product, store: STORE }
  seen.set(product.code, row)
  rows.push(row)
}

// Images are downloaded once per product.
let imageReport = { downloaded: 0, reused: 0, bytesIn: 0, bytesOut: 0, failed: [], tooBig: [] }
const shots = new Map()
if (wantImages) {
  mkdirSync(IMAGES, { recursive: true })
  for (const product of candidates) {
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
const flagged = rows.filter((r) => r.review.length > 0)
const dresses = rows.filter((r) => r.kind === 'dress').length

say('# Catalog import — soyunicanovias.com')
say()
say(`Source: \`${BASE}\`. Destination branch: \`${STORE}\`.`)
say('**None of this has been written to any database.**')
say()
say('## CDMX is not in this catalog')
say()
say('Checked directly against the raw JSON: `tags` is empty on every product, permalinks encode')
say('category rather than branch (`producto/vestidos-de-novia/corte-princesa/hanna`), and none of')
say('the 14 categories names a branch. There is no signal here to split on, so every row in this')
say('import goes into **`mty`**. CDMX starts empty and its catalog has to be built from wherever')
say('CDMX\'s actual data lives — this endpoint does not carry it.')
say()
say('## Summary')
say()
say('| | |')
say('|---|---|')
say(`| products on the site | ${mapped.length} |`)
say(`| rejected outright | ${rejected.length} |`)
say(`| excluded (rentals, out of scope) | ${excluded.length} |`)
say(`| inventory rows to write | **${rows.length}** — ${dresses} ${plural(dresses, 'dress', 'dresses')}, ` +
  `${rows.length - dresses} ${plural(rows.length - dresses, 'accessory', 'accessories')} |`)
say(`| of those, flagged for review | ${flagged.length} |`)
say(`| duplicate codes | ${collisions.length} |`)
say(`| catalog value | ${pesos(rows.reduce((n, r) => n + r.price_cents, 0))} |`)
say()
say('Everything comes in as **made to order**: the site\'s stock flags are not trustworthy and')
say('claiming a physical unit that may not exist is worse than the reverse. Size and cost stay')
say('empty on purpose — a made-to-order dress is cut to the bride\'s measurements and was never')
say('bought up front — so neither counts as a gap.')
say()

say('## What the categories are used for')
say()
say('Read directly off each product\'s categories, checked against the site\'s own census:')
say()
say('| products | category | used for |')
say('|---|---|---|')
for (const row of categoryRows) say(`| ${row.n} | ${row.name} | ${row.field} |`)
say()

if (excluded.length > 0) {
  say(`## Excluded — ${excluded.length} ${plural(excluded.length, 'rental', 'rentals')}`)
  say()
  say('Renting a coat is not selling a dress: out of scope for this shop\'s inventory. Excluded')
  say('rather than imported or rejected, and listed here so nobody wonders where they went.')
  say()
  say('| id | model | categories |')
  say('|---|---|---|')
  for (const p of excluded) say(`| ${p.source_id} | ${p.name} | ${p.categories.join(', ') || '—'} |`)
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
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) say(`- \`${reason}\` — ${n} ${plural(n, 'row', 'rows')}`)
  say()
  const categoryFlagged = flagged.filter((r) => r.review.includes('category'))
  if (categoryFlagged.length > 0) {
    say(`\`category\` means the product carried no categories at all — ${categoryFlagged.length} of them —`)
    say('so kind, cut and condition could not be read off anything. They come in as a dress by')
    say('default; a person needs to look at each one and correct kind, cut and condition by hand.')
    say('This is not tracked by the app\'s own `needs_review` recompute (it only knows price, code,')
    say('size, cost and condition), so once she opens one of these and saves, the flag can clear even')
    say('if kind or cut is still wrong — check them here, once, before that happens:')
    say()
    say('| code | model |')
    say('|---|---|')
    for (const r of categoryFlagged) say(`| \`${r.code}\` | ${r.name} |`)
    say()
  }
  say('| code | model | kind | missing | what the site gave |')
  say('|---|---|---|---|---|')
  for (const row of flagged) {
    const gave = [row.brand && `marca ${row.brand}`, row.color && `color ${row.color}`,
      row.images.length && `${row.images.length} fotos`, row.categories.join(' / ')].filter(Boolean).join(' · ')
    say(`| \`${row.code}\` | ${row.name} | ${row.kind} | ${row.review.join(', ')} | ${gave || '—'} |`)
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
  say('The code is unique, so only the first row is written.')
  say()
  say('| code | kept | dropped |')
  say('|---|---|---|')
  for (const c of collisions) {
    say(`| \`${c.product.code}\` | ${c.first.name} (${c.first.source_id}) | ${c.product.name} (${c.product.source_id}) |`)
  }
  say()
}

say('## Codes')
say()
const fromCount = (from) => candidates.filter((p) => p.code_from === from).length
say('`items.code` is what the seller types to search and what is written on paper — `p139`, `A12`,')
say('`s14`, `madelyn`. It is taken, in this order:')
say()
say(`1. the site's **SKU**, when there is one — ${fromCount('sku')} products. Checked against the raw`)
say('   JSON directly: these are her own numbering (`P21`, `P33`, `P42`, ...) and the same codes that')
say('   already appear in the payment ledger, so these are the highest-value codes in this import;')
say(`2. otherwise the **model name**, lowercased, with a leading "Vestido" dropped — ${fromCount('name')} products;`)
say(`3. otherwise a visible \`s/n-\` placeholder, flagged \`code\` — ${fromCount('placeholder')} products.`)
say()
say('The website slug and the WooCommerce id are never passed off as a code. A placeholder row')
say('stays flagged until she types the code on the tag, and the flag clears itself when she does.')
say()

const promoCount = rows.filter((r) => r.promo).length
if (promoCount > 0) {
  say('## Promotion note')
  say()
  say(`${promoCount} ${plural(promoCount, 'product carries', 'products carry')} the site's "Bridal Sale -20%" category. That is a promotion, not`)
  say('a fact about the garment, so it never touches `price_cents` or `condition` — it is recorded as')
  say('a note on the item instead, for the owner to act on or ignore as she likes.')
  say()
}

say('## Images')
say()
if (!wantImages) {
  say('_Not run with `--images`, so nothing was downloaded._')
  const total = candidates.reduce((n, p) => n + Math.min(p.images.length, 5), 0)
  say(`The site offers ${total} images for these products (five per item at most).`)
} else {
  say(`Downloaded and re-encoded: **${imageReport.downloaded}**, from ${bytes(imageReport.bytesIn)} to ${bytes(imageReport.bytesOut)}.`)
  if (imageReport.reused > 0) say(`Another ${imageReport.reused} were already on disk and were left alone.`)
  say(`Tablet limits: ${TARGET.maxEdge} px, WebP, <=${bytes(TARGET.maxBytes)}.`)
  say()
  say(`\`${MANIFEST}\` lists ${uploads.length} uploads as \`local<TAB>r2key\`.`)
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
sql.push('-- already there: items already carrying the same code are left alone, and so are')
sql.push('-- edits she has since made to them.')
for (const row of rows) {
  const notes = [`importado del sitio · ${row.categories.join(', ') || 'sin categoría'}`]
  if (row.promo) notes.push('promoción sitio: Bridal Sale -20%')
  sql.push('')
  sql.push(`-- ${row.permalink ?? row.source_id}`)
  sql.push('INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, cut, color,')
  sql.push('                            price_cents, notes, intake_date, needs_review, review_fields)')
  sql.push(`  VALUES ('${row.store}', ${q(row.code)}, '${row.kind}', 'pedido', '${row.condition}', ${q(row.name)}, ${q(row.brand)}, ${q(row.cut)}, ${q(row.color)},`)
  sql.push(`          ${row.price_cents}, ${q(notes.join(' · '))}, date('now'),`)
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
console.log(`sql      → ${OUT}/catalog.sql   (${rows.length} rows into ${STORE})`)
if (wantImages) console.log(`manifest → ${MANIFEST}   (${uploads.length} uploads)`)
