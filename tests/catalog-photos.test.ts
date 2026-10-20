import { beforeAll, describe, expect, it } from 'vitest'
import { Kiosk } from './helpers/client'
import { twinPhotoKey } from '../worker/lib/storage'

/**
 * Las fotos del catálogo importado se guardan dos veces, una por sucursal, con
 * los mismos bytes. Si la de una sucursal nunca se subió, se copia de la otra.
 */

describe('la foto gemela de la otra sucursal', () => {
  it('cambia la sucursal en la carpeta y en el nombre', () => {
    expect(twinPhotoKey('cdmx/item_photo/cdmx-5642-0.webp', 'cdmx', 'mty')).toBe('mty/item_photo/mty-5642-0.webp')
    expect(twinPhotoKey('mty/item_photo/mty-101-2.webp', 'mty', 'cdmx')).toBe('cdmx/item_photo/cdmx-101-2.webp')
  })

  it('una foto subida a mano no tiene gemela', () => {
    expect(twinPhotoKey('cdmx/item_photo/2026/3f2a.webp', 'cdmx', 'mty')).toBeNull()
    expect(twinPhotoKey('mty/item_photo/mty-1-0.webp', 'cdmx', 'mty')).toBeNull()
  })
})

describe('restaurar las fotos faltantes', () => {
  const owner = new Kiosk()
  const seller = new Kiosk()

  beforeAll(async () => {
    await owner.login('mty', 'owner', '4242')
    await seller.login('mty', 'seller', '1111')
  })

  it('es sólo de la dueña', async () => {
    const refusal = await seller.refusal('/api/maintenance/catalog-photos/restore', {})
    expect(refusal.status).toBe(403)
  })

  it('sin fotos importadas que revisar no hace nada y avisa que terminó', async () => {
    const result = await owner.post<{ checked: number; copied: number; next: string | null }>(
      '/api/maintenance/catalog-photos/restore', {},
    )
    expect(result).toMatchObject({ checked: 0, copied: 0, next: null })
  })
})
