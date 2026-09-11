/**
 * One WooCommerce Store API product → one inventory item.
 *
 * Kept apart from the CLI so it can be tested without running the import: the
 * mapping is the half that can be checked without going out to the internet.
 */

const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Marks a code the site did not give us. Same constant as `NO_CODE_PREFIX` in
 * worker/lib/items.ts — it is what keeps the row flagged until she types the
 * code that is actually written on the tag.
 */
export const NO_CODE_PREFIX = 's/n-'

/**
 * Her code scheme is what the seller types to search and what is written on
 * paper: `p139`, `A12`, `s14`, `madelyn`. The SKU is that code when the site
 * carries one — checked directly against the site's raw JSON, only 11 of 200
 * products have one (`P21`, `P33`, ... ), and those 11 are exactly her own
 * numbering: they match the codes already written in the payment ledger, which
 * makes them the highest-value codes in this import. Failing that the model
 * name is a code she already uses, so "Vestido Madelyn" becomes `madelyn`. The
 * slug and the WooCommerce id are website artefacts and are never passed off as
 * a code: if neither the SKU nor the name gives one, the row comes in with a
 * visible `s/n-` placeholder and stays flagged until she replaces it.
 */
export function codeFor(product) {
  const sku = String(product.sku ?? '').trim()
  if (sku) return { code: sku, from: 'sku' }

  const name = strip(product.name)
    // The catalog writes "Vestido <model>"; the word "vestido" is not the code.
    // Accessory words are kept: her own codes read "mantilla 039", "velo 12".
    .replace(/^(vestido|traje)\b\s*(de\s+(novia|gala|noche)\s*)?/i, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (name) return { code: name.toLowerCase(), from: 'name' }

  const slug = String(product.slug ?? '').trim()
  if (slug) return { code: `${NO_CODE_PREFIX}${slug}`, from: 'placeholder' }
  return { code: `${NO_CODE_PREFIX}${product.id}`, from: 'placeholder' }
}

/**
 * What the site's categories actually carry, checked against the real census
 * (`node scripts/import/catalog.mjs --categories`): 200 products, 14
 * categories, and none of them names a branch — no store split lives here.
 * `tags` is empty on every product and the permalink encodes category, not
 * branch (`producto/vestidos-de-novia/corte-princesa/hanna`), so there is no
 * branch signal anywhere in this endpoint. CDMX is not in this catalog at all;
 * it has to come from somewhere else.
 *
 * What the categories DO carry, reliably: whether something is a dress or an
 * accessory, its cut, whether it's on liquidation, whether it's part of the
 * "Bridal Sale -20%" promotion, and whether it's a rental (out of scope here).
 */
export const ACCESSORY_CATEGORIES = /^(accesorios|mantillas|tiaras|cintos|capa|bolero)$/i
export const CUT_CATEGORIES = [
  { test: /^corte princesa$/i, cut: 'Princesa' },
  { test: /^corte a$/i, cut: 'A' },
  { test: /^corte sirena$/i, cut: 'Sirena' },
]
export const LIQUIDATION_CATEGORY = /^liquidaci[oó]n$/i
export const PROMO_CATEGORY = /bridal sale/i
/** Out of scope: renting a coat is not selling a dress. Excluded, not rejected. */
export const RENTAL_CATEGORY = /renta/i

export function toItem(product) {
  const problems = []
  const review = []

  const { code, from: code_from } = codeFor(product)
  if (code_from === 'placeholder') review.push('code')

  const name = strip(product.name) || code
  if (!strip(product.name)) problems.push('no name on the site')

  // `prices.price` comes in the minor unit given by `currency_minor_unit`.
  const minor = Number(product.prices?.currency_minor_unit ?? 2)
  const rawPrice = Number(product.prices?.price ?? NaN)
  let price_cents = 0
  if (Number.isFinite(rawPrice)) price_cents = Math.round(rawPrice * 10 ** (2 - minor))
  /*
   * A missing price is NOT a rejection. Veils and mantillas the site never
   * priced, and dresses she deliberately leaves unpriced because they also sit
   * in another catalog at a higher price, are real stock. They come in at zero
   * and flagged; the sale is blocked server-side until she puts the price in,
   * so a zero can never reach a contract.
   */
  if (!Number.isFinite(price_cents) || price_cents <= 0) {
    price_cents = 0
    review.push('price')
  }

  const categories = (product.categories ?? []).map((c) => strip(c.name)).filter(Boolean)

  // Renting a coat is out of scope: excluded rather than imported or rejected,
  // and listed on its own in the report so nobody wonders where it went.
  const excluded = categories.some((c) => RENTAL_CATEGORY.test(c)) ? 'rental' : null

  /*
   * No category at all — two products on the site — means none of kind, cut
   * or condition can be read off anything. They still come in (a product with
   * no data is not junk, it's a gap), defaulted to a dress, flagged for a
   * human to look at and categorize by hand.
   */
  if (categories.length === 0) review.push('category')

  // The brand lives in an attribute, not in a field of its own in the Store API.
  const brandAttr = (product.attributes ?? []).find((a) => /marca|brand/i.test(a.name ?? ''))
  const brand = brandAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const colorAttr = (product.attributes ?? []).find((a) => /color/i.test(a.name ?? ''))
  const color = colorAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const kind = categories.some((c) => ACCESSORY_CATEGORIES.test(c)) ? 'accessory'
    : categories.some((c) => /^vestidos de novia$/i.test(c)) ? 'dress'
    // No category names either: fall back to the name, same as before there was a census to trust.
    : /mantilla|velo|tiara|crinolina|liga|cint(?:o|ur[oó]n)|tocado/i.test(strip(product.name)) ? 'accessory'
    : 'dress'

  const cutMatch = CUT_CATEGORIES.find((rule) => categories.some((c) => rule.test.test(c)))
  const cut = cutMatch?.cut ?? null

  const condition = categories.some((c) => LIQUIDATION_CATEGORY.test(c)) ? 'liquidacion' : 'nuevo'

  // A price cut is not a fact about the garment's condition, so it never
  // touches `condition` or `price_cents` — it's recorded as a note only.
  const promo = categories.some((c) => PROMO_CATEGORY.test(c))

  const images = (product.images ?? []).map((img) => ({ src: img.src, alt: strip(img.alt) })).filter((i) => i.src)

  return {
    source_id: product.id,
    permalink: product.permalink,
    code, code_from, name, brand, color, kind, cut, condition, promo, categories, images, price_cents,
    // Everything comes in as made-to-order: the site's stock flags mean nothing,
    // and claiming a physical unit that may not exist is worse than the reverse.
    acquisition: 'pedido',
    review,
    problems,
    excluded,
  }
}
