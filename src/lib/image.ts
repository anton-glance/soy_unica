/**
 * Las fotos se comprimen en la tableta, antes de subirlas: la tienda trabaja
 * con la conexión que hay, y el Worker rechaza cualquier cosa arriba de 600 KB.
 */

export interface EncodeTarget {
  /** Lado largo máximo, en píxeles. */
  maxEdge: number
  startQuality: number
  /** Se baja de 0.08 en 0.08 hasta caber o hasta tocar este piso. */
  minQuality: number
  maxBytes: number
}

export const QUALITY_STEP = 0.08

export const TARGETS = {
  item_photo: { maxEdge: 1600, startQuality: 0.72, minQuality: 0.4, maxBytes: 300 * 1024 },
  document: { maxEdge: 1400, startQuality: 0.6, minQuality: 0.4, maxBytes: 150 * 1024 },
} as const satisfies Record<string, EncodeTarget>

export type PhotoKind = 'item_photo' | 'receipt' | 'expense' | 'measurement_sheet' | 'contract' | 'adjustments' | 'delivery'

export function targetFor(kind: PhotoKind): EncodeTarget {
  return kind === 'item_photo' ? TARGETS.item_photo : TARGETS.document
}

export class ImageTooLargeError extends Error {
  constructor(readonly bytes: number, readonly target: EncodeTarget) {
    super(
      `La foto sigue pesando ${Math.round(bytes / 1024)} KB después de comprimirla al máximo. ` +
        'Tómala otra vez con menos luz de fondo o más cerca del papel.',
    )
    this.name = 'ImageTooLargeError'
  }
}

/** Escalones de calidad que se van a probar, del primero al piso. */
export function qualitySteps(target: EncodeTarget): number[] {
  const steps: number[] = []
  for (let q = target.startQuality; q > target.minQuality + 1e-9; q -= QUALITY_STEP) {
    steps.push(Number(q.toFixed(2)))
  }
  steps.push(target.minQuality)
  return steps
}

/**
 * Baja la calidad hasta que la foto quepa. Si ni en el piso cabe, falla con un
 * error con nombre en lugar de subir algo que el Worker va a rechazar.
 */
export async function encodeUnderCap<T extends { size: number }>(
  encode: (quality: number) => Promise<T>,
  target: EncodeTarget,
): Promise<{ blob: T; quality: number }> {
  let last: T | null = null
  for (const quality of qualitySteps(target)) {
    const blob = await encode(quality)
    last = blob
    if (blob.size <= target.maxBytes) return { blob, quality }
  }
  throw new ImageTooLargeError(last?.size ?? 0, target)
}

/** Lado largo a `maxEdge`, respetando la proporción. Nunca agranda. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Redimensiona y codifica a WebP en la tableta. Devuelve lo que se sube. */
export async function prepareImage(file: File, kind: PhotoKind): Promise<{ blob: Blob; width: number; height: number; quality: number }> {
  const target = targetFor(kind)
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitWithin(bitmap.width, bitmap.height, target.maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Esta tableta no puede procesar fotos. Avísale a la dueña.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const { blob, quality } = await encodeUnderCap(
    (q) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la foto.'))), 'image/webp', q)
      }),
    target,
  )
  return { blob, width, height, quality }
}
