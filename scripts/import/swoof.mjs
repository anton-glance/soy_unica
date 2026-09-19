/**
 * Reads a SWOOF-filtered listing page — the only place the branch (Monterrey
 * or CDMX) lives, since the Store API carries no location field anywhere on
 * the product itself (checked directly against the raw JSON: no `tags`, no
 * branch-naming category, no branch-naming attribute).
 *
 * Kept apart from the CLI, like `map-product.mjs`, so the parsing can be
 * tested against saved HTML without going out to the internet.
 *
 * These functions assume nothing about the theme's exact markup beyond two
 * things that are true of any WooCommerce site with pretty permalinks
 * enabled: every product page lives under `/producto/.../`, and the plugin's
 * own result-count text starts with "Mostrando". Matching on those two
 * anchors, instead of a CSS class that could belong to any theme, is what
 * makes this resilient to a theme change — and it's the only thing that
 * could be checked without fetching the real page.
 */

/**
 * `href="https://site/producto/a/b/slug/"` — absolute or relative, either
 * way, and whatever comes after the slug (a query string, an anchor) is
 * matched but never captured, so `?ref=abc#reviews` doesn't stop the link
 * from being recognized.
 */
const PRODUCT_HREF = /href\s*=\s*["']([^"'?#]*\/producto\/[^"'?#]+\/?)(?:[?#][^"']*)?["']/gi

/** The handful of named entities that show up in this site's own markup. */
const NAMED_ENTITIES = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', nbsp: ' ', amp: '&' }
function decodeEntities(text) {
  return text.replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/**
 * "Mostrando 1–24 de 77 resultados", "Mostrando todos los 3 resultados",
 * "Mostrando el único resultado", "Mostrando 5 resultados" — every shape
 * WooCommerce's own result-count string takes, in Spanish. Whichever matches
 * first is the total the site itself claims for the whole filtered listing,
 * not just this page — that's what `--fetch-locations` cross-checks the
 * permalink count against.
 */
export function parseResultCount(html) {
  const text = decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
  if (/Mostrando\s+el\s+único\s+resultado/i.test(text)) return 1
  let m = text.match(/Mostrando[^.]*?\bde\s+([\d,]+)\s+resultados?/i)
  if (m?.[1]) return Number(m[1].replace(/,/g, ''))
  m = text.match(/Mostrando\s+todos\s+los\s+([\d,]+)\s+resultados?/i)
  if (m?.[1]) return Number(m[1].replace(/,/g, ''))
  m = text.match(/Mostrando\s+([\d,]+)\s+resultados?/i)
  if (m?.[1]) return Number(m[1].replace(/,/g, ''))
  return null
}

/** Same URL whether it arrived with a query string, a hash, or a missing trailing slash. */
export function normalizePermalink(url, base) {
  try {
    const u = new URL(url, base)
    u.search = ''
    u.hash = ''
    let path = u.pathname
    if (!path.endsWith('/')) path += '/'
    return `${u.protocol}//${u.hostname}${path}`
  } catch {
    return null
  }
}

/**
 * A page has a next page when WooCommerce's own pagination widget says so —
 * `rel="next"` on the link, which every WooCommerce pagination template
 * carries regardless of theme — never guessed from the page number alone.
 */
export function hasNextPage(html) {
  return /rel=["']next["']/i.test(String(html ?? ''))
}

/** One fetched page → the product permalinks it lists, deduped and normalized. */
export function parseSwoofListing(html, pageUrl) {
  const permalinks = new Set()
  let m
  const re = new RegExp(PRODUCT_HREF.source, 'gi')
  while ((m = re.exec(String(html ?? '')))) {
    const normalized = normalizePermalink(m[1], pageUrl)
    if (normalized) permalinks.add(normalized)
  }
  return {
    permalinks: [...permalinks],
    reportedTotal: parseResultCount(html),
    hasNextPage: hasNextPage(html),
  }
}

/** Spanish-aware fallback when a category has no `slug` field to read directly. */
export function slugifyCategory(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Two independent ways of asking the same question — `location-X/` alone,
 * against every `location-X/product_cat-Y/` summed together — should name
 * exactly the same products. When they don't, that's not something to
 * silently resolve by trusting one side: it means either a product sits in
 * a category this run didn't know to ask about, or SWOOF's un-filtered
 * listing doesn't actually cover every category the way it's assumed to.
 * Either way, both permalink sets go into the union (so nothing found by
 * either path gets dropped) and the mismatch is reported.
 */
export function reconcileListings(direct, byCategory) {
  const categoryUnion = new Set()
  for (const category of byCategory.values()) {
    for (const permalink of category.permalinks) categoryUnion.add(permalink)
  }
  const directSet = new Set(direct.permalinks)
  const onlyInDirect = [...directSet].filter((p) => !categoryUnion.has(p))
  const onlyInCategories = [...categoryUnion].filter((p) => !directSet.has(p))
  return {
    permalinks: new Set([...directSet, ...categoryUnion]),
    onlyInDirect,
    onlyInCategories,
    agrees: onlyInDirect.length === 0 && onlyInCategories.length === 0,
  }
}
