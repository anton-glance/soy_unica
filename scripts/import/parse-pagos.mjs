import { readWorkbook } from './xlsx.mjs'

/**
 * Lectura del libro de pagos: de la hoja de cálculo a renglones con forma.
 *
 * El libro lo llena la tienda a mano desde 2018 y se nota. En las nueve hojas
 * de 2026 hay tres distribuciones de columnas distintas, una hoja sin
 * encabezado, encabezados que mienten sobre dónde está el producto, celdas de
 * pago con dos pagos adentro, un pago escrito «cancelo», un «120000» que era
 * 12000, y once clientas capturadas dos veces en febrero.
 *
 * De ahí que aquí no se adivine nada en silencio: lo que no se entiende se
 * rechaza con el contenido crudo de la celda, para que alguien lo mire.
 */

/** Las hojas de 2026. Ninguna otra hoja del libro termina en 26. */
export const SHEET_2026 = (name) => /26\s*$/.test(name) || name === 'Hoja7'

const MONTHS = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marz: 3, marzo: 3, abr: 4, abri: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
  // Dedazos del libro que no dejan lugar a duda por el contexto.
  maz: 3, marzp: 3, abrl: 4,
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
const isDate = (v) => v !== null && typeof v === 'object' && typeof v.date === 'string'
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const text = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/**
 * Una celda de abono empieza con el monto. Eso separa «3375 17 feb» de «p139»
 * y de «cancelo»: un producto empieza con letra y una nota también.
 */
export const looksLikePayment = (raw) => /^\d/.test(text(raw))

/**
 * «3375 17 feb», «3375 6-jun», «5000  13 -jun», y a veces dos abonos en la
 * misma celda: «2000 25-abril   2000 6-jun».
 *
 * Un monto sin fecha sólo cuenta si es el primero de la celda. Si no, «2800
 * 28-2» —cuya fecha quedó a medias— se leería como tres abonos de 2800, 28 y 2.
 */
const PAYMENT = /(\d[\d,]*(?:\.\d+)?)\s*(?:(\d{1,2})\s*[-\s]\s*([a-záéíóú]{3,10})\.?)?/gi

export function parsePayments(raw, year) {
  const s = text(raw)
  if (!s || !looksLikePayment(s)) return []
  const out = []
  let first = true
  for (const m of s.matchAll(PAYMENT)) {
    const amount = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) continue
    let date = null
    if (m[2] && m[3]) {
      const month = MONTHS[m[3].toLowerCase().replace(/[áéíóú]/g, (c) => 'aeiou'['áéíóú'.indexOf(c)])]
      const day = Number(m[2])
      if (month && day >= 1 && day <= 31) {
        date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
    if (date === null && !first) continue
    out.push({ amount_cents: Math.round(amount * 100), paid_at: date, raw: m[0].trim() })
    first = false
  }
  return out
}

/** «regalo 1500 para accesorios», «2500 de regalo», «1500 de ragalo en acceso». */
export function parseGift(raw) {
  const s = text(raw).toLowerCase()
  if (!/r[ae]galo/.test(s)) return 0
  const m = /(\d[\d,]*)\s*(?:de\s+)?r[ae]galo|r[ae]galo\s*(?:de\s*)?(\d[\d,]*)/.exec(s)
  const n = Number((m?.[1] ?? m?.[2] ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/**
 * Parte la celda de producto en fragmentos: «p139,mantilla045 crinolina 6 aros»
 * son tres cosas. Se corta por comas, y sólo por comas: «crinolina 6 aros» y
 * «velo largo liso» llevan espacios adentro y partirlas los destruye.
 */
export function splitProduct(raw) {
  return text(raw)
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** Encabezado: el primer renglón que se parezca a uno. */
const HEADER_WORDS = ['fecha', 'nombre', 'producto', 'anticipo', 'pago', 'total', 'comenta', 'telefono', 'accesorio']
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = (rows[i] ?? []).map((c) => text(c).toLowerCase())
    const hits = cells.filter((c) => HEADER_WORDS.some((w) => c.startsWith(w))).length
    if (hits >= 3) return { index: i, cells }
  }
  return null
}

/** Los papeles que el encabezado declara, por índice de columna. */
function rolesFromHeader(header) {
  const roles = {}
  header.cells.forEach((label, i) => {
    if (!label) return
    if (label.startsWith('fecha')) roles.fecha = i
    else if (label.startsWith('nombre')) roles.nombre = i
    else if (label.startsWith('producto')) roles.producto = i
    else if (label.startsWith('accesorio')) roles.accesorios = i
    else if (label.startsWith('anticipo')) roles.anticipo = i
    else if (label.startsWith('total')) roles.total = i
    else if (label.startsWith('comenta')) roles.comentarios = i
  })
  return roles
}

/**
 * Un renglón de clienta, resuelto. `problems` trae por qué no se puede
 * importar; si viene vacío, el renglón es bueno.
 *
 * Las reglas son a propósito tontas y verificables:
 *   · el anticipo es el PRIMER número suelto del renglón
 *   · el total es el ÚLTIMO número suelto
 *   · en medio, todo lo que parezca «monto + fecha» es un abono
 *   · un número suelto EN MEDIO no se interpreta: se rechaza el renglón, porque
 *     es justo la forma que tienen los renglones contaminados por un copiar y
 *     pegar de otra hoja
 */
export function resolveRow(cells, { sheet, rowNumber, roles, year }) {
  const problems = []
  const raw = {}
  cells.forEach((c, i) => { if (!isBlank(c)) raw[i] = isDate(c) ? c.date : c })

  const fecha = cells[roles.fecha ?? 0]
  const nombre = text(cells[roles.nombre ?? 1])
  const fail = (why) => ({ sheet, rowNumber, raw, nombre, problems: [why] })

  if (!isDate(fecha)) return fail('el primer campo no es una fecha')

  const numeric = []
  const payments = []
  cells.forEach((c, i) => {
    if (i === (roles.fecha ?? 0) || isBlank(c)) return
    if (isNum(c)) numeric.push(i)
    else if (typeof c === 'string' && /\d/.test(c) && parsePayments(c, year).length > 0) payments.push(i)
  })

  if (numeric.length === 0) return fail('no trae ni anticipo ni total')
  if (numeric.length === 1) return fail(`sólo trae un número (${cells[numeric[0]]}): no se sabe si es anticipo o total`)

  const anticipoAt = numeric[0]
  const totalAt = numeric[numeric.length - 1]
  const strays = numeric.slice(1, -1)
  if (strays.length > 0) {
    problems.push(`números sueltos entre el anticipo y el total, en las columnas ${strays.join(', ')}: ${strays.map((i) => cells[i]).join(', ')}`)
  }

  if (!nombre) problems.push('sin nombre')

  // Texto entre el nombre y el anticipo: el producto y los accesorios.
  const productCells = []
  for (let i = (roles.nombre ?? 1) + 1; i < anticipoAt; i++) {
    if (typeof cells[i] === 'string' && text(cells[i]) && !looksLikePayment(cells[i])) productCells.push(i)
  }
  const producto = productCells.map((i) => text(cells[i])).join(', ')
  if (!producto) problems.push('sin producto')

  const abonos = []
  for (const i of payments) {
    if (i <= anticipoAt || i >= totalAt) continue
    abonos.push(...parsePayments(cells[i], year).map((p) => ({ ...p, column: i })))
  }

  const total_cents = Math.round(cells[totalAt] * 100)
  const anticipo_cents = Math.round(cells[anticipoAt] * 100)
  const gift_cents = parseGift(cells.slice(totalAt + 1).find((c) => typeof c === 'string' && /r[ae]galo/i.test(c)) ?? '')

  const paid_cents = anticipo_cents + abonos.reduce((s, p) => s + p.amount_cents, 0)

  /*
   * El «total» de la hoja es lo que la novia paga: el regalo de accesorios ya
   * está contemplado ahí. Se ve en la aritmética de las hojas —con el regalo
   * restado, veintiún renglones quedarían pagados de más por el importe exacto
   * del regalo; sin restarlo, la diferencia es de unos cien pesos, que es el
   * recargo que se cobra encima en el último abono.
   *
   * Así que el precio de lista es el total MÁS el regalo, y el regalo es el
   * renglón de crédito que lo baja: lista − regalo = total. Queda anotado en el
   * reporte porque es una interpretación, no un dato del libro.
   */
  const list_total_cents = total_cents + gift_cents

  // Un abono suelto más grande que el contrato entero es un dedazo, no un
  // abono: «120000 4-sept» contra un total de 20 000. Eso se rechaza. Que la
  // suma quede corta o se pase por unos pesos es el libro llevado a mano: se
  // importa y se reporta la diferencia, que es lo que hay que revisar.
  const tooBig = abonos.find((p) => p.amount_cents > total_cents)
  if (tooBig) problems.push(`el abono «${tooBig.raw}» es mayor que el total (${total_cents / 100})`)
  else if (paid_cents > total_cents * 2) problems.push(`lo pagado (${paid_cents / 100}) duplica el total (${total_cents / 100})`)

  return {
    sheet, rowNumber, raw, problems,
    signed_on: fecha.date,
    nombre,
    producto,
    fragments: splitProduct(producto),
    anticipo_cents,
    abonos,
    list_total_cents,
    gift_cents,
    total_cents,
    paid_cents,
    balance_cents: total_cents - paid_cents,
  }
}

/** Todas las clientas de 2026, resueltas, con sus rechazos y sus duplicados. */
export function parsePagos(file) {
  const wb = readWorkbook(file)
  const sheets = []

  for (const [name, rows] of Object.entries(wb)) {
    if (!SHEET_2026(name)) continue
    const header = findHeader(rows)
    const roles = header ? rolesFromHeader(header) : {}
    const year = 2026

    const resolved = []
    for (let i = 0; i < rows.length; i++) {
      if (header && i === header.index) continue
      const cells = rows[i]
      if (!cells || cells.every(isBlank)) continue
      // Un encabezado repetido a media hoja no es una clienta.
      if (!isDate(cells[roles.fecha ?? 0])) {
        const looksHeader = (cells).some((c) => HEADER_WORDS.some((w) => text(c).toLowerCase().startsWith(w)))
        if (looksHeader) continue
      }
      resolved.push(resolveRow(cells, { sheet: name, rowNumber: i + 1, roles, year }))
    }
    sheets.push({ name, header: header ? header.index + 1 : null, roles, rows: resolved })
  }
  return sheets
}

/** El nombre, comparable: sin acentos, sin espacios, sin puntuación. */
const nameKey = (n) => (n ?? '').toLowerCase()
  .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
  .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
  .replace(/[^a-z]/g, '')

/**
 * Febrero está capturado dos veces: un bloque temprano y otro más abajo con más
 * abonos. Se conserva **el último que sirva**.
 *
 * Lo de «que sirva» no es un detalle: la captura tardía de jackeline cepeda
 * trae un abono en la columna del total, así que se rechaza —y si el duplicado
 * se decidiera sólo por ser el último, la clienta desaparecería de la
 * importación completa, teniendo una captura buena más arriba.
 */
export function dedupe(rows) {
  const key = (r) => `${r.signed_on}|${nameKey(r.nombre).slice(0, 10)}`
  const named = rows.filter((r) => r.signed_on && r.nombre)

  const winner = new Map()
  named.forEach((r, i) => {
    void i
    const k = key(r)
    const current = winner.get(k)
    // Gana el último; pero uno bueno le gana a uno rechazado, sea cual sea el
    // orden, porque perder a la clienta es peor que usar la captura anterior.
    if (!current) { winner.set(k, r); return }
    const currentOk = current.problems.length === 0
    const nextOk = r.problems.length === 0
    if (nextOk || !currentOk) winner.set(k, r)
  })

  const kept = []
  const dropped = []
  for (const r of rows) {
    if (!r.signed_on || !r.nombre) { kept.push(r); continue }
    const best = winner.get(key(r))
    if (best === r) kept.push(r)
    else dropped.push({ ...r, superseded_by: best })
  }
  return { kept, dropped }
}

/**
 * Parejas que se parecen mucho pero no llegaron a juntarse por sí solas: misma
 * hoja, misma fecha de firma y nombres casi iguales. No se fusionan —fusionar a
 * dos clientas distintas es peor que dejar dos renglones— pero se reportan para
 * que alguien las mire.
 *
 * De aquí salió «julieta yahaira rdz» contra «juieta yahaira»: una letra de
 * diferencia, que la llave exacta no perdona.
 */
export function nearDuplicates(rows) {
  const usable = rows.filter((r) => r.signed_on && r.nombre)
  // Nombre de pila y primer apellido: es lo que identifica a una persona aquí,
  // y lo que va después («rdz», «gzz») se escribe distinto cada vez.
  const head = (n) => nameKey((n ?? '').trim().split(/\s+/).slice(0, 2).join(' '))

  const out = []
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i]
      const b = usable[j]
      if (a.signed_on !== b.signed_on) continue
      if (nameKey(a.nombre).slice(0, 10) === nameKey(b.nombre).slice(0, 10)) continue // ya se juntaron solas
      const d = editDistance(head(a.nombre), head(b.nombre))
      if (d > 0 && d <= 2) out.push({ a, b, distance: d })
    }
  }
  return out
}

/** Distancia de edición, para perdonar el dedazo de una o dos letras. */
export function editDistance(a, b) {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]
}
