import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — the importer is an untyped .mjs script, on purpose.
import { hasNextPage, normalizePermalink, parseResultCount, parseSwoofListing, reconcileListings, slugifyCategory } from '../scripts/import/swoof.mjs'

/**
 * The location split lives entirely in SWOOF's filtered listing pages —
 * the Store API carries no branch field anywhere. This is the half that can
 * be tested without going out to the internet: saved HTML in, permalinks and
 * counts out. What cannot be checked from here is whether soyunicanovias.com's
 * real markup matches these fixtures — the network policy only allows the
 * package registries out. `scripts/import/catalog.mjs --fetch-locations` is
 * what proves that, and it has to run from a machine with real access.
 */

const page1 = readFileSync('tests/fixtures/swoof-page1.html', 'utf8')
const page2 = readFileSync('tests/fixtures/swoof-page2.html', 'utf8')
const single = readFileSync('tests/fixtures/swoof-single.html', 'utf8')
const empty = readFileSync('tests/fixtures/swoof-empty.html', 'utf8')
const URL_ = 'https://soyunicanovias.com/tienda/swoof/location-monterrey/'

describe('el conteo que el sitio mismo dice', () => {
  it('lee "Mostrando N–M de T resultados"', () => {
    expect(parseResultCount(page1)).toBe(5)
    expect(parseResultCount(page2)).toBe(5)
  })

  it('lee "Mostrando el único resultado" como 1', () => {
    expect(parseResultCount(single)).toBe(1)
  })

  it('lee "Mostrando todos los N resultados"', () => {
    expect(parseResultCount('<p>Mostrando todos los 3 resultados</p>')).toBe(3)
  })

  it('lee "Mostrando N resultados" sin rango', () => {
    expect(parseResultCount('<p>Mostrando 7 resultados</p>')).toBe(7)
  })

  it('no encuentra nada en una página sin ese texto', () => {
    expect(parseResultCount(empty)).toBeNull()
  })

  it('quita las comas de miles', () => {
    expect(parseResultCount('<p>Mostrando 1–24 de 1,234 resultados</p>')).toBe(1234)
  })
})

describe('los permalinks de cada tarjeta', () => {
  it('los saca aunque vengan absolutos, relativos, o con query y ancla', () => {
    const { permalinks } = parseSwoofListing(page1, URL_)
    expect(permalinks).toEqual(expect.arrayContaining([
      'https://soyunicanovias.com/producto/vestidos-de-novia/corte-princesa/madelyn/',
      'https://soyunicanovias.com/producto/vestidos-de-novia/corte-sirena/aurora/',
      'https://soyunicanovias.com/producto/accesorios/mantillas/mantilla-larga-bordada/',
    ]))
    expect(permalinks).toHaveLength(3)
  })

  it('nunca repite el mismo producto aunque el href aparezca dos veces', () => {
    const html = `
      <a href="https://soyunicanovias.com/producto/vestidos-de-novia/x/">foto</a>
      <a href="https://soyunicanovias.com/producto/vestidos-de-novia/x/">título</a>
    `
    expect(parseSwoofListing(html, URL_).permalinks).toHaveLength(1)
  })

  it('una página vacía no da ningún permalink', () => {
    expect(parseSwoofListing(empty, URL_).permalinks).toHaveLength(0)
  })
})

describe('si hay siguiente página', () => {
  it('la detecta por rel="next", no por adivinar el número de página', () => {
    expect(hasNextPage(page1)).toBe(true)
    expect(hasNextPage(page2)).toBe(false)
  })
})

describe('normalizar un permalink', () => {
  it('resuelve uno relativo contra la página que lo trajo', () => {
    expect(normalizePermalink('/producto/x/y/', URL_)).toBe('https://soyunicanovias.com/producto/x/y/')
  })

  it('le pone la barra final si no la trae', () => {
    expect(normalizePermalink('https://soyunicanovias.com/producto/x/y', URL_)).toBe('https://soyunicanovias.com/producto/x/y/')
  })

  it('quita query y ancla', () => {
    expect(normalizePermalink('https://soyunicanovias.com/producto/x/?ref=abc#reviews', URL_))
      .toBe('https://soyunicanovias.com/producto/x/')
  })

  it('una URL rota da null, no truena', () => {
    expect(normalizePermalink('not a url at all::::', undefined)).toBeNull()
  })
})

describe('conciliar el listado directo contra la suma por categoría', () => {
  const listing = (...permalinks: string[]) => ({ permalinks, reportedTotal: permalinks.length, hasNextPage: false })

  it('cuando coinciden exactamente, no hay discrepancia', () => {
    const direct = listing('a', 'b')
    const byCategory = new Map([['vestidos', listing('a')], ['accesorios', listing('b')]])
    const result = reconcileListings(direct, byCategory)
    expect(result.agrees).toBe(true)
    expect(result.permalinks).toEqual(new Set(['a', 'b']))
    expect(result.onlyInDirect).toEqual([])
    expect(result.onlyInCategories).toEqual([])
  })

  it('un producto que el listado directo se saltó, pero sí trae alguna categoría', () => {
    const direct = listing('a')
    const byCategory = new Map([['vestidos', listing('a', 'b')]])
    const result = reconcileListings(direct, byCategory)
    expect(result.agrees).toBe(false)
    expect(result.onlyInCategories).toEqual(['b'])
    // la unión no pierde nada, así el desacuerdo no cueste un producto real
    expect(result.permalinks).toEqual(new Set(['a', 'b']))
  })

  it('un producto que ninguna categoría trajo, pero el listado directo sí', () => {
    const direct = listing('a', 'b')
    const byCategory = new Map([['vestidos', listing('a')]])
    const result = reconcileListings(direct, byCategory)
    expect(result.agrees).toBe(false)
    expect(result.onlyInDirect).toEqual(['b'])
  })
})

describe('el respaldo para el slug de categoría', () => {
  it('quita acentos y pone guiones', () => {
    expect(slugifyCategory('Vestidos de Novia')).toBe('vestidos-de-novia')
    expect(slugifyCategory('Corte Princesa')).toBe('corte-princesa')
    expect(slugifyCategory('Liquidación')).toBe('liquidacion')
  })
})
