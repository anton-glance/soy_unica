import { one } from './db'
import { conflict } from './errors'
import type { StoreId } from './env'

const PREFIX: Record<StoreId, string> = { mty: 'MTY', cdmx: 'CDMX' }

/**
 * El folio se emite una sola vez desde `stores.next_folio_seq` y jamás se
 * reutiliza. Un borrador muerto pasa a 'cancelled' o 'void' y se queda con su
 * número: el papel firmado que anda por ahí lo lleva impreso.
 */
export async function issueFolio(db: D1Database, store: StoreId): Promise<string> {
  const row = await one<{ next_folio_seq: number }>(
    db,
    `UPDATE stores SET next_folio_seq = next_folio_seq + 1
     WHERE id = ? RETURNING next_folio_seq`,
    store,
  )
  if (!row) throw conflict('No se pudo emitir el folio. Vuelve a intentar.')
  const issued = row.next_folio_seq - 1
  return `${PREFIX[store]}-${String(issued).padStart(5, '0')}`
}
