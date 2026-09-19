#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  toItem, assignStores, ACCESSORY_CATEGORIES, CUT_CATEGORIES, LIQUIDATION_CATEGORY, PROMO_CATEGORY, RENTAL_CATEGORY,
} from './map-product.mjs'
import { parseSwoofListing, reconcileListings, slugifyCategory } from './swoof.mjs'
import { verifyAgainstMigratedDatabase } from './verify-sql.mjs'

/**
 * Imports the soyunicanovias.com catalog into both branches.
 *
 * Reads the public WooCommerce Store API — `/wp-json/wc/store/v1/products` —
 * which needs no key, for the product data itself. Downloads the images,
 * re-encodes them with the same limits the tablet uses (1600 px, WebP,
 * <=300 KB) and writes them next to a manifest that says which R2 key each
 * one belongs under. Nothing links to the site's own images: if it goes
 * down or moves host tomorrow, the kiosk would be left with no photos.
 *
 * The branch is not on the product at all — checked directly against the raw
 * JSON, `tags` is empty on every product and none of the categories names a
 * branch — so it comes from a second source: the site's own SWOOF-filtered
 * listing pages, one per branch, which is the only place a customer can see
 * which store carries which model. See `--fetch-locations` below.
 *
 * A model the site lists for both branches produces one row in each — two
 * independent rows, never linked afterward, each with its own price, status
 * and photos. That duplication is deliberate: the two stores are physically
 * separate, and the site hides the price on a shared model specifically so
 * a bride in one city can't compare it against the other.
 *
 * Like the ledger importer, it writes to no database: it produces the
 * report, a `.sql` applied by hand, and the image manifest.
 *
 * Usage:
 *   node scripts/import/catalog.mjs --fetch             download the catalog to docs/import/catalog-raw.json
 *   node scripts/import/catalog.mjs --fetch-locations   download the SWOOF listings to docs/import/locations-raw.json
 *   node scripts/import/catalog.mjs                     read both files and produce report + sql
 *   node scripts/import/catalog.mjs --images            also download and re-encode the images
 *   node scripts/import/catalog.mjs --categories        print the site's category census and stop
 *
 * The first two flags can be combined in one run: `--fetch --fetch-locations --images`.
 */

const API_BASE = 'https://soyunicanovias.com/wp-json/wc/store/v1/products'
const SWOOF_BASE = 'https://soyunicanovias.com/tienda/swoof'
const OUT = 'docs/import'
const RAW = `${OUT}/catalog-raw.json`
const LOCATIONS_RAW = `${OUT}/locations-raw.json`
const IMAGES = `${OUT}/catalog-images`
const MANIFEST = `${OUT}/catalog-r2.tsv`

/**
 * The site's own two location terms, and the store each one is. Checked
 * against the URLs the owner gave directly:
 *   .../location-ciudad-de-mexico/product_cat-vestidos-de-novia/  → 77 dresses
 *   .../location-monterrey/product_cat-vestidos-de-novia/
 */
const STORES = [
  { key: 'mty', slug: 'monterrey', label: 'Monterrey' },
  { key: 'cdmx', slug: 'ciudad-de-mexico', label: 'Ciudad de México' },
]

/** The same limits src/lib/image.ts uses on the tablet. */
const TARGET = { maxEdge: 1600, startQuality: 72, minQuality: 40, maxBytes: 300 * 1024 }

const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const pesos = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const plural = (n, one, many) => (n === 1 ? one : many)

// ────────────────────────────────────────────────────────────── download ──
async function fetchAllProducts() {
  const products = []
  for (let page = 1; page <= 100; page++) {
    const url = `${API_BASE}?per_page=100&page=${page}`
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

// ──────────────────────────────────────────────────────────── locations ──
async function fetchSwoofPage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`)
  return res.text()
}

/** One filtered listing, every page of it, stopping at the site's own "next" link. */
async function fetchSwoofListing(url) {
  const permalinks = new Set()
  let reportedTotal = null
  const pages = []
  for (let page = 1; page <= 50; page++) {
    const pageUrl = page === 1 ? url : `${url.replace(/\/$/, '')}/page/${page}/`
    const html = await fetchSwoofPage(pageUrl)
    const parsed = parseSwoofListing(html, pageUrl)
    pages.push({ url: pageUrl, found: parsed.permalinks.length, reportedTotal: parsed.reportedTotal })
    if (reportedTotal === null) reportedTotal = parsed.reportedTotal
    for (const p of parsed.permalinks) permalinks.add(p)
    if (parsed.permalinks.length === 0 || !parsed.hasNextPage) break
    if (page === 50) throw new Error(`${url}: still on a "next" page after 50 — something is wrong, stopping rather than looping forever`)
  }
  return { permalinks: [...permalinks], reportedTotal, pages }
}

/**
 * For each branch: the un-filtered `location-X/` listing on its own, and
 * every `location-X/product_cat-Y/` listing summed together, for every
 * category the already-fetched catalog actually has — "every category, not
 * just dresses". The two are reconciled rather than one being trusted; see
 * `reconcileListings` in `swoof.mjs`.
 */
async function fetchAllLocations(raw) {
  const categories = new Map()
  for (const product of raw) {
    for (const c of product.categories ?? []) {
      const slug = c.slug || slugifyCategory(c.name)
      if (slug) categories.set(slug, c.name)
    }
  }

  const locations = {}
  for (const store of STORES) {
    process.stdout.write(`\n${store.label}:\n`)
    const direct = await fetchSwoofListing(`${SWOOF_BASE}/location-${store.slug}/`)
    process.stdout.write(`  (todas las categorías) — ${direct.permalinks.length} encontrados, el sitio dice ${direct.reportedTotal ?? '?'}\n`)

    const byCategory = new Map()
    for (const [slug, name] of categories) {
      const listing = await fetchSwoofListing(`${SWOOF_BASE}/location-${store.slug}/product_cat-${slug}/`)
      byCategory.set(slug, listing)
      process.stdout.write(`  ${name} — ${listing.permalinks.length} encontrados, el sitio dice ${listing.reportedTotal ?? '?'}\n`)
    }

    const reconciled = reconcileListings(direct, byCategory)
    locations[store.key] = {
      direct: { reportedTotal: direct.reportedTotal, found: direct.permalinks.length, pages: direct.pages },
      byCategory: [...byCategory.entries()].map(([slug, l]) => ({
        slug, name: categories.get(slug), reportedTotal: l.reportedTotal, found: l.permalinks.length, pages: l.pages,
      })),
      permalinks: [...reconciled.permalinks],
      onlyInDirect: reconciled.onlyInDirect,
      onlyInCategories: reconciled.onlyInCategories,
      agrees: reconciled.agrees,
    }
  }
  return locations
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
const wantFetchLocations = process.argv.includes('--fetch-locations')
const wantImages = process.argv.includes('--images')
const wantCategories = process.argv.includes('--categories')

let raw
if (wantFetch) {
  raw = await fetchAllProducts()
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

let locations
if (wantFetchLocations) {
  locations = await fetchAllLocations(raw)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(LOCATIONS_RAW, JSON.stringify(locations, null, 2))
} else if (existsSync(LOCATIONS_RAW)) {
  locations = JSON.parse(readFileSync(LOCATIONS_RAW, 'utf8'))
} else {
  console.error(`${LOCATIONS_RAW} does not exist. Run this first:  node scripts/import/catalog.mjs --fetch-locations`)
  console.error('(needs outbound access to soyunicanovias.com)')
  process.exit(1)
}

const locationSets = new Map(STORES.map((s) => [s.key, new Set(locations[s.key]?.permalinks ?? [])]))

const mapped = raw.map(toItem)
const rejected = mapped.filter((p) => p.problems.length > 0)
const excluded = mapped.filter((p) => p.problems.length === 0 && p.excluded)
const candidates = mapped.filter((p) => p.problems.length === 0 && !p.excluded)

const { rows, collisions, noLocation } = assignStores(candidates, locationSets)

// Images are downloaded once per product, regardless of how many branches it lands in.
let imageReport = { downloaded: 0, reused: 0, bytesIn: 0, bytesOut: 0, failed: [], tooBig: [] }
const shots = new Map()
if (wantImages) {
  mkdirSync(IMAGES, { recursive: true })
  const bySourceId = new Map()
  for (const row of rows) if (!bySourceId.has(row.source_id)) bySourceId.set(row.source_id, row)
  for (const product of bySourceId.values()) {
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
  // Each branch gets its own copy of the same bytes, under its own R2 key and
  // its own `files.id` — a photo swapped on the Monterrey row must never
  // touch the CDMX one.
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

say('# Catalog import — soyunicanovias.com')
say()
say(`Source: \`${API_BASE}\` for the products, \`${SWOOF_BASE}\` for which branch carries which.`)
say('**None of this has been written to any database.**')
say()

say('## Where the branch comes from')
say()
say('Checked directly against the raw JSON: `tags` is empty on every product, permalinks encode')
say('category rather than branch (`producto/vestidos-de-novia/corte-princesa/hanna`), and none of')
say('the categories names a branch. The Store API has no location field anywhere on a product.')
say()
say('The site\'s own SWOOF-filtered listing pages are the only place that signal exists — the same')
say('pages a bride sees when she filters the shop by store. Two are fetched per branch: the')
say('un-filtered `location-X/` listing on its own, and every `location-X/product_cat-Y/` listing')
say('for every category this catalog has, summed together. They should describe the same set of')
say('products; where they disagree, both sides go into the union rather than one being trusted, and')
say('the disagreement is reported below.')
say()
for (const store of STORES) {
  const loc = locations[store.key]
  if (!loc) continue
  say(`**${store.label}** — direct listing: ${loc.direct.found} found, site says ${loc.direct.reportedTotal ?? '—'}.`)
  if (!loc.agrees) {
    say(`  Disagrees with the per-category sum: ${loc.onlyInDirect.length} only in the direct listing,`)
    say(`  ${loc.onlyInCategories.length} only found via a category. Both are kept.`)
  } else {
    say('  Agrees exactly with the per-category sum.')
  }
}
say()
say('| branch | category | found | site says |')
say('|---|---|---|---|')
for (const store of STORES) {
  const loc = locations[store.key]
  if (!loc) continue
  say(`| ${store.label} | *(todas)* | ${loc.direct.found} | ${loc.direct.reportedTotal ?? '—'} |`)
  for (const cat of loc.byCategory) say(`| ${store.label} | ${cat.name} | ${cat.found} | ${cat.reportedTotal ?? '—'} |`)
}
say()

say('## Summary')
say()
say('| | |')
say('|---|---|')
say(`| products on the site | ${mapped.length} |`)
say(`| rejected outright | ${rejected.length} |`)
say(`| excluded (rentals, out of scope) | ${excluded.length} |`)
say(`| candidates with no branch signal at all | ${noLocation.length} — not imported into either store |`)
say(`| inventory rows to write | **${rows.length}** across both branches |`)
say(`| of those, the same model in both branches | ${rows.filter((r) => r.shared).length} rows (${rows.filter((r) => r.shared).length / 2} models) |`)
say(`| of those, flagged for review | ${flagged.length} |`)
say(`| duplicate codes within one branch | ${collisions.length} |`)
say(`| catalog value | ${pesos(rows.reduce((n, r) => n + r.price_cents, 0))} |`)
say()
say('Everything comes in as **made to order**: the site\'s stock flags are not trustworthy and')
say('claiming a physical unit that may not exist is worse than the reverse. Size and cost stay')
say('empty on purpose — a made-to-order dress is cut to the bride\'s measurements and was never')
say('bought up front — so neither counts as a gap.')
say()

say('## Per branch')
say()
say('| branch | rows | shared with the other branch | flagged for a missing price | catalog value |')
say('|---|---|---|---|---|')
for (const store of STORES) {
  const storeRows = rows.filter((r) => r.store === store.key)
  const shared = storeRows.filter((r) => r.shared).length
  const priceMissing = storeRows.filter((r) => r.review.includes('price')).length
  say(`| ${store.label} | ${storeRows.length} | ${shared} | ${priceMissing} | ${pesos(storeRows.reduce((n, r) => n + r.price_cents, 0))} |`)
}
say()
say('A shared model does not carry one price: where the site publishes one, both branches get it;')
say('where it publishes none, both branches come in flagged at zero, and the owner sets each')
say('branch\'s real price herself — they are allowed to differ from there on.')
say()

if (noLocation.length > 0) {
  say(`## No branch found — ${noLocation.length} ${plural(noLocation.length, 'product', 'products')}`)
  say()
  say('Neither SWOOF listing, for either branch, ever named this product\'s permalink. Not imported')
  say('into either store rather than guessed into one — check these by hand and re-run once the site')
  say('itself says where they belong.')
  say()
  say('| id | model | permalink |')
  say('|---|---|---|')
  for (const p of noLocation) say(`| ${p.source_id} | ${p.name} | ${p.permalink ?? '—'} |`)
  say()
}

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
  say('`price` is not broken data: the site deliberately hides the price on a model sold in both')
  say('branches, so a bride can\'t compare Monterrey against CDMX. Both rows for that model come in')
  say('flagged, and the owner fills in each branch\'s own price by hand.')
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
    say('| branch | code | model |')
    say('|---|---|---|')
    for (const r of categoryFlagged) say(`| ${r.store} | \`${r.code}\` | ${r.name} |`)
    say()
  }
  say('| branch | code | model | kind | missing | what the site gave |')
  say('|---|---|---|---|---|---|')
  for (const row of flagged) {
    const gave = [row.brand && `marca ${row.brand}`, row.color && `color ${row.color}`,
      row.images.length && `${row.images.length} fotos`, row.categories.join(' / ')].filter(Boolean).join(' · ')
    say(`| ${row.store} | \`${row.code}\` | ${row.name} | ${row.kind} | ${row.review.join(', ')} | ${gave || '—'} |`)
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
  say('The code is unique within a branch, so only the first row for that branch is written.')
  say()
  say('| branch | code | kept | dropped |')
  say('|---|---|---|---|')
  for (const c of collisions) {
    say(`| ${c.store} | \`${c.product.code}\` | ${c.first.name} (${c.first.source_id}) | ${c.product.name} (${c.product.source_id}) |`)
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
say('A shared model uses the exact same code in both branches — that is what makes it recognizable')
say('as the same model later.')
say()

const promoCount = rows.filter((r) => r.promo).length
if (promoCount > 0) {
  say('## Promotion note')
  say()
  say(`${promoCount} ${plural(promoCount, 'row carries', 'rows carry')} the site's "Bridal Sale -20%" category. That is a promotion, not`)
  say('a fact about the garment, so it never touches `price_cents` or `condition` — it is recorded as')
  say('a note on the item instead, for the owner to act on or ignore as she likes.')
  say()
}

say('## Images')
say()
if (!wantImages) {
  say('_Not run with `--images`, so nothing was downloaded._')
  const total = [...shots.keys()].length || new Set(candidates.map((p) => p.source_id)).size
  const imageCount = candidates.reduce((n, p) => n + Math.min(p.images.length, 5), 0)
  say(`The site offers ${imageCount} images across ${total || candidates.length} products (five per item at most, downloaded once and reused for every branch it appears in).`)
} else {
  say(`Downloaded and re-encoded: **${imageReport.downloaded}**, from ${bytes(imageReport.bytesIn)} to ${bytes(imageReport.bytesOut)}.`)
  if (imageReport.reused > 0) say(`Another ${imageReport.reused} were already on disk and were left alone.`)
  say(`Tablet limits: ${TARGET.maxEdge} px, WebP, <=${bytes(TARGET.maxBytes)}.`)
  say()
  say(`\`${MANIFEST}\` lists ${uploads.length} uploads as \`local<TAB>r2key\` — a shared model's photos are`)
  say('listed twice, once per branch, since each branch gets its own independent copy in R2.')
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
sql.push('-- already there: items already carrying the same code IN THAT BRANCH are left')
sql.push('-- alone, and so are edits she has since made to them. A model shared by both')
sql.push('-- branches writes two independent rows, one per store, both with this same code.')
for (const row of rows) {
  const notes = [`importado del sitio · ${row.categories.join(', ') || 'sin categoría'}`]
  if (row.shared) notes.push('modelo compartido con la otra sucursal')
  if (row.promo) notes.push('promoción sitio: Bridal Sale -20%')
  sql.push('')
  sql.push(`-- [${row.store}] ${row.permalink ?? row.source_id}`)
  sql.push('INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, cut, color,')
  sql.push('                            price_cents, notes, intake_date, needs_review, review_fields)')
  sql.push(`  VALUES ('${row.store}', ${q(row.code)}, '${row.kind}', 'pedido', '${row.condition}', ${q(row.name)}, ${q(row.brand)}, ${q(row.cut)}, ${q(row.color)},`)
  sql.push(`          ${row.price_cents}, ${q(notes.join(' · '))}, date('now'),`)
  sql.push(`          ${row.review.length > 0 ? 1 : 0}, ${row.review.length > 0 ? q(row.review.join(',')) : 'NULL'});`)
  // `sort` es el índice real dentro del producto (0, 1, 2…), no sólo
  // «principal o no»: con todas las secundarias empatadas en el mismo
  // número, su orden entre sí quedaba a la suerte de SQLite.
  ;(row.files ?? []).forEach((f, i) => {
    sql.push('INSERT OR IGNORE INTO files (id, store_id, kind, r2_key, mime, bytes, width, height, uploaded_by)')
    sql.push(`  SELECT ${q(f.id)}, '${row.store}', 'item_photo', ${q(f.key)}, 'image/webp', ${f.bytes}, ${f.width}, ${f.height}, u.id`)
    sql.push(`    FROM users u WHERE u.store_id = '${row.store}' AND u.role = 'owner' ORDER BY u.id LIMIT 1;`)
    sql.push('INSERT OR IGNORE INTO item_photos (item_id, file_id, sort, is_primary)')
    sql.push(`  SELECT i.id, ${q(f.id)}, ${i}, ${f.primary ? 1 : 0} FROM items i`)
    sql.push(`   WHERE i.store_id = '${row.store}' AND i.code = ${q(row.code)};`)
  })
}

// ────────────────────────────────────────────────────────────── verify ──
const sqlText = sql.join('\n')
console.log('verifying the generated SQL against a fresh copy of db/migrations…')
try {
  verifyAgainstMigratedDatabase(sqlText)
} catch (err) {
  console.error(`\n✘ ${err.message}\n`)
  console.error('catalog.sql was NOT written. Fix the SQL this script generates and run it again.')
  process.exit(1)
}
console.log('verified — the SQL applies cleanly.\n')

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/catalog.md`, lines.join('\n'))
writeFileSync(`${OUT}/catalog.sql`, sqlText)
if (wantImages) writeFileSync(MANIFEST, uploads.map((u) => `${u.local}\t${u.key}`).join('\n') + '\n')
console.log(`report   → ${OUT}/catalog.md`)
console.log(`sql      → ${OUT}/catalog.sql   (${rows.length} rows across ${STORES.map((s) => s.key).join(', ')})`)
if (wantImages) console.log(`manifest → ${MANIFEST}   (${uploads.length} uploads)`)
