import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — el importador es un script .mjs sin tipos, a propósito.
import { toItem } from '../scripts/import/map-product.mjs'

/**
 * C1 — De un producto de la Store API de WooCommerce a un artículo del
 * inventario.
 *
 * Esta parte se puede probar sin salir a internet, que es justo la mitad que
 * importa: el mapeo. Lo que no se puede es bajar el catálogo real desde este
 * entorno, cuya política de red sólo deja salir a los registros de paquetes.
 */

interface Mapped {
  code: string; name: string; brand: string | null; color: string | null
  kind: string; acquisition: string; price_cents: number; problems: string[]
  images: { src: string }[]
}

const fixture = JSON.parse(readFileSync('tests/fixtures/woo-products.json', 'utf8')) as unknown[]
const mapped = fixture.map((p) => toItem(p) as Mapped)
const byId = (id: number) => mapped[fixture.findIndex((p) => (p as { id: number }).id === id)] as Mapped

describe('el código del artículo', () => {
  it('es el SKU del sitio cuando lo hay', () => {
    expect(byId(101).code).toBe('p139')
  })

  it('cae al slug cuando no hay SKU, y nunca se inventa', () => {
    expect(byId(102).code).toBe('mantilla-larga-bordada')
    expect(byId(106).problems).toContain('sin SKU ni slug: no hay código')
  })
})

describe('el precio', () => {
  it('respeta la unidad menor que declara el sitio', () => {
    // 1850000 con dos decimales son $18,500.00
    expect(byId(101).price_cents).toBe(1_850_000)
    // 16500 sin decimales son $16,500.00 — el mismo dinero, otra escala.
    expect(byId(103).price_cents).toBe(1_650_000)
  })

  it('rechaza el producto si el precio no se entiende', () => {
    expect(byId(104).problems.join(' ')).toMatch(/precio ilegible/)
  })
})

describe('lo que se saca de los atributos', () => {
  it('marca y color, que en la Store API no son campos propios', () => {
    expect(byId(101).brand).toBe('Lanesta')
    expect(byId(101).color).toBe('Ivory')
  })

  it('quedan nulos cuando el producto no los trae', () => {
    expect(byId(102).brand).toBeNull()
    expect(byId(102).color).toBeNull()
  })
})

describe('vestido o accesorio', () => {
  it('sale de las categorías del sitio', () => {
    expect(byId(101).kind).toBe('dress')
    expect(byId(102).kind).toBe('accessory')
  })
})

describe('todo entra por pedido', () => {
  it('sin excepción: las banderas de existencias del sitio no son de fiar', () => {
    expect(mapped.every((m) => m.acquisition === 'pedido')).toBe(true)
  })
})

describe('el texto viene con HTML', () => {
  it('se limpia antes de guardarlo', () => {
    expect(byId(103).name).toBe('Vestido Aurora')
  })
})
