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
 * Which branch a product belongs to, read off its categories.
 *
 * The site runs two catalogs. The same model can appear in both at different
 * prices, and CDMX carries premium dresses Monterrey does not, so a product is
 * not "the catalog" — it is one branch's row in one branch's catalog, with that
 * branch's price. Run `--categories` to print what the site actually uses and
 * check these patterns against it before importing.
 */
export const STORE_RULES = [
  { store: 'cdmx', test: /cdmx|ciudad de m[eé]xico|\bd\.?\s?f\.?\b|polanco/i },
  { store: 'mty', test: /mty|monterrey|\bn\.?\s?l\.?\b|nuevo le[oó]n|san pedro/i },
]

/** Branch with no category of its own: her home shop, and said so in the report. */
export const DEFAULT_STORE = 'mty'

export function storesFor(categories) {
  const hits = STORE_RULES.filter((rule) => categories.some((c) => rule.test.test(c))).map((r) => r.store)
  return hits.length > 0 ? hits : [DEFAULT_STORE]
}

/**
 * Her code scheme is what the seller types to search and what is written on
 * paper: `p139`, `A12`, `s14`, `madelyn`. The SKU is that code when the site
 * carries one. Failing that the model name is a code she already uses, so
 * "Vestido Madelyn" becomes `madelyn`. The slug is a website artefact and is
 * never passed off as a code: if that is all there is, the row comes in with a
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
   * priced, and the dresses she deliberately leaves unpriced in Monterrey
   * because they also sit in the CDMX catalog at a higher price, are real
   * stock. They come in at zero and flagged; the sale is blocked server-side
   * until she puts the price in, so a zero can never reach a contract.
   */
  if (!Number.isFinite(price_cents) || price_cents <= 0) {
    price_cents = 0
    review.push('price')
  }

  const categories = (product.categories ?? []).map((c) => strip(c.name)).filter(Boolean)
  const stores = storesFor(categories)

  // The brand lives in an attribute, not in a field of its own in the Store API.
  const brandAttr = (product.attributes ?? []).find((a) => /marca|brand/i.test(a.name ?? ''))
  const brand = brandAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const colorAttr = (product.attributes ?? []).find((a) => /color/i.test(a.name ?? ''))
  const color = colorAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const kind = categories.some((c) => /accesorio|mantilla|velo|tiara|crinolina|liga|cint(?:o|ur[oó]n)|joyer[ií]a|tocado/i.test(c)) ? 'accessory'
    : categories.some((c) => /vestido|novia|gala/i.test(c)) ? 'dress'
    : /mantilla|velo|tiara|crinolina|liga|cint(?:o|ur[oó]n)|tocado/i.test(strip(product.name)) ? 'accessory'
    : 'dress'

  const images = (product.images ?? []).map((img) => ({ src: img.src, alt: strip(img.alt) })).filter((i) => i.src)

  return {
    source_id: product.id,
    permalink: product.permalink,
    code, code_from, name, brand, color, kind, categories, stores, images, price_cents,
    // Everything comes in as made-to-order: the site's stock flags mean nothing,
    // and claiming a physical unit that may not exist is worse than the reverse.
    acquisition: 'pedido',
    review,
    problems,
  }
}
