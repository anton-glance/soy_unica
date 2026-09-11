#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs'
import { parsePagos, dedupe } from './parse-pagos.mjs'
import { readWorkbook } from './xlsx.mjs'

/**
 * Importación de los contratos de 2026 del libro de pagos.
 *
 * No escribe en ninguna base: produce dos archivos.
 *   · el reporte, que es lo que hay que revisar antes de nada
 *   · el .sql, que se aplica a mano y sólo a la base local
 *
 * Es a propósito: la única forma de que esto toque una base es que una persona
 * corra el comando que lo aplica, y el reporte existe para que esa persona sepa
 * qué está aplicando.
 */

const STORE = 'mty'
const OUT = 'docs/import'
const money = (c) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

/** El catálogo actual, para amarrar los fragmentos del producto a un artículo. */
function loadItems(sqlJson) {
  try {
    const rows = JSON.parse(sqlJson)
    return rows.map((r) => ({ id: r.id, code: String(r.code), name: String(r.name), kind: r.kind }))
  } catch {
    return []
  }
}

/** «mantilla045» y «mantilla 045» son el mismo código; «P39» y «p39» también. */
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function matchFragment(fragment, items) {
  const n = normalize(fragment)
  if (!n) return null
  // Exacto por código primero; después por nombre exacto; después el código más
  // largo que aparezca dentro del fragmento, que es lo que rescata
  // «p47 de liquidacion».
  return items.find((i) => normalize(i.code) === n)
    ?? items.find((i) => normalize(i.name) === n)
    ?? items
      .filter((i) => normalize(i.code).length >= 3 && n.startsWith(normalize(i.code)))
      .sort((a, b) => normalize(b.code).length - normalize(a.code).length)[0]
    ?? null
}

const itemsJson = process.argv.find((a) => a.startsWith('--items='))?.slice(8) ?? '[]'
const items = loadItems(itemsJson)

const sheets = parsePagos('docs/pagos.xlsx')
const wb = readWorkbook('docs/pagos.xlsx')

const good = []
const rejected = []
const duplicates = []
for (const sheet of sheets) {
  const { kept, dropped } = dedupe(sheet.rows)
  duplicates.push(...dropped)
  for (const row of kept) (row.problems.length ? rejected : good).push(row)
}

// Cada fragmento del producto, amarrado o no.
const unmatched = new Map()
for (const row of good) {
  row.lines = row.fragments.map((fragment) => {
    const item = matchFragment(fragment, items)
    if (!item) unmatched.set(fragment, (unmatched.get(fragment) ?? 0) + 1)
    return { fragment, item }
  })
}

// ───────────────────────────────────────────────────────────── el reporte ──
const lines = []
const say = (s = '') => lines.push(s)

say('# Importación del libro de pagos — contratos de 2026')
say()
say(`Origen: \`docs/pagos.xlsx\`, ${sheets.length} hojas de 2026. Sucursal destino: \`${STORE}\`.`)
say('**Nada de esto se ha escrito en ninguna base.** Este reporte y el `.sql` que lo acompaña')
say('son todo lo que produjo la corrida.')
say()

say('## Resumen')
say()
say('| | renglones |')
say('|---|---|')
say(`| encontrados en las hojas | ${good.length + rejected.length + duplicates.length} |`)
say(`| importables | **${good.length}** |`)
say(`| rechazados | ${rejected.length} |`)
say(`| duplicados descartados | ${duplicates.length} |`)
say()
const payments = good.reduce((n, r) => n + r.abonos.length + 1, 0)
const totalCents = good.reduce((n, r) => n + r.total_cents, 0)
const paidCents = good.reduce((n, r) => n + r.paid_cents, 0)
say(`Suman ${payments} abonos (el anticipo cuenta como uno), ${money(totalCents)} contratados`)
say(`y ${money(paidCents)} cobrados.`)
say()

say('## Las hojas, y cómo se leyó cada una')
say()
say('| hoja | encabezado | renglones | importables | rechazados | duplicados |')
say('|---|---|---|---|---|---|')
for (const sheet of sheets) {
  const { kept, dropped } = dedupe(sheet.rows)
  const ok = kept.filter((r) => r.problems.length === 0).length
  say(`| \`${sheet.name}\` | ${sheet.header ? `fila ${sheet.header}` : '**no tiene**'} | ${sheet.rows.length} | ${ok} | ${kept.length - ok} | ${dropped.length} |`)
}
say()
say('Las columnas no están en el mismo lugar en todas las hojas y un encabezado llega a mentir:')
say('en `junio 26` el encabezado pone «producto» en la columna 5 y los datos están en la 4.')
say('Por eso los papeles no se toman del encabezado sino del propio renglón, con reglas que se')
say('pueden verificar a ojo: el anticipo es el primer número suelto, el total es el último, y')
say('en medio todo lo que empiece con dígito es un abono. Un número suelto **en medio** no se')
say('interpreta: se rechaza el renglón, porque ésa es justo la forma de un renglón contaminado')
say('por un copiar y pegar de otra hoja.')
say()

say('## Rechazados')
say()
if (rejected.length === 0) say('Ninguno.')
for (const r of rejected) {
  say(`### \`${r.sheet}\` fila ${r.rowNumber} — ${r.nombre || '(sin nombre)'}`)
  say()
  for (const p of r.problems) say(`- ${p}`)
  say()
  say('```json')
  say(JSON.stringify(r.raw))
  say('```')
  say()
}

say('## Duplicados descartados')
say()
say('Febrero trae once clientas capturadas dos veces: un bloque temprano y otro más abajo con')
say('más abonos. Se conserva el último —es el más completo— y aquí está el descartado, con los')
say('dos totales, por si el bueno fuera el otro.')
say()
if (duplicates.length === 0) say('Ninguno.')
else {
  say('| hoja | fila | clienta | total descartado | total conservado |')
  say('|---|---|---|---|---|')
  for (const d of duplicates) {
    say(`| \`${d.sheet}\` | ${d.rowNumber} | ${d.nombre} | ${d.total_cents ? money(d.total_cents) : '—'} | ${d.superseded_by?.total_cents ? money(d.superseded_by.total_cents) : '—'} |`)
  }
}
say()

say('## Fragmentos de producto')
say()
const allFragments = good.reduce((n, r) => n + r.lines.length, 0)
const matchedFragments = good.reduce((n, r) => n + r.lines.filter((l) => l.item).length, 0)
if (items.length > 0) {
  say(`${matchedFragments} de ${allFragments} fragmentos amarraron con un artículo del catálogo.`)
  say()
  say('**El número es bajo porque el catálogo todavía es el provisional de la semilla:**')
  say(`${items.length} artículos, contra los cientos que tiene el sitio. Esta importación depende`)
  say('de la del catálogo (C1): en cuanto ésa corra, hay que volver a generar este `.sql` y la')
  say('mayoría de estos fragmentos va a encontrar su artículo. Lo que no amarre se queda como')
  say('texto en el renglón del contrato, que es legible y no pierde nada.')
  say()
}
if (items.length === 0) {
  say('_No se pasó el catálogo (`--items=`), así que no se intentó amarrar nada._')
} else if (unmatched.size === 0) {
  say('Ninguno: todos los fragmentos encontraron artículo.')
} else {
  say('Los que no amarraron:')
  say()
  say('| fragmento | veces |')
  say('|---|---|')
  for (const [fragment, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) {
    say(`| \`${fragment}\` | ${n} |`)
  }
}
say()

say('## El regalo de accesorios')
say()
const withGift = good.filter((r) => r.gift_cents > 0)
say(`${withGift.length} contratos traen «regalo N para accesorios» (o alguna de sus variantes:`)
say('«N de regalo», «N de ragalo en acceso»).')
say()
say('**Esto es una interpretación y hay que confirmarla.** El encargo decía que la aritmética')
say('`26500-1500=25000` tiene que cuadrar. Leída así —el regalo se resta del total— diecinueve')
say('contratos quedarían pagados de más por el importe exacto del regalo. Leída al revés —el')
say('total de la hoja ya es lo que la novia paga y el regalo son accesorios que se le dieron sin')
say('cobrar— la diferencia que queda es de unos cien pesos, que es el recargo cobrado encima en')
say('el último abono. Los números dicen lo segundo:')
say()
const overs = good.filter((r) => r.balance_cents < 0).map((r) => -r.balance_cents)
say('```')
say(`diferencias de los que pagaron de más: ${overs.sort((a, b) => a - b).map((c) => c / 100).join(', ')}`)
say(`importes de regalo en el libro:        ${[...new Set(withGift.map((r) => r.gift_cents / 100))].sort((a, b) => a - b).join(', ')}`)
say('```')
say()
say('Así que se importa con `list_total_cents = total + regalo`, `gift_credit_cents = regalo` y')
say('`total_cents = total`, de modo que **lista − regalo = total** cuadra y lo que se le debe a')
say('la tienda es lo que dice la hoja. Si la lectura correcta fuera la otra, es un renglón del')
say('script y se vuelve a generar.')
say()

say('## Saldos que quedan')
say()
const settled = good.filter((r) => r.balance_cents === 0)
const openB = good.filter((r) => r.balance_cents > 0)
say(`- liquidados: ${settled.length}`)
say(`- con saldo: ${openB.length}, ${money(openB.reduce((n, r) => n + r.balance_cents, 0))} en total`)
say(`- pagados de más: ${overs.length} (recargos cobrados encima, ver arriba)`)
say()

say('## Decisiones que se tomaron, y que conviene mirar')
say()
say('- **Folio.** Los contratos importados llevan folio `MTY-IMP-0001` en adelante. No salen de')
say('  la secuencia de la tienda: si salieran, la historia se comería los folios de los')
say('  contratos nuevos. Además, en papel se distingue de un vistazo.')
say('- **Vendedora.** El libro no dice quién vendió. Todos quedan a nombre de la dueña, que es')
say('  quien importa; `imported = 1` los marca.')
say('- **Precios por renglón.** El libro sólo trae el total del contrato, no lo que costó cada')
say('  vestido y cada accesorio. El total va todo en el renglón del vestido y los accesorios');
say('  quedan en cero, con su texto. Sumados dan el total, que es lo que importa para el saldo.')
say('- **Plan.** `Histórico (importado)`, sin parcialidades generadas: el saldo es el total')
say('  menos lo pagado, y no hay calendario que inventar.')
say('- **Comprobantes.** Estos abonos se cobraron antes de que el sistema existiera y no tienen')
say('  foto. Se marcan `imported = 1` y la excepción vive sólo aquí: la API sigue rechazando')
say('  cualquier abono nuevo sin comprobante.')
const undated = good.flatMap((r) => r.abonos.filter((a) => !a.paid_at))
say(`- **Fechas ilegibles.** ${undated.length} de ${payments} abonos no traen fecha que se pueda leer`)
say('  (`«2800 28-2»`). Se guarda el monto y la fecha queda nula, con el texto original al lado.')
say()

// ───────────────────────────────────────────────────────────────── el sql ──
const sql = []
sql.push('-- Generado por scripts/import/pagos.mjs. NO editar a mano.')
sql.push('-- Aplicar SÓLO a la base local hasta que el reporte esté revisado:')
sql.push('--   npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/pagos.sql')
sql.push('--')
sql.push('-- Sin BEGIN/COMMIT: D1 aplica el archivo como un lote y rechaza las')
sql.push('-- transacciones explícitas.')
sql.push(`-- La vendedora de todos estos contratos es la dueña de ${STORE}, que es quien importa.`)

good.forEach((row, i) => {
  const folio = `MTY-IMP-${String(i + 1).padStart(4, '0')}`
  const parts = row.nombre.split(/\s+/)
  const name = parts[0] ?? row.nombre
  const apellido = parts.slice(1).join(' ')
  sql.push('')
  sql.push(`-- ${row.sheet} fila ${row.rowNumber} · ${row.nombre} · ${row.producto}`)
  sql.push(`INSERT INTO customers (store_id, name, apellido, source, notes)`)
  sql.push(`  VALUES ('${STORE}', ${q(name)}, ${q(apellido)}, 'pagos.xlsx', ${q(`${row.sheet} fila ${row.rowNumber}`)});`)
  sql.push(`INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,`)
  sql.push(`                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)`)
  sql.push(`  SELECT '${STORE}', ${q(folio)}, last_insert_rowid(), u.id, ${q(row.balance_cents <= 0 ? 'paid' : 'active')},`)
  sql.push(`         ${q(row.signed_on)}, 'Histórico (importado)', ${row.list_total_cents}, ${row.gift_cents}, ${row.total_cents}, 1,`)
  sql.push(`         ${q(`pagos.xlsx · ${row.sheet} · fila ${row.rowNumber}`)}`)
  sql.push(`    FROM users u WHERE u.store_id = '${STORE}' AND u.role = 'owner' ORDER BY u.id LIMIT 1;`)

  row.lines.forEach((line, j) => {
    const kind = j === 0 ? 'dress' : 'accessory'
    const price = j === 0 ? row.list_total_cents : 0
    sql.push(`INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)`)
    sql.push(`  VALUES ((SELECT id FROM contracts WHERE folio = ${q(folio)}), ${line.item ? line.item.id : 'NULL'}, ${q(line.fragment)}, ${price}, '${kind}', ${j});`)
  })
  if (row.gift_cents > 0) {
    sql.push(`INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)`)
    sql.push(`  VALUES ((SELECT id FROM contracts WHERE folio = ${q(folio)}), NULL, 'Regalo para accesorios', ${-row.gift_cents}, 'gift_credit', 99);`)
  }

  const all = [{ amount_cents: row.anticipo_cents, paid_at: row.signed_on, raw: 'anticipo' }, ...row.abonos]
  for (const p of all) {
    sql.push(`INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)`)
    sql.push(`  SELECT c.id, '${STORE}', ${q(p.paid_at)}, ${q(p.raw)}, ${p.amount_cents}, 'cash', c.seller_id, 1`)
    sql.push(`    FROM contracts c WHERE c.folio = ${q(folio)};`)
  }
})
sql.push('')

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/pagos.md`, lines.join('\n'))
writeFileSync(`${OUT}/pagos.sql`, sql.join('\n'))
writeFileSync(`${OUT}/pagos.json`, JSON.stringify({ good, rejected, duplicates }, null, 2))
console.log(`reporte  → ${OUT}/pagos.md`)
console.log(`sql      → ${OUT}/pagos.sql   (${good.length} contratos, ${payments} abonos)`)
console.log(`crudo    → ${OUT}/pagos.json`)
void wb
