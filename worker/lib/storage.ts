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
