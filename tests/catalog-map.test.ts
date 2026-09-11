import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — the importer is an untyped .mjs script, on purpose.
import { toItem, storesFor } from '../scripts/import/map-product.mjs'

/**
 * C1 — one WooCommerce Store API product to one inventory item.
 *
 * This half can be tested without going out to the internet, which is exactly
 * the half that matters: the mapping. What cannot be done from this environment
 * is downloading the real catalog — the network policy only allows the package
 * registries out.
 */

interface Mapped {
  code: string; code_from: string; name: string; brand: string | null; color: string | null
  kind: string; acquisition: string; price_cents: number; stores: string[]
  review: string[]; problems: string[]
  images: { src: string }[]
}

const fixture = JSON.parse(readFileSync('tests/fixtures/woo-products.json', 'utf8')) as unknown[]
const mapped = fixture.map((p) => toItem(p) as Mapped)
const byId = (id: number) => mapped[fixture.findIndex((p) => (p as { id: number }).id === id)] as Mapped

describe('the item code', () => {
  it('is the site SKU when there is one', () => {
    expect(byId(101).code).toBe('p139')
    expect(byId(101).code_from).toBe('sku')
  })

  it('falls back to the model name, which is a code she already uses', () => {
    // "Vestido Madelyn" is filed as `madelyn`; the kind is not part of the code.
    expect(byId(102).code).toBe('mantilla larga bordada')
    expect(byId(102).code_from).toBe('name')
  })

  it('never passes the website slug off as a code', () => {
    const slugs = fixture.map((p) => (p as { slug?: string }).slug).filter(Boolean)
    for (const item of mapped) {
      if (item.code_from === 'placeholder') continue
      expect(slugs).not.toContain(item.code)
    }
  })

  it('marks an invented code visibly and flags it for review', () => {
    expect(byId(106).code).toMatch(/^s\/n-/)
    expect(byId(106).review).toContain('code')
  })
})

describe('the price', () => {
  it('respects the minor unit the site declares', () => {
    // 1850000 with two decimals is $18,500.00
    expect(byId(101).price_cents).toBe(1_850_000)
    // 16500 with none is $16,500.00 — the same money, another scale.
    expect(byId(103).price_cents).toBe(1_650_000)
  })

  it('does not reject a product for having no price: it comes in flagged', () => {
    expect(byId(104).problems).toEqual([])
    expect(byId(104).price_cents).toBe(0)
    expect(byId(104).review).toContain('price')
  })
})

describe('the branch split', () => {
  it('reads the branch off the categories', () => {
    expect(byId(107).stores).toEqual(['cdmx'])
    expect(byId(108).stores).toEqual(['mty'])
  })

  it('puts a product carrying both categories into both branches', () => {
    expect(byId(110).stores.sort()).toEqual(['cdmx', 'mty'])
  })

  it('keeps each branch its own price for the same model', () => {
    // Luccienna is two products on the site: CDMX priced, Monterrey not.
    expect(byId(107).price_cents).toBe(2_450_000)
    expect(byId(108).price_cents).toBe(0)
    expect(byId(108).review).toContain('price')
  })

  it('falls back to Monterrey when no category names a branch', () => {
    expect(byId(101).stores).toEqual(['mty'])
    expect(storesFor([])).toEqual(['mty'])
  })
})

describe('what comes out of the attributes', () => {
  it('brand and colour, which the Store API has no fields of its own for', () => {
    expect(byId(101).brand).toBe('Lanesta')
    expect(byId(101).color).toBe('Ivory')
  })

  it('stay null when the product does not carry them', () => {
    expect(byId(102).brand).toBeNull()
    expect(byId(102).color).toBeNull()
  })
})

describe('dress or accessory', () => {
  it('comes from the site categories', () => {
    expect(byId(101).kind).toBe('dress')
    expect(byId(102).kind).toBe('accessory')
  })

  it('falls back to the model name when the category is silent', () => {
    expect(byId(109).kind).toBe('accessory')
  })
})

describe('everything comes in made to order', () => {
  it('without exception: the site stock flags are not trustworthy', () => {
    expect(mapped.every((m) => m.acquisition === 'pedido')).toBe(true)
  })
})

describe('the text arrives with HTML in it', () => {
  it('is cleaned before it is stored', () => {
    expect(byId(103).name).toBe('Vestido Aurora')
  })
})
