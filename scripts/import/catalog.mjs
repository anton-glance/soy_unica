#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { toItem } from './map-product.mjs'

/**
 * Importación del catálogo de soyunicanovias.com a la sucursal de Monterrey.
 *
 * Lee la Store API pública de WooCommerce —`/wp-json/wc/store/v1/products`—,
 * que no pide llave. Baja las imágenes, las vuelve a codificar con los mismos
 * límites de la tableta (1600 px, WebP, ≤300 KB) y las guarda en R2 con su
 * renglón en `files`. Nada de enlazar a las imágenes del sitio: si mañana se
 * cae o cambian de hosting, el kiosco se queda sin fotos.
 *
 * Igual que la del libro de pagos, no escribe en ninguna base: produce el
 * reporte y un `.sql` que se aplica a mano y sólo a la base local.
 *
 * Uso:
 *   node scripts/import/catalog.mjs --fetch      baja el catálogo a docs/import/catalog-raw.json
 *   node scripts/import/catalog.mjs              lee ese archivo y produce reporte + sql
 *   node scripts/import/catalog.mjs --images     además baja y recodifica las imágenes
 */

const BASE = 'https://soyunicanovias.com/wp-json/wc/store/v1/products'
const STORE = 'mty'
const OUT = 'docs/import'
const RAW = `${OUT}/catalog-raw.json`
const IMAGES = `${OUT}/catalog-images`

/** Los mismos límites que src/lib/image.ts usa en la tableta. */
const TARGET = { maxEdge: 1600, startQuality: 72, minQuality: 40, maxBytes: 300 * 1024 }

const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

// ──────────────────────────────────────────────────────────── bajar ──
async function fetchAll() {
  const products = []
  for (let page = 1; page <= 100; page++) {
    const url = `${BASE}?per_page=100&page=${page}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`)
    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) break
    products.push(...batch)
    process.stdout.write(`\rpágina ${page}: ${products.length} productos`)
    if (batch.length < 100) break
  }
  process.stdout.write('\n')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(RAW, JSON.stringify(products, null, 2))
  return products
}

// ─────────────────────────────────────────────────────────── imágenes ──
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
  // El mismo escalonado de calidad que la tableta: se baja hasta caber.
  for (let quality = TARGET.startQuality; quality >= TARGET.minQuality; quality -= 8) {
    const out = await resized.clone().webp({ quality }).toBuffer()
    if (out.length <= TARGET.maxBytes || quality === TARGET.minQuality) {
      const m = await sharp(out).metadata()
      return { buffer: out, quality, width: m.width, height: m.height, tooBig: out.length > TARGET.maxBytes }
    }
  }
  throw new Error('inalcanzable')
}

// ──────────────────────────────────────────────────────────────── main ──
const wantFetch = process.argv.includes('--fetch')
const wantImages = process.argv.includes('--images')

let raw
if (wantFetch) {
  raw = await fetchAll()
} else if (existsSync(RAW)) {
  raw = JSON.parse(readFileSync(RAW, 'utf8'))
} else {
  console.error(`No existe ${RAW}. Corre primero:  node scripts/import/catalog.mjs --fetch`)
  console.error('(hace falta salida a soyunicanovias.com)')
  process.exit(1)
}

const items = raw.map(toItem)
const good = items.filter((i) => i.problems.length === 0)
const rejected = items.filter((i) => i.problems.length > 0)

// Dos productos del sitio con el mismo código serían dos artículos con el
// mismo código, y el código es único por sucursal.
const byCode = new Map()
const collisions = []
for (const item of good) {
  if (byCode.has(item.code)) collisions.push({ item, first: byCode.get(item.code) })
  else byCode.set(item.code, item)
}
const importable = [...byCode.values()]

let imageReport = { downloaded: 0, bytesIn: 0, bytesOut: 0, failed: [], tooBig: [] }
if (wantImages) {
  mkdirSync(IMAGES, { recursive: true })
  for (const item of importable) {
    item.files = []
    for (const [i, img] of item.images.slice(0, 5).entries()) {
      try {
        const res = await fetch(img.src)
        if (!res.ok) throw new Error(`${res.status}`)
        const input = Buffer.from(await res.arrayBuffer())
        const out = await encode(input)
        const id = `${item.code.replace(/[^a-zA-Z0-9]/g, '')}-${i}`
        writeFileSync(`${IMAGES}/${id}.webp`, out.buffer)
        item.files.push({ id, bytes: out.buffer.length, width: out.width, height: out.height, primary: i === 0 })
        imageReport.downloaded++
        imageReport.bytesIn += input.length
        imageReport.bytesOut += out.buffer.length
        if (out.tooBig) imageReport.tooBig.push({ code: item.code, bytes: out.buffer.length })
      } catch (err) {
        imageReport.failed.push({ code: item.code, src: img.src, why: String(err.message ?? err) })
      }
    }
    process.stdout.write(`\rimágenes: ${imageReport.downloaded}`)
  }
  process.stdout.write('\n')
}

// ───────────────────────────────────────────────────────────── reporte ──
const lines = []
const say = (s = '') => lines.push(s)
say('# Importación del catálogo — soyunicanovias.com')
say()
say(`Origen: \`${BASE}\`. Sucursal destino: \`${STORE}\`.`)
say('**Nada de esto se ha escrito en ninguna base.**')
say()
say('## Resumen')
say()
say('| | productos |')
say('|---|---|')
say(`| encontrados en el sitio | ${items.length} |`)
say(`| importables | **${importable.length}** |`)
say(`| rechazados | ${rejected.length} |`)
say(`| códigos repetidos | ${collisions.length} |`)
say()
const dresses = importable.filter((i) => i.kind === 'dress').length
say(`De los importables, ${dresses} vestidos y ${importable.length - dresses} accesorios.`)
say('Todos entran como **por pedido**: las banderas de existencias del sitio no son de fiar y')
say('decir que hay una unidad física que quizá no exista es peor que lo contrario. Talla, costo')
say('y condición quedan vacíos —el sitio no los trae— y se llenan en Inventario.')
say()

if (rejected.length > 0) {
  say('## Rechazados')
  say()
  say('| id | nombre | por qué |')
  say('|---|---|---|')
  for (const r of rejected) say(`| ${r.source_id} | ${r.name || '—'} | ${r.problems.join('; ')} |`)
  say()
}
if (collisions.length > 0) {
  say('## Códigos repetidos')
  say()
  say('El código es único por sucursal, así que sólo entra el primero.')
  say()
  say('| código | se queda | se descarta |')
  say('|---|---|---|')
  for (const c of collisions) say(`| \`${c.item.code}\` | ${c.first.name} (${c.first.source_id}) | ${c.item.name} (${c.item.source_id}) |`)
  say()
}

say('## Imágenes')
say()
if (!wantImages) {
  say('_No se corrió con `--images`, así que no se bajó ninguna._')
  const total = importable.reduce((n, i) => n + Math.min(i.images.length, 5), 0)
  say(`El sitio ofrece ${total} imágenes para estos productos (máximo cinco por artículo).`)
} else {
  say(`Bajadas y recodificadas: **${imageReport.downloaded}**, de ${bytes(imageReport.bytesIn)} a ${bytes(imageReport.bytesOut)}.`)
  say(`Límites de la tableta: ${TARGET.maxEdge} px, WebP, ≤${bytes(TARGET.maxBytes)}.`)
  say()
  say('### Proyección de almacenamiento')
  say()
  say(`- lo que agrega esta importación: **${bytes(imageReport.bytesOut)}**`)
  say(`- promedio por imagen: ${bytes(Math.round(imageReport.bytesOut / Math.max(imageReport.downloaded, 1)))}`)
  say()
  if (imageReport.tooBig.length > 0) {
    say(`${imageReport.tooBig.length} imágenes siguen pasadas del tope con la calidad al piso; se guardan igual.`)
    say()
  }
  if (imageReport.failed.length > 0) {
    say('### No se pudieron bajar')
    say()
    say('| código | por qué |')
    say('|---|---|')
    for (const f of imageReport.failed) say(`| \`${f.code}\` | ${f.why} |`)
    say()
  }
}
say()

// ───────────────────────────────────────────────────────────────── sql ──
const sql = []
sql.push('-- Generado por scripts/import/catalog.mjs. NO editar a mano.')
sql.push('-- Aplicar SÓLO a la base local hasta que el reporte esté revisado:')
sql.push('--   npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/catalog.sql')
sql.push('--')
sql.push('-- Los artículos que ya existan con el mismo código no se tocan.')
for (const item of importable) {
  sql.push('')
  sql.push(`-- ${item.permalink ?? item.source_id}`)
  sql.push(`INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, color, price_cents, notes, intake_date)`)
  sql.push(`  VALUES ('${STORE}', ${q(item.code)}, '${item.kind}', 'pedido', 'nuevo', ${q(item.name)}, ${q(item.brand)},`)
  sql.push(`          ${q(item.color)}, ${item.price_cents}, ${q(`importado del sitio · ${item.categories.join(', ')}`)}, date('now'));`)
  for (const f of item.files ?? []) {
    sql.push(`INSERT OR IGNORE INTO files (id, store_id, kind, r2_key, mime, bytes, width, height, created_by)`)
    sql.push(`  SELECT ${q(f.id)}, '${STORE}', 'item_photo', ${q(`${STORE}/item_photo/${f.id}.webp`)}, 'image/webp', ${f.bytes}, ${f.width}, ${f.height}, u.id`)
    sql.push(`    FROM users u WHERE u.store_id = '${STORE}' AND u.role = 'owner' ORDER BY u.id LIMIT 1;`)
    sql.push(`INSERT OR IGNORE INTO item_photos (item_id, file_id, sort, is_primary)`)
    sql.push(`  SELECT i.id, ${q(f.id)}, 0, ${f.primary ? 1 : 0} FROM items i WHERE i.store_id='${STORE}' AND i.code = ${q(item.code)};`)
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/catalog.md`, lines.join('\n'))
writeFileSync(`${OUT}/catalog.sql`, sql.join('\n'))
console.log(`reporte  → ${OUT}/catalog.md`)
console.log(`sql      → ${OUT}/catalog.sql   (${importable.length} artículos)`)
