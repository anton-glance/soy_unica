import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — the importer is an untyped .mjs script, on purpose.
import { toItem, assignStores } from '../scripts/import/map-product.mjs'

/**
 * C1 — one WooCommerce Store API product to one inventory item.
 *
 * This half can be tested without going out to the internet, which is exactly
 * the half that matters: the mapping. What cannot be done from this environment
 * is downloading the real catalog — the network policy only allows the package
 * registries out.
 *
 * `toItem()` itself carries no branch: checked directly against the raw JSON,
 * `tags` is empty on every product and none of the categories names a branch
 * either — no signal on the product at all. The branch comes from a second,
 * separate source (the site's own SWOOF-filtered listing pages) and is applied
 * afterward, by `assignStores()`, covered in its own block below.
 */

interface Mapped {
  code: string; code_from: string; name: string; brand: string | null; color: string | null
  kind: string; cut: string | null; condition: string; promo: boolean; acquisition: string
  price_cents: number; review: string[]; problems: string[]; excluded: string | null
  images: { src: string }[]; permalink: string | null
}

const fixture = JSON.parse(readFileSync('tests/fixtures/woo-products.json', 'utf8')) as unknown[]
const mapped = fixture.map((p) => toItem(p) as Mapped)
const byId = (id: number) => mapped[fixture.findIndex((p) => (p as { id: number }).id === id)] as Mapped

describe('the item code', () => {
  it('is the site SKU when there is one', () => {
    expect(byId(101).code).toBe('P139')
    expect(byId(101).code_from).toBe('sku')
  })

  it('falls back to the model name, which is a code she already uses', () => {
    // "Vestido Madelyn" is filed as `madelyn`; the kind is not part of the code.
    expect(byId(102).code).toBe('mantilla larga bordada')
    expect(byId(102).code_from).toBe('name')
  })

  it('never passes the website slug or the WooCommerce id off as a code', () => {
    const slugs = fixture.map((p) => (p as { slug?: string }).slug).filter(Boolean)
    const ids = fixture.map((p) => String((p as { id: number }).id))
    for (const item of mapped) {
      if (item.code_from === 'placeholder') continue
      expect(slugs).not.toContain(item.code)
      expect(ids).not.toContain(item.code)
    }
  })

  it('marks an invented code visibly and flags it for review', () => {
    // Product 110 has no SKU, no usable name fragment beyond its own text, and
    // a slug — falls to the placeholder.
    const placeholder = mapped.find((m) => m.code_from === 'placeholder')
    expect(placeholder?.code).toMatch(/^s\/n-/)
    expect(placeholder?.review).toContain('code')
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

describe('toItem itself never mentions a store or branch', () => {
  it('the branch is a separate concern, applied afterward by assignStores', () => {
    // @ts-expect-error — intentionally checking the shape has no such field.
    expect(byId(101).store).toBeUndefined()
    // @ts-expect-error — intentionally checking the shape has no such field.
    expect(byId(101).stores).toBeUndefined()
  })
})

describe('assignStores — one product, one row per branch it is actually listed under', () => {
  const sets = (mty: (string | null)[], cdmx: (string | null)[]) =>
    new Map([['mty', new Set(mty.filter((p): p is string => p !== null))], ['cdmx', new Set(cdmx.filter((p): p is string => p !== null))]])
  const madelyn = byId(101) // permalink: .../producto/vestidos-de-novia/corte-princesa/madelyn/
  const mantilla = byId(102) // permalink: .../producto/accesorios/mantillas/mantilla-larga-bordada/

  it('one branch only → one row, not marked shared', () => {
    const { rows } = assignStores([madelyn], sets([madelyn.permalink], []))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ store: 'mty', shared: false, code: madelyn.code })
  })

  it('both branches → two independent rows, each marked shared, same code', () => {
    const { rows } = assignStores([madelyn], sets([madelyn.permalink], [madelyn.permalink]))
    expect(rows).toHaveLength(2)
    expect(rows.map((r: { store: string }) => r.store).sort()).toEqual(['cdmx', 'mty'])
    expect(rows.every((r: { shared: boolean; code: string }) => r.shared && r.code === madelyn.code)).toBe(true)
  })

  it('neither listing ever named it → held out, not guessed into either branch', () => {
    const { rows, noLocation } = assignStores([madelyn], sets([], []))
    expect(rows).toHaveLength(0)
    expect(noLocation).toEqual([madelyn])
  })

  it('two different products in two different branches stay independent', () => {
    const { rows } = assignStores([madelyn, mantilla], sets([madelyn.permalink], [mantilla.permalink]))
    expect(rows).toHaveLength(2)
    expect(rows.find((r: { code: string }) => r.code === madelyn.code)).toMatchObject({ store: 'mty', shared: false })
    expect(rows.find((r: { code: string }) => r.code === mantilla.code)).toMatchObject({ store: 'cdmx', shared: false })
  })

  it('a duplicate code within the same branch collides; the same code in two branches does not', () => {
    // byId(105) is "Madelyn repetida", which carries the same SKU as byId(101) in this fixture.
    const repeated = byId(105)
    expect(repeated.code).toBe(madelyn.code)
    const { rows, collisions } = assignStores(
      [madelyn, repeated],
      sets([madelyn.permalink, repeated.permalink], [madelyn.permalink]),
    )
    // mty: both listed, first kept, second collides. cdmx: only madelyn listed, one row, no collision.
    expect(rows).toHaveLength(2)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]).toMatchObject({ store: 'mty' })
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

describe('dress or accessory, read from the real categories', () => {
  it('"Vestidos de Novia" is a dress, "Accesorios"/"Mantillas" is an accessory', () => {
    expect(byId(101).kind).toBe('dress')
    expect(byId(102).kind).toBe('accessory')
  })

  it('falls back to the model name only when there is no category at all', () => {
    expect(byId(110).kind).toBe('dress')
  })
})

describe('cut, read from the "Corte …" categories', () => {
  it('maps Corte Princesa / Corte A / Corte Sirena', () => {
    expect(byId(101).cut).toBe('Princesa')
    expect(byId(103).cut).toBe('A')
    expect(byId(107).cut).toBe('Sirena')
  })

  it('stays null when no cut category is present', () => {
    expect(byId(102).cut).toBeNull()
  })
})

describe('condition, read from "Liquidación"', () => {
  it('is liquidacion for that category, nuevo otherwise', () => {
    expect(byId(107).condition).toBe('liquidacion')
    expect(byId(101).condition).toBe('nuevo')
  })
})

describe('the "Bridal Sale -20%" promotion', () => {
  it('is recorded as a flag, never as a condition or a price change', () => {
    const promo = byId(108)
    expect(promo.promo).toBe(true)
    expect(promo.condition).toBe('nuevo')
    expect(promo.price_cents).toBe(1_490_000)
  })

  it('is false for a product outside the promotion', () => {
    expect(byId(101).promo).toBe(false)
  })
})

describe('rentals are excluded, not imported or rejected', () => {
  it('marks the rental category as excluded', () => {
    expect(byId(109).excluded).toBe('rental')
    expect(byId(109).problems).toEqual([])
  })

  it('leaves everything else unexcluded', () => {
    expect(byId(101).excluded).toBeNull()
  })
})

describe('a product with no categories at all', () => {
  it('is flagged for review rather than guessed or dropped', () => {
    expect(byId(110).review).toContain('category')
    expect(byId(110).problems).toEqual([])
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
