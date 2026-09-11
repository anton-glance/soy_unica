import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

/**
 * Lector mínimo de .xlsx, sin dependencias.
 *
 * Un .xlsx es un zip con XML adentro. Meter una librería de terceros para leer
 * una sola vez un archivo que ya está en el repo no vale lo que cuesta —y las
 * que hay arrastran su propia lista de vulnerabilidades—, así que aquí está lo
 * poco que hace falta: abrir el zip, leer la tabla de cadenas compartidas y
 * sacar las celdas de cada hoja como texto, número o fecha.
 *
 * No entiende formato, fórmulas ni estilos, y no hace falta: lo que se importa
 * son valores.
 */

/** Descomprime el zip a un mapa nombre → Buffer, leyendo su directorio central. */
function unzip(file) {
  const buf = readFileSync(file)
  // El fin del directorio central trae dónde empieza el directorio.
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error(`${file} no parece un archivo .xlsx`)
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const files = new Map()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio del zip corrupto')
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen

    // El encabezado local repite los largos: hay que saltarlo para llegar a los datos.
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compressedSize)
    files.set(name, method === 0 ? raw : inflateRawSync(raw))
  }
  return files
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ENTITIES[e])
}

/** La tabla de cadenas: las celdas de texto guardan un índice a ella. */
function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8')
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // Una cadena puede venir partida en varios <t> por el formato enriquecido.
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''))
}

/** "BC" → 54 (índice de columna, base cero). */
function colIndex(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * El serial de fecha de Excel a 'YYYY-MM-DD'. El epoch es el 30/12/1899 por el
 * año bisiesto de 1900 que Excel inventó y nunca corrigió.
 */
export function excelDate(serial) {
  // Excel cree que 1900 fue bisiesto: el serial 60 es un 29 de febrero que no
  // existió. Antes de esa fecha hay que correr un día.
  const days = serial < 61 ? serial + 1 : serial
  const ms = Math.round(days * 86_400_000)
  return new Date(Date.UTC(1899, 11, 30) + ms).toISOString().slice(0, 10)
}

/**
 * Devuelve { nombreDeHoja: filas }, donde cada fila es un arreglo ralo de
 * celdas. Una celda es null, un número, una cadena o { date: 'YYYY-MM-DD' }.
 */
export function readWorkbook(file) {
  const files = unzip(file)
  const strings = sharedStrings(files)

  // Qué formatos numéricos son fechas: se necesita para distinguir un serial de
  // fecha de un número cualquiera.
  const styles = files.get('xl/styles.xml')?.toString('utf8') ?? ''
  const builtinDates = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57])
  const customDates = new Set(
    [...styles.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)]
      // Un formato es de fecha si menciona año, mes o día fuera de comillas.
      .filter((m) => /[ymd]/.test(unescapeXml(m[2]).replace(/"[^"]*"/g, '')))
      .map((m) => Number(m[1])))
  const cellXfs = styles.slice(styles.indexOf('<cellXfs'), styles.indexOf('</cellXfs>'))
  const xfFmt = [...cellXfs.matchAll(/<xf[^>]*numFmtId="(\d+)"/g)].map((m) => Number(m[1]))
  const isDateStyle = (s) => {
    const fmt = xfFmt[Number(s)]
    return fmt !== undefined && (builtinDates.has(fmt) || customDates.has(fmt))
  }

  // El libro nombra las hojas; el .rels dice en qué archivo está cada una.
  const wbXml = files.get('xl/workbook.xml').toString('utf8')
  const relsXml = files.get('xl/_rels/workbook.xml.rels').toString('utf8')
  const rels = new Map([...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map((m) => [m[1], m[2].replace(/^\/?xl\//, '')]))

  const sheets = {}
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const name = unescapeXml(m[1])
    const path = `xl/${rels.get(m[2])}`
    const xml = files.get(path)?.toString('utf8')
    if (!xml) continue

    const rows = []
    // Igual que con `<c>`: un renglón vacío se cierra solo y, si se busca el
    // `</row>` más cercano, se le adjudican las celdas del renglón siguiente.
    for (const rowM of xml.matchAll(/<row\b([^>]*?)(\/)?>/g)) {
      const rowNum = Number(/\br="(\d+)"/.exec(rowM[1])?.[1])
      if (!rowNum) continue
      let body = ''
      if (!rowM[2]) {
        const from = rowM.index + rowM[0].length
        const end = xml.indexOf('</row>', from)
        body = end === -1 ? '' : xml.slice(from, end)
      }
      const cells = []
      // Una celda vacía viene como `<c r="C3" s="5"/>`, sin `</c>`. Si se
      // busca el `</c>` más cercano se le adjudica el contenido de la celda
      // siguiente y todo el renglón se recorre una columna: hay que mirar si la
      // etiqueta se cierra sola.
      for (const cM of body.matchAll(/<c\b([^>]*?)(\/)?>/g)) {
        const attrs = cM[1]
        const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs)
        if (!ref) continue
        let inner = ''
        if (!cM[2]) {
          const from = cM.index + cM[0].length
          const end = body.indexOf('</c>', from)
          inner = end === -1 ? '' : body.slice(from, end)
        }
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
        const style = /\bs="(\d+)"/.exec(attrs)?.[1]
        let value = null
        if (type === 'inlineStr') {
          value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('')
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          if (v !== undefined) {
            if (type === 's') value = strings[Number(v)] ?? null
            else if (type === 'str' || type === 'e') value = unescapeXml(v)
            else if (style !== undefined && isDateStyle(style) && Number(v) > 0) value = { date: excelDate(Number(v)) }
            else value = Number(v)
          }
        }
        if (value !== null && value !== '') cells[colIndex(ref[1])] = value
      }
      rows[rowNum - 1] = cells
    }
    sheets[name] = rows
  }
  return sheets
}
