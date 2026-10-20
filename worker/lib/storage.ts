/** R2 detrás de put/get/del: el resto del Worker no toca el bucket directamente. */

export interface StoredObject {
  body: ReadableStream
  size: number
  httpEtag: string
  contentType: string
}

export async function put(bucket: R2Bucket, key: string, body: ArrayBuffer, contentType: string): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } })
}

export async function get(bucket: R2Bucket, key: string): Promise<StoredObject | null> {
  const object = await bucket.get(key)
  if (!object) return null
  return {
    body: object.body,
    size: object.size,
    httpEtag: object.httpEtag,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
  }
}

export async function del(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

/** `{store}/{kind}/{YYYY}/{uuid}.webp` */
export function objectKey(store: string, kind: string, uploadedAt: Date, extension: string): string {
  return `${store}/${kind}/${uploadedAt.getUTCFullYear()}/${crypto.randomUUID()}.${extension}`
}

/**
 * La foto «gemela» de la otra sucursal. El importador del catálogo guarda cada
 * foto dos veces, una por sucursal, con los mismos bytes:
 * `cdmx/item_photo/cdmx-5642-0.webp` ↔ `mty/item_photo/mty-5642-0.webp`.
 * Devuelve null si la llave no sigue ese patrón (una foto subida a mano).
 */
export function twinPhotoKey(key: string, store: string, otherStore: string): string | null {
  const own = `${store}/item_photo/${store}-`
  if (!key.startsWith(own)) return null
  return `${otherStore}/item_photo/${otherStore}-${key.slice(own.length)}`
}
