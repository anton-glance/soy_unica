import { describe, expect, it } from 'vitest'
import { ImageTooLargeError, QUALITY_STEP, TARGETS, encodeUnderCap, fitWithin, qualitySteps, targetFor } from '../src/lib/image'

/** Codificador de mentiras: el tamaño baja conforme baja la calidad. */
const encoder = (bytesAtFullQuality: number) => {
  const calls: number[] = []
  const encode = async (quality: number) => {
    calls.push(quality)
    return { size: Math.round(bytesAtFullQuality * quality) }
  }
  return { encode, calls }
}

describe('objetivos de compresión', () => {
  it('usa 1600 px y 300 KB para fotos de inventario', () => {
    expect(targetFor('item_photo')).toEqual({ maxEdge: 1600, startQuality: 0.72, minQuality: 0.4, maxBytes: 300 * 1024 })
  })

  it('usa 1400 px y 150 KB para los documentos', () => {
    for (const kind of ['measurement_sheet', 'contract', 'receipt', 'expense', 'adjustments', 'delivery'] as const) {
      expect(targetFor(kind)).toEqual({ maxEdge: 1400, startQuality: 0.6, minQuality: 0.4, maxBytes: 150 * 1024 })
    }
  })

  it('baja de 0.08 en 0.08 y se detiene en el piso de 0.4', () => {
    expect(qualitySteps(TARGETS.item_photo)).toEqual([0.72, 0.64, 0.56, 0.48, 0.4])
    expect(qualitySteps(TARGETS.document)).toEqual([0.6, 0.52, 0.44, 0.4])
    expect(QUALITY_STEP).toBe(0.08)
  })
})

describe('escalado', () => {
  it('lleva el lado largo al máximo respetando la proporción', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1400)).toEqual({ width: 1050, height: 1400 })
  })

  it('nunca agranda una foto que ya es chica', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('tope de tamaño', () => {
  it('sube al primer intento si ya cabe', async () => {
    const { encode, calls } = encoder(200 * 1024)
    const { blob, quality } = await encodeUnderCap(encode, TARGETS.item_photo)
    expect(quality).toBe(0.72)
    expect(blob.size).toBeLessThanOrEqual(TARGETS.item_photo.maxBytes)
    expect(calls).toEqual([0.72])
  })

  it('baja la calidad hasta que cabe, y no más', async () => {
    // A 0.72 pesa 360 KB; a 0.56 pesa 280 KB y ya cabe en 300 KB.
    const { encode, calls } = encoder(500 * 1024)
    const { quality, blob } = await encodeUnderCap(encode, TARGETS.item_photo)
    expect(calls).toEqual([0.72, 0.64, 0.56])
    expect(quality).toBe(0.56)
    expect(blob.size).toBeLessThanOrEqual(TARGETS.item_photo.maxBytes)
  })

  it('falla con un error con nombre si ni en el piso cabe', async () => {
    const { encode, calls } = encoder(5 * 1024 * 1024)
    await expect(encodeUnderCap(encode, TARGETS.document)).rejects.toBeInstanceOf(ImageTooLargeError)
    expect(calls).toEqual(qualitySteps(TARGETS.document))
  })

  it('el error dice qué hacer, en español', async () => {
    const { encode } = encoder(5 * 1024 * 1024)
    await expect(encodeUnderCap(encode, TARGETS.document)).rejects.toThrow(/Tómala otra vez/)
  })

  it('nunca deja pasar algo que el Worker vaya a rechazar por peso', async () => {
    // El Worker corta en 600 KB; los dos objetivos quedan muy por debajo.
    for (const target of [TARGETS.item_photo, TARGETS.document]) {
      expect(target.maxBytes).toBeLessThan(600 * 1024)
    }
  })
})
