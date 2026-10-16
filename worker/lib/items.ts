/**
 * Tabla de transiciones del inventario. No existe un PATCH genérico de estado:
 * cada cambio pasa por un endpoint con nombre que valida el estado de origen.
 */

export type ItemStatus =
  | 'available' | 'watching' | 'reserved' | 'tailoring'
  | 'tailored' | 'ready' | 'sold' | 'retired'

export type ItemAction =
  | 'hold' | 'release' | 'reserve'
  | 'tailoring/start' | 'tailoring/done' | 'deliver'
  | 'retire' | 'unretire'

export interface ItemLike {
  status: ItemStatus
  acquisition: 'unidad' | 'pedido'
  tailoring_done_at: string | null
  held_by_session: number | null
}

export const TRANSITIONS: Record<ItemAction, { from: ItemStatus[]; to: ItemStatus }> = {
  hold: { from: ['available'], to: 'watching' },
  release: { from: ['watching'], to: 'available' },
  reserve: { from: ['watching'], to: 'reserved' },
  'tailoring/start': { from: ['reserved'], to: 'tailoring' },
  'tailoring/done': { from: ['tailoring'], to: 'tailored' },
  // `sold` sólo se alcanza desde `ready`, y sólo por la entrega.
  deliver: { from: ['ready'], to: 'sold' },
  retire: { from: ['available'], to: 'retired' },
  unretire: { from: ['retired'], to: 'available' },
}

export type TransitionResult =
  | { ok: true; to: ItemStatus }
  | { ok: false; message: string }

/**
 * Los modelos por pedido se mandan a hacer: nunca se apartan y nunca cambian
 * de estado, para que dos novias puedan encargar el mismo.
 */
export function canTransition(item: ItemLike, action: ItemAction): TransitionResult {
  if (item.acquisition === 'pedido') {
    return { ok: false, message: 'Los modelos por pedido no se apartan ni cambian de estado.' }
  }
  const rule = TRANSITIONS[action]
  if (!rule.from.includes(item.status)) {
    return {
      ok: false,
      message: `No se puede pasar de «${STATUS_ES[item.status]}» a «${STATUS_ES[rule.to]}».`,
    }
  }
  return { ok: true, to: rule.to }
}

/**
 * `ready` es derivado, nunca se pone a mano: la costura terminó y el saldo
 * quedó en cero. Si vuelve a haber saldo (por una cancelación de pago), el
 * vestido regresa a `tailored`.
 */
export function deriveStatus(item: ItemLike, balanceCents: number): ItemStatus {
  if (item.status !== 'tailored' && item.status !== 'ready') return item.status
  return item.tailoring_done_at !== null && balanceCents === 0 ? 'ready' : 'tailored'
}

/** Las etiquetas del prototipo aprobado; son las mismas que ve la tienda. */
export const STATUS_ES: Record<ItemStatus, string> = {
  available: 'Disponible',
  watching: 'Viendo ahora',
  reserved: 'Reservado',
  tailoring: 'En costura',
  tailored: 'Costura lista',
  ready: 'Listo para entrega',
  sold: 'Vendido',
  retired: 'Retirado',
}

/** Un vestido único vive en un solo contrato vigente a la vez. */
export const CONTRACT_HOLDING_STATUSES = ['active', 'paid', 'delivered'] as const

/**
 * Hotel de vestido: se acumula por día una vez pasada la ventana libre desde
 * que se le avisó a la novia que estaba listo.
 */
export function hotelCharge(
  readyNotifiedAt: string | null,
  today: string,
  freeDays: number,
  dailyCents: number,
): { days_charged: number; amount_cents: number } {
  if (!readyNotifiedAt) return { days_charged: 0, amount_cents: 0 }
  const notified = readyNotifiedAt.slice(0, 10)
  const elapsed = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${notified}T00:00:00Z`)) / 86_400_000)
  const days_charged = Math.max(0, elapsed - freeDays)
  return { days_charged, amount_cents: days_charged * dailyCents }
}

/**
 * Prefix the catalog importer puts on a code it had to invent because the site
 * carried neither an SKU nor a usable model name. It is deliberately visible in
 * the code column, and it is what keeps the `code` flag alive across recomputes:
 * the moment she types her own code the prefix is gone and the flag clears.
 */
export const NO_CODE_PREFIX = 's/n-'

/**
 * Which fields an item is still missing. The single source of truth for the
 * `needs_review` flag: the importer calls it, and so does every write that can
 * fill one of these in, so filling the last gap clears the flag by itself.
 *
 * Mandatory: price, code, model name, quantity, a photo — and the brand, but
 * only on a dress. Cost, size, cut, colour and notes are never gaps. An item
 * with no stock left (quantity 0) is never flagged at all: «No disponible» is
 * the only thing that matters about it, whatever else it is missing. A blank
 * quantity (null) IS a gap: it means nobody has counted it yet.
 */
export function reviewFields(item: {
  code?: string | null
  name?: string | null
  brand?: string | null
  kind?: string | null
  price_cents?: number | null
  quantity?: number | null
  has_photo?: boolean
}): string[] {
  if (item.quantity === 0) return []
  const missing: string[] = []
  // Price first: it is the one that blocks a sale.
  if (!item.price_cents || item.price_cents <= 0) missing.push('price')
  const code = String(item.code ?? '').trim()
  if (!code || code.startsWith(NO_CODE_PREFIX)) missing.push('code')
  if (!String(item.name ?? '').trim()) missing.push('name')
  if (item.kind === 'dress' && !String(item.brand ?? '').trim()) missing.push('brand')
  if (item.quantity === null || item.quantity === undefined) missing.push('quantity')
  // A photo is never optional: the kiosk has nothing to show the bride without one.
  if (!item.has_photo) missing.push('photo')
  return missing
}
