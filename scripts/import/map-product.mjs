/**
 * De un producto de la Store API de WooCommerce a un artículo del inventario.
 *
 * Vive aparte del script para poder probarlo sin correr la importación: el
 * mapeo es la mitad que se puede verificar sin salir a internet.
 */

const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * El SKU del sitio es el código de la tienda cuando existe; cuando no, se usa
 * el slug. Nunca se inventa un código: es lo que la vendedora teclea para
 * buscar y tiene que ser el mismo que está escrito en la etiqueta.
 */
export function toItem(product) {
  const problems = []
  const code = String(product.sku ?? '').trim() || String(product.slug ?? '').trim()
  if (!code) problems.push('sin SKU ni slug: no hay código')

  const name = strip(product.name)
  if (!name) problems.push('sin nombre')

  // `prices.price` viene en la unidad menor según `currency_minor_unit`.
  const minor = Number(product.prices?.currency_minor_unit ?? 2)
  const rawPrice = Number(product.prices?.price ?? NaN)
  let price_cents = NaN
  if (Number.isFinite(rawPrice)) price_cents = Math.round(rawPrice * 10 ** (2 - minor))
  if (!Number.isFinite(price_cents) || price_cents <= 0) problems.push(`precio ilegible: ${JSON.stringify(product.prices?.price)}`)

  const categories = (product.categories ?? []).map((c) => strip(c.name)).filter(Boolean)
  // La marca vive en un atributo, no en un campo propio de la Store API.
  const brandAttr = (product.attributes ?? []).find((a) => /marca|brand/i.test(a.name ?? ''))
  const brand = brandAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const colorAttr = (product.attributes ?? []).find((a) => /color/i.test(a.name ?? ''))
  const color = colorAttr?.terms?.map((t) => strip(t.name)).join(', ') || null

  const kind = categories.some((c) => /vestido|novia|gala/i.test(c)) ? 'dress'
    : categories.some((c) => /accesorio|mantilla|velo|tiara|crinolina|liga|cinto/i.test(c)) ? 'accessory'
    : 'dress'

  const images = (product.images ?? []).map((img) => ({ src: img.src, alt: strip(img.alt) })).filter((i) => i.src)

  return {
    source_id: product.id,
    permalink: product.permalink,
    code, name, brand, color, kind, categories, images, price_cents,
    // Todo entra por pedido: las banderas de existencias del sitio no
    // significan nada y decir que hay una unidad física que quizá no exista es
    // peor que lo contrario.
    acquisition: 'pedido',
    problems,
  }
}

