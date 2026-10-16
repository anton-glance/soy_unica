import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, UnauthorizedError, get, post } from '../lib/api'
import { money } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Dialog } from '../components/Dialog'
import { GownArt } from '../components/GownArt'
import { PhotoGallery } from '../components/PhotoGallery'
import { Brandmark } from '../components/Brandmark'
import { IconButton } from '../components/IconButton'
import { PinPad } from '../components/PinPad'
import { PrintOverlay } from '../components/PrintOverlay'
import { Screen } from '../components/Screen'
import { PrintMedidas } from './PrintMedidas'
import { PrintContrato } from './PrintContrato'

/**
 * El identificador de la sesión de venta vive en `localStorage`, por navegador.
 * Sobrevive a un reinicio de la base: si alguna vez se restaura un respaldo, el
 * id guardado ya no existirá del otro lado. Por eso, cuando no se puede
 * resolver, se descarta y se abre una sesión nueva en vez de dejar una pantalla
 * sin salida.
 */
export const SESSION_KEY = 'su:session'

type Stage =
  | 'browsing' | 'fitting' | 'selected' | 'bride_data' | 'sheet_printed'
  | 'sheet_signed' | 'terms' | 'contract_printed' | 'signed' | 'payment' | 'closed'

export type ItemKind = 'dress' | 'mantilla' | 'tiara' | 'cinto' | 'otros'

export interface KioskItem {
  id: number; code: string; name: string; brand: string | null; kind: ItemKind
  size: string | null; cut: string | null; color: string | null
  price_cents: number; held_by_other: boolean; held_by_me: boolean; favorite: boolean
  photos: string[]; quantity: number | null; available: boolean
  needs_review: number; review_fields: string | null
}

/** Cómo se llama cada dato que falta en la etiqueta «Falta: …». */
const FALTA_LABEL: Record<string, string> = {
  price: 'precio', code: 'código', size: 'talla', cost: 'costo', condition: 'condición', photo: 'foto',
}

/** «Falta: precio, foto» si el artículo está incompleto; null si está completo. */
function missingLabel(item: KioskItem): string | null {
  const fields = (item.review_fields ?? '').split(',').filter(Boolean)
  if (item.price_cents <= 0 && !fields.includes('price')) fields.push('price')
  if (fields.length === 0 && item.needs_review !== 1) return null
  return `Falta: ${fields.map((f) => FALTA_LABEL[f] ?? f).join(', ')}`
}

/** Por qué no se puede agregar al carrito, o null si sí se puede. */
function blockReason(item: KioskItem): string | null {
  if (!item.available) return 'No disponible'
  const falta = missingLabel(item)
  if (falta) return falta
  if (item.held_by_other) return 'La tiene otra novia'
  return null
}

/** La miniatura de una tarjeta: su foto principal, o el dibujo genérico si no tiene. */
function ItemArt({ item, className = 'art' }: { item: KioskItem; className?: string }) {
  const photo = item.photos[0]
  return photo ? <img src={`/api/files/${photo}`} alt="" className={className} /> : <GownArt seed={item.id} className={className} />
}

/** La misma etiqueta, en singular, para la cinta de un solo artículo. */
const KIND_LABEL: Record<Exclude<ItemKind, 'dress'>, string> = {
  mantilla: 'Mantilla', tiara: 'Tiara', cinto: 'Cinto', otros: 'Otro',
}

interface SessionState {
  session: { id: number; stage: Stage; contract_id: number | null; closed_at: string | null }
  favorites: number[]
  contract: { id: number; folio: string; total_cents: number; plan_id: number | null; plan_name: string | null } | null
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  documents: { id: string; kind: string }[]
}

const STAGE_TITLE: Record<Stage, string> = {
  browsing: '', fitting: '', selected: 'Datos de la novia',
  bride_data: 'Hoja de medidas', sheet_printed: 'Foto de la hoja firmada', sheet_signed: 'Plan de pago',
  // 'terms' comparte título con 'contract_printed': imprimir el contrato es
  // ahora un diálogo que se abre sobre esta misma pantalla, no una pantalla
  // aparte — así se ve como un solo paso, «Foto del contrato firmado», con el
  // aviso de imprimir encima mientras la foto todavía no se puede tomar.
  terms: 'Foto del contrato firmado', contract_printed: 'Foto del contrato firmado',
  // 'signed' y 'payment' no llegan a pintarse: el efecto de redirección los
  // manda a la ficha de la clienta antes de que este título se vea. Siguen
  // aquí porque `Stage` los exige, no porque alguien los vaya a leer.
  signed: 'Sesión de venta', payment: 'Sesión de venta', closed: 'Sesión cerrada',
}
const STAGE_HINT: Record<Stage, string> = {
  browsing: '', fitting: '',
  selected: 'Los cuatro datos son obligatorios. La fecha del evento decide qué planes se pueden ofrecer.',
  bride_data: '',
  sheet_printed: 'Las medidas no se capturan al sistema: la foto de la hoja firmada es la evidencia de la tienda.',
  sheet_signed: 'Sólo aparecen los planes que caben por precio, por meses y por la fecha del evento.',
  terms: 'El contrato se activa sólo con las dos fotos: la hoja de medidas y el contrato.',
  contract_printed: 'El contrato se activa sólo con las dos fotos: la hoja de medidas y el contrato.',
  signed: '', payment: '', closed: '',
}

export function SalesSession() {
  const navigate = useNavigate()
  const { signOutToEntry } = useSession()
  const [sessionId, setSessionId] = useState<number | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? Number(raw) : null
  })
  const [state, setState] = useState<SessionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Se declara aquí arriba, antes de cualquier regreso condicional: los
  // ganchos de React tienen que correr siempre en el mismo orden, y este
  // componente regresa temprano en varias ramas (cargando, en el kiosco...).
  const closeRef = useRef<CloseControlHandle>(null)

  const reload = useCallback(async (id: number) => {
    const { data } = await get<SessionState>(`/sessions/${id}`)
    if (data.session.closed_at) {
      localStorage.removeItem(SESSION_KEY)
      setSessionId(null)
      setState(null)
      return
    }
    setState(data)
    // Avanzar de etapa siempre deja la pantalla nueva empezada desde arriba.
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        let id = sessionId
        if (id) {
          try {
            await reload(id)
            return
          } catch (err) {
            if (err instanceof UnauthorizedError) throw err
            // El id guardado ya no existe: se descarta y se abre una nueva.
            localStorage.removeItem(SESSION_KEY)
            id = null
          }
        }
        const created = await post<{ id: number }>('/sessions', { device_label: navigator.userAgent.slice(0, 40) })
        localStorage.setItem(SESSION_KEY, String(created.id))
        if (cancelled) return
        setSessionId(created.id)
        await reload(created.id)
      } catch (err) {
        if (cancelled) return
        if (err instanceof UnauthorizedError) {
          void signOutToEntry('Tu sesión expiró. Vuelve a marcar tu NIP.')
          return
        }
        setError(err instanceof Error ? err.message : 'No se pudo abrir la sesión.')
      }
    }
    void boot()
    // En desarrollo React monta dos veces: si el componente se fue, lo que
    // regresó del servidor no se escribe en un estado que ya no existe.
    return () => { cancelled = true }
  // El arranque resuelve la sesión una sola vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <Screen title="No se pudo abrir la sesión" onBack={() => navigate('/')} backLabel="Regresar al inicio" center>
        <p className="err">{error}</p>
        <button type="button" className="btn-main" onClick={() => { localStorage.removeItem(SESSION_KEY); window.location.reload() }}>
          Empezar una sesión nueva
        </button>
      </Screen>
    )
  }
  if (!state || !sessionId) {
    return <Screen title="Sesión de venta" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  const refresh = () => reload(sessionId)
  const stage = state.session.stage
  const onClosed = () => { localStorage.removeItem(SESSION_KEY); navigate('/') }

  if (stage === 'browsing' || stage === 'fitting') {
    return <Kiosk sessionId={sessionId} onChange={refresh} onClosed={onClosed} />
  }
  // No hay pantalla de «Anticipo»: firmar cierra la sesión en el servidor y
  // `SignContract` navega derecho a la ficha de la clienta con el folio que
  // esa misma respuesta trae, así que `stage` nunca llega a valer 'signed' ni
  // 'payment' aquí — la sesión ya está cerrada para cuando este componente
  // volviera a pintar.

  // Cada paso usa la (X) de arriba para cerrar la sesión, igual que el resto
  // de la aplicación — antes sólo «Datos de la novia» lo hacía así y los demás
  // pasos traían un botón «Cerrar sesión» de texto pegado al pie, que era el
  // único ocupante del pie de pantalla. El control es el mismo NIP + motivo
  // en todos los casos; sólo cambia de dónde se dispara, y ahora siempre se
  // dispara desde la (X).
  const closeControl = <CloseControl ref={closeRef} sessionId={sessionId} onClosed={onClosed} trigger={() => null} />

  return (
    <Screen
      title={STAGE_TITLE[stage]}
      onBack={() => navigate('/')}
      backLabel="Regresar al inicio"
      onClose={() => closeRef.current?.open()}
      closeLabel="Cerrar sesión"
    >
      <div className="wrap">
        {state.contract && (
          <p className="pill pill--brass" style={{ marginBottom: 'var(--space-9)' }}>Folio {state.contract.folio}</p>
        )}
        {STAGE_HINT[stage] && <p className="lede">{STAGE_HINT[stage]}</p>}

        {stage === 'selected' && <BrideForm sessionId={sessionId} onDone={refresh} />}
        {stage === 'bride_data' && <SheetPrint sessionId={sessionId} state={state} onDone={refresh} />}
        {stage === 'sheet_printed' && <SheetSigned sessionId={sessionId} state={state} onDone={refresh} />}
        {stage === 'sheet_signed' && <Terms sessionId={sessionId} onDone={refresh} />}
        {stage === 'terms' && <ContractPrint sessionId={sessionId} state={state} onDone={refresh} />}
        {stage === 'contract_printed' && <SignContract sessionId={sessionId} state={state} onDone={refresh} />}
        {/* 'signed' y 'payment' no dibujan nada aquí: el efecto de arriba ya
            mandó a la ficha de la clienta en cuanto el folio estuvo listo. */}
      </div>
      {closeControl}
    </Screen>
  )
}

// ────────────────────────────────────────────────────────────── kiosco ──
/**
 * La pantalla de venta de la vendedora: el catálogo en tabla, con miniatura, y
 * un (+) en cada renglón que lo agrega al carrito. Del carrito se pasa
 * directo a las medidas — ya no hay NIP ni «llamar a la vendedora» de por
 * medio: quien lleva la sesión es la vendedora. El carrito se guarda en el
 * servidor como los «favoritos» de la sesión: de ahí sale la demanda del
 * reporte y el apartado de los vestidos.
 */
function Kiosk({ sessionId, onChange, onClosed }: {
  sessionId: number; onChange: () => Promise<void>; onClosed: () => void
}) {
  const closeRef = useRef<CloseControlHandle>(null)
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])
  const accessories = useMemo(() => items.filter((i) => i.kind !== 'dress'), [items])
  const cart = items.filter((i) => i.favorite)

  const filters = useMemo(() => {
    const cuts = [...new Set(dresses.map((d) => d.cut).filter(Boolean))] as string[]
    const bySize = new Map<string, number>()
    for (const d of dresses) {
      if (!d.size || d.size.toLowerCase().includes('medida')) continue
      bySize.set(d.size, (bySize.get(d.size) ?? 0) + 1)
    }
    const sizes = [...bySize.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([size]) => size)
    return [
      ['todos', 'Todos'] as const,
      ['accesorios', 'Accesorios'] as const,
      ...cuts.map((c) => [c, /^corte/i.test(c) ? c : `Corte ${c.toLowerCase()}`] as const),
      ['-25000', 'Hasta $25,000'] as const,
      ...sizes.map((size) => [size, `Talla ${size}`] as const),
    ]
  }, [dresses])

  // El chip «Accesorios» no filtra los vestidos por un dato suyo, como los
  // demás: esconde la tabla de vestidos y deja sólo la de accesorios, que de
  // por sí ya vive siempre debajo.
  const visible = filter === 'accesorios' ? [] : dresses.filter((d) => {
    if (filter === 'todos') return true
    if (filter === '-25000') return d.price_cents <= 2_500_000
    if (d.size === filter) return true
    return d.cut === filter
  })

  async function openDetail(item: KioskItem) {
    setOpen(item)
    await post(`/sessions/${sessionId}/view`, { item_id: item.id }).catch(() => undefined)
    await load()
  }

  async function toggleCart(item: KioskItem) {
    try {
      await post(`/sessions/${sessionId}/favorites`, { item_id: item.id, remove: item.favorite })
      setError(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el carrito.')
    }
  }

  // Se muestra todo, pero lo agotado, incompleto o que otra sesión tiene en su
  // carrito no se puede agregar. Si ya estaba en este carrito, se puede quitar.
  const addBlocked = (item: KioskItem) => !item.favorite && blockReason(item) !== null

  const statusOf = (item: KioskItem): string => (item.favorite ? 'En el carrito' : (blockReason(item) ?? ''))

  function renderTable(rows: KioskItem[], withKind: boolean) {
    return (
      <div className="k-table-wrap">
        <table className="tbl k-table">
          <thead>
            <tr>
              <th aria-label="Foto" />
              <th>Código</th>
              <th>Modelo</th>
              {withKind && <th>Tipo</th>}
              <th>Marca</th>
              <th>Talla</th>
              {!withKind && <th>Corte</th>}
              <th>Color</th>
              {showPrices && <th>Precio</th>}
              <th>Estado</th>
              <th aria-label="Carrito" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className={item.favorite ? 'in-cart' : addBlocked(item) ? 'is-blocked' : undefined} onClick={() => void openDetail(item)}>
                <td><ItemArt item={item} className="k-thumb" /></td>
                <td className="mono">{item.code}</td>
                <td className="model">{item.name}</td>
                {withKind && <td>{item.kind !== 'dress' ? KIND_LABEL[item.kind] : '—'}</td>}
                <td>{item.brand ?? '—'}</td>
                <td>{item.size ?? '—'}</td>
                {!withKind && <td>{item.cut ?? '—'}</td>}
                <td>{item.color ?? '—'}</td>
                {showPrices && <td className="mono">{money(item.price_cents)}</td>}
                <td className={item.favorite ? 'k-state k-state--mine' : 'k-state'}>{statusOf(item)}</td>
                <td>
                  <button
                    type="button"
                    className="cart-add"
                    aria-pressed={item.favorite}
                    aria-label={`${item.favorite ? 'Quitar del carrito' : 'Agregar al carrito'}: ${item.name}`}
                    disabled={addBlocked(item)}
                    onClick={(e) => { e.stopPropagation(); void toggleCart(item) }}
                  >
                    {item.favorite ? '✓' : '+'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Screen
      title={<Brandmark />}
      // Cerrar la sesión es la única forma de salir de aquí, sea por dónde se
      // toque: la flecha y la (X) llevan al mismo NIP.
      onBack={() => closeRef.current?.open()}
      backLabel="Cerrar sesión"
      // Del kiosco, no del sistema: van en la barra, no en el pie, porque el
      // pie es donde vive «Carrito» y tiene que verse siempre, no sólo al
      // llegar al final de la lista.
      right={
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 'var(--space-5)' }}>
          <span className="pill"><span className="dot" />Sesión abierta</span>
          <CloseControl ref={closeRef} sessionId={sessionId} onClosed={onClosed} trigger={(open) => <IconButton kind="close" label="Cerrar sesión" onClick={open} />} />
        </div>
      }
      footer={
        <div className="tray">
          <p>
            {cart.length === 0
              ? 'Toca (+) en lo que se va a llevar.'
              : `${cart.length} ${cart.length === 1 ? 'artículo en el carrito' : 'artículos en el carrito'}.`}
          </p>
          <button type="button" className="btn-main" disabled={cart.length === 0} onClick={() => setCartOpen(true)}>
            {cart.length === 0 ? 'Carrito' : `Carrito (${cart.length})`}
          </button>
        </div>
      }
    >
      <div className="k-filters">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={filter === value}
            // Un filtro nuevo es una lista nueva: si venía de a medio scroll
            // de «Todos», antes se quedaba a media pantalla de una lista que
            // ya no es la misma.
            onClick={() => { setFilter(value); window.scrollTo({ top: 0 }) }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="wrap"><p className="err">{error}</p></div>}

      {filter !== 'accesorios' && (
        visible.length > 0
          ? renderTable(visible, false)
          : <div className="wrap"><p className="lede">Nada con ese filtro. Toca «Todos» para ver todo otra vez.</p></div>
      )}

      {accessories.length > 0 && (
        <div className="wrap" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <h2 style={{ margin: 'var(--space-11) 0 var(--space-6)' }}>Accesorios</h2>
        </div>
      )}
      {accessories.length > 0 && renderTable(accessories, true)}

      {open && (
        <Dialog title={open.name} onCancel={() => setOpen(null)} big>
          <div className="detail">
            <div><PhotoGallery photos={open.photos} itemId={open.id} alt={open.name} /></div>
            <div>
              <p style={{ color: 'var(--ink-faint)', margin: 0 }}>{open.brand}</p>
              <dl>
                {showPrices && <><dt>Precio</dt><dd>{money(open.price_cents)}</dd></>}
                <dt>Código</dt><dd className="mono">{open.code}</dd>
                <dt>Talla</dt><dd>{open.size ?? '—'}</dd>
                <dt>Corte</dt><dd>{open.cut ?? '—'}</dd>
                <dt>Color</dt><dd>{open.color ?? '—'}</dd>
                {blockReason(open) && (<><dt>Estado</dt><dd>{blockReason(open)}</dd></>)}
              </dl>
              <div className="row">
                <button
                  type="button"
                  className="btn-main"
                  disabled={addBlocked(open)}
                  onClick={() => { void toggleCart(open); setOpen(null) }}
                >
                  {open.favorite ? 'Quitar del carrito' : 'Agregar al carrito'}
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {cartOpen && (
        <CartReview
          cart={cart}
          showPrices={showPrices}
          hasAccessories={accessories.length > 0}
          onClose={() => setCartOpen(false)}
          // Cierra el carrito y deja la tabla de accesorios a la vista: el
          // carrito se conserva, sólo se sigue agregando.
          onAddAccessories={() => { setCartOpen(false); setFilter('accesorios'); window.scrollTo({ top: 0 }) }}
          onRemove={toggleCart}
          onContinue={async (dressId, accessoryIds) => {
            await post(`/sessions/${sessionId}/select`, { item_id: dressId, accessory_item_ids: accessoryIds })
            await onChange()
          }}
        />
      )}
    </Screen>
  )
}

/**
 * El carrito: lo que se agregó con el (+), vestido y accesorios juntos, con su
 * total. Un contrato lleva un solo vestido, así que el botón de las medidas
 * espera a que haya exactamente uno y a que nada de lo que hay ya esté
 * apartado o agotado — dice cuál es el problema en vez de quedarse apagado.
 */
function CartReview({ cart, showPrices, hasAccessories, onClose, onAddAccessories, onRemove, onContinue }: {
  cart: KioskItem[]
  showPrices: boolean
  hasAccessories: boolean
  onClose: () => void
  onAddAccessories: () => void
  onRemove: (item: KioskItem) => Promise<void>
  onContinue: (dressId: number, accessoryIds: number[]) => Promise<void>
}) {
  const cartDresses = cart.filter((i) => i.kind === 'dress')
  const cartAccessories = cart.filter((i) => i.kind !== 'dress')
  const blocked = cart.find((i) => blockReason(i) !== null)
  const dress = cartDresses.length === 1 ? (cartDresses[0] as KioskItem) : null

  const problem = cartDresses.length === 0
    ? 'Agrega un vestido para continuar.'
    : cartDresses.length > 1
      ? 'Un contrato lleva un solo vestido: quita los demás.'
      : blocked
        ? `«${blocked.name}» no se puede vender (${(blockReason(blocked) ?? '').toLowerCase()}): quítalo para continuar.`
        : null

  const total = cart.reduce((n, i) => n + i.price_cents, 0)

  return (
    <Dialog
      title="Carrito"
      onCancel={onClose}
      closeLabel="Seguir viendo"
      big
      actions={
        <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
          {hasAccessories && (
            <button type="button" className="btn-quiet" onClick={onAddAccessories}>
              Agregar accesorios
            </button>
          )}
          <ActionButton
            done="Listo"
            disabled={problem !== null}
            onAction={async () => { if (dress) await onContinue(dress.id, cartAccessories.map((a) => a.id)) }}
          >
            Pasar a las medidas
          </ActionButton>
        </div>
      }
    >
      <table className="tbl k-table k-cart">
        <tbody>
          {[...cartDresses, ...cartAccessories].map((item) => (
            <tr key={item.id}>
              <td><ItemArt item={item} className="k-thumb" /></td>
              <td className="model">
                {item.name}
                <span className="falta" style={{ display: 'block' }}>
                  {[item.kind === 'dress' ? 'Vestido' : KIND_LABEL[item.kind], item.code, item.size && `talla ${item.size}`].filter(Boolean).join(' · ')}
                </span>
              </td>
              {showPrices && <td className="mono">{money(item.price_cents)}</td>}
              <td>
                {blockReason(item) && <span className="state late">{blockReason(item)}</span>}
              </td>
              <td>
                <button type="button" className="btn-quiet" style={{ minHeight: 44 }} onClick={() => void onRemove(item)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showPrices && (
        <p className="inv-head" style={{ marginTop: 'var(--space-8)' }}>
          <span style={{ fontWeight: 'var(--weight-medium)' }}>Total</span>
          <span className="money">{money(total)}</span>
        </p>
      )}
      {problem
        ? <p className="state late" role="status">{problem}</p>
        : cartAccessories.length === 0 && <p className="muted">Sin accesorios todavía: puedes volver y agregarlos con (+).</p>}
    </Dialog>
  )
}

/**
 * La máscara del teléfono: "+52 " fijo y diez huecos en grupos de 2-4-4,
 * rellenados de izquierda a derecha con lo que ya se tecleó. Los tres
 * ayudantes son puro texto, sin estado de React, para poder llamarlos desde el
 * mismo `onInput` sin controlar el campo — así el autocompletado del navegador
 * también pasa por aquí y sale bien formateado.
 */
function formatPhoneMask(digits: string): string {
  const slots = digits.padEnd(10, '_').split('')
  const group = (from: number, to: number) => slots.slice(from, to).join('')
  return `+52 ${group(0, 2)} ${group(2, 6)} ${group(6, 10)}`
}

/** Todo lo que sigue al «+52» fijo, sin espacios ni huecos: los dígitos reales. */
function phoneDigitsFromMasked(raw: string): string {
  const rest = raw.startsWith('+52') ? raw.slice(3) : raw
  return rest.replace(/\D/g, '')
}

/** Dónde debe quedar el cursor después de formatear, para que borrar borre el
 * último dígito de verdad y no un espacio o un guion bajo de la máscara. */
function phoneMaskCaret(digitCount: number): number {
  if (digitCount <= 2) return 4 + digitCount
  if (digitCount <= 6) return 5 + digitCount
  return 6 + digitCount
}

// ───────────────────────────────────────────────────── datos de novia ──
function BrideForm({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form ref={form} className="panel" onSubmit={(e) => e.preventDefault()}>
      {/*
        Los campos van sin estado de React a propósito: el autocompletado de
        Chrome llena el DOM sin disparar onChange, y un formulario controlado se
        queda creyendo que están vacíos. Al guardar se leen del DOM con
        FormData, que siempre ve lo que la vendedora tiene enfrente.
      */}
      <div className="two">
        <div className="field">
          <label htmlFor="bride-name">Nombre</label>
          <input id="bride-name" name="name" type="text" autoComplete="given-name" />
        </div>
        <div className="field">
          <label htmlFor="bride-apellido">Apellido</label>
          <input id="bride-apellido" name="apellido" type="text" autoComplete="family-name" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="bride-phone">Teléfono</label>
        {/*
          El «+52» es fijo: no se puede borrar, y no viaja con el número. Lo
          que ve la vendedora es la máscara «+52 __ ____ ____»; lo que se
          guarda —en el campo oculto que de verdad manda el formulario— son
          sólo los 10 dígitos, sin prefijo y sin espacios, igual que antes.
          La máscara arranca en gris (`mask-empty`): en negro se leía como si
          ya hubiera un número tecleado.
        */}
        <input
          id="bride-phone"
          className="mask-empty"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          defaultValue={formatPhoneMask('')}
          onFocus={(e) => {
            // Si todavía no hay nada tecleado, el cursor arranca después del prefijo.
            const el = e.currentTarget
            const n = phoneDigitsFromMasked(el.value).length
            if (n === 0) el.setSelectionRange(4, 4)
          }}
          onInput={(e) => {
            const el = e.currentTarget
            const digits = phoneDigitsFromMasked(el.value).slice(0, 10)
            el.value = formatPhoneMask(digits)
            el.classList.toggle('mask-empty', digits.length === 0)
            const caret = phoneMaskCaret(digits.length)
            el.setSelectionRange(caret, caret)
            const hidden = el.form?.elements.namedItem('phone')
            if (hidden instanceof HTMLInputElement) hidden.value = digits
          }}
        />
        <input type="hidden" name="phone" defaultValue="" />
        <p className="err" style={{ color: 'var(--ink-faint)' }}>10 dígitos</p>
      </div>
      <div className="field">
        <label htmlFor="bride-wedding">Fecha del evento</label>
        {/*
          En su propio renglón, a todo lo ancho: apretada en la columna
          derecha del par de campos, el calendario nativo abría del lado
          contrario al que se tocaba —pegado al borde de la pantalla, el
          navegador lo volteaba para que cupiera—. Con todo el ancho libre
          alrededor, abre junto al icono que se tocó.
        */}
        <input
          id="bride-wedding"
          className="mask-empty"
          name="wedding_date"
          type="date"
          min={today}
          onChange={(e) => e.currentTarget.classList.toggle('mask-empty', !e.currentTarget.value)}
        />
        <p className="err" style={{ color: 'var(--ink-faint)' }}>Déjala vacía sólo si de verdad no hay fecha</p>
      </div>

      <ActionButton
        onAction={async () => {
          const data = new FormData(form.current as HTMLFormElement)
          const value = (key: string) => String(data.get(key) ?? '').trim()
          await post(`/sessions/${sessionId}/bride`, {
            name: value('name'),
            apellido: value('apellido'),
            phone: value('phone'),
            wedding_date: value('wedding_date') || null,
          })
          await onDone()
        }}
      >
        Guardar y seguir
      </ActionButton>
    </form>
  )
}

// ─────────────────────────────────── hoja de medidas y contrato ────────
function SheetPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const [asking, setAsking] = useState(true)
  const [printing, setPrinting] = useState(false)
  const folio = state.contract?.folio ?? ''

  if (printing) {
    return (
      <PrintOverlay>
        <PrintMedidas folio={folio} onBack={() => { setPrinting(false); void onDone() }} />
      </PrintOverlay>
    )
  }

  return (
    <div className="panel">
      <button type="button" className="btn-main" onClick={() => setAsking(true)}>Imprimir la hoja de medidas</button>

      {asking && (
        <Dialog
          title="Imprimir la hoja de medidas"
          onCancel={() => setAsking(false)}
          narrow
          actions={
            <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
              {/* La misma llamada al servidor en los dos casos: lo único que
                  cambia es si se abre la vista de impresión o se salta
                  derecho a la foto de la hoja ya firmada. */}
              <ActionButton
                className="btn-quiet"
                done="Lista"
                onAction={async () => {
                  await post(`/sessions/${sessionId}/sheet-printed`)
                  setAsking(false)
                  await onDone()
                }}
              >
                Ya la tengo impresa
              </ActionButton>
              <ActionButton
                done="Impresa"
                onAction={async () => {
                  await post(`/sessions/${sessionId}/sheet-printed`)
                  setAsking(false)
                  setPrinting(true)
                }}
              >
                Imprimir
              </ActionButton>
            </div>
          }
        >
          <p className="lede">
            Se van a imprimir <b>2 copias</b> con el folio {folio}. Todos los campos de medida salen en blanco.
          </p>
        </Dialog>
      )}
    </div>
  )
}

function SheetSigned({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const has = state.documents.some((d) => d.kind === 'measurement_sheet')
  const [printing, setPrinting] = useState(false)
  const folio = state.contract?.folio ?? ''

  if (printing) {
    return (
      <PrintOverlay>
        <PrintMedidas folio={folio} onBack={() => setPrinting(false)} />
      </PrintOverlay>
    )
  }

  return (
    <div className="panel">
      <div className="field">
        <label>Hoja de medidas firmada</label>
        <PhotoCapture kind="measurement_sheet" contractId={state.contract?.id} label="Tomar foto de la hoja" onUploaded={onDone} />
      </div>
      <div className="row">
        <ActionButton disabled={!has} onAction={async () => { await post(`/sessions/${sessionId}/sheet-signed`); await onDone() }}>
          Seguir al plan de pago
        </ActionButton>
        <button type="button" className="btn-quiet" onClick={() => setPrinting(true)}>Volver a imprimir</button>
      </div>
      {!has && <p className="err" style={{ color: 'var(--ink-faint)' }}>Primero toma la foto.</p>}
    </div>
  )
}

interface Offer {
  plan: { id: number; name: string; discount_pct: number }
  total_cents: number
  discount_cents: number
  schedule: { seq: number; due_type: 'fixed' | 'on_pickup'; due_date: string | null; amount_cents: number }[]
}
interface Rejection { plan_name: string; reason: string; detail: string }

function Terms({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [rejected, setRejected] = useState<Rejection[]>([])
  const [weddingDate, setWeddingDate] = useState<string | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    post<{ offers: Offer[]; rejected: Rejection[]; wedding_date: string | null }>(`/sessions/${sessionId}/quote`, {})
      .then((data) => {
        setOffers(data.offers)
        setRejected(data.rejected ?? [])
        setWeddingDate(data.wedding_date)
        // Con un solo plan posible no hay nada que escoger.
        if (data.offers.length === 1) setChosen((data.offers[0] as Offer).plan.id)
      })
      .catch((err: Error) => setError(err.message))
  }, [sessionId])

  if (error) return <p className="err">{error}</p>
  if (!offers) return <span className="spinner" aria-hidden="true" />

  return (
    <>
      {!weddingDate && (
        <p className="lede">Sin fecha de evento sólo se pueden ofrecer los planes que se liquidan al recoger el vestido.</p>
      )}

      {offers.length === 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Ningún plan cabe todavía</h3>
          <div className="hist">
            {rejected.map((r) => (
              <div key={r.plan_name}><span>{r.plan_name}</span><span className="muted">{r.detail}</span></div>
            ))}
          </div>
        </div>
      )}

      {/*
        El panel entero es el botón. Antes sólo se podía escoger tocando un chip
        chiquito al final de cada panel; quien tocaba el panel se quedaba con el
        plan sin escoger y «Guardar el plan» no hacía nada, sin decir por qué.
      */}
      {offers.map((offer) => (
        <button
          key={offer.plan.id}
          type="button"
          className={`panel plan-card${chosen === offer.plan.id ? ' is-chosen' : ''}`}
          aria-pressed={chosen === offer.plan.id}
          onClick={() => setChosen(offer.plan.id)}
        >
          <div className="inv-head" style={{ marginBottom: 'var(--space-8)' }}>
            <div>
              <h3>{offer.plan.name}</h3>
              {offer.discount_cents > 0 && <span className="state">Descuento de {money(offer.discount_cents)}</span>}
            </div>
            <p className="money">{money(offer.total_cents)}</p>
          </div>
          <table className="sched">
            <thead><tr><th>Pago</th><th>Vence</th><th>Monto</th></tr></thead>
            <tbody>
              {offer.schedule.map((row) => (
                <tr key={row.seq}>
                  <td>{row.seq} de {offer.schedule.length}</td>
                  <td>{row.due_type === 'on_pickup' ? 'Al recoger el vestido' : row.due_date?.split('-').reverse().join('/')}</td>
                  <td className="mono">{money(row.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen === offer.plan.id && <span className="plan-card__mark">Plan escogido</span>}
        </button>
      ))}

      {offers.length > 0 && (
        <div className="sticky-action">
          <ActionButton
            disabled={chosen === null}
            done="Plan guardado"
            onAction={async () => { await post(`/sessions/${sessionId}/terms`, { plan_id: chosen }); await onDone() }}
          >
            Guardar el plan
          </ActionButton>
          {chosen === null && <p className="muted">Toca uno de los planes de arriba.</p>}
        </div>
      )}
    </>
  )
}

/*
 * «Imprimir el contrato» ya no es su propia pantalla: es el mismo diálogo
 * emergente que la hoja de medidas usa para el reimpreso, encima de la
 * pantalla de «Foto del contrato firmado» — que se ve debajo, deshabilitada,
 * porque todavía no hay nada que fotografiar.
 */
function ContractPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const folio = state.contract?.folio ?? ''
  const [printing, setPrinting] = useState(false)
  const [asking, setAsking] = useState(true)

  if (printing) {
    return (
      <PrintOverlay>
        <PrintContrato folio={folio} onBack={() => setPrinting(false)} />
      </PrintOverlay>
    )
  }

  return (
    <div className="panel">
      <div className="field">
        <label>Contrato firmado</label>
        <p className="muted">Imprime el contrato primero para poder tomarle la foto.</p>
      </div>
      <button type="button" className="btn-main" disabled>Activar el contrato</button>

      {!asking && (
        <button type="button" className="btn-quiet" style={{ marginTop: 'var(--space-8)' }} onClick={() => setAsking(true)}>
          Imprimir el contrato
        </button>
      )}

      {asking && (
        <Dialog
          title="Imprimir el contrato"
          onCancel={() => setAsking(false)}
          narrow
          actions={
            <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
              {/* La misma llamada al servidor en los dos casos: lo único que
                  cambia es si se abre la vista de impresión o se salta
                  derecho a la foto del contrato firmado. */}
              <ActionButton
                className="btn-quiet"
                done="Listo"
                onAction={async () => { await post(`/sessions/${sessionId}/contract-printed`); await onDone() }}
              >
                Ya lo tengo impreso
              </ActionButton>
              <ActionButton
                done="Impreso"
                onAction={async () => {
                  await post(`/sessions/${sessionId}/contract-printed`)
                  setAsking(false)
                  setPrinting(true)
                }}
              >
                Imprimir
              </ActionButton>
            </div>
          }
        >
          <p className="lede">
            Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo, con el folio {folio}.
          </p>
        </Dialog>
      )}
    </div>
  )
}

function SignContract({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const navigate = useNavigate()
  const has = state.documents.some((d) => d.kind === 'contract')
  // ActionButton ya dibuja el mensaje del error; aquí sólo interesa si fue el
  // del calendario viejo, que es el único que ofrece una salida.
  const [stale, setStale] = useState(false)

  return (
    <div className="panel">
      <div className="field">
        <label>Contrato firmado</label>
        <PhotoCapture kind="contract" contractId={state.contract?.id} label="Tomar foto del contrato" onUploaded={onDone} />
      </div>
      {/* Antes se podía tocar sin foto: el servidor lo rechazaba, pero el
          botón se veía activo mientras la pantalla decía que faltaba. */}
      <ActionButton
        disabled={!has}
        done="Contrato activo"
        onAction={async () => {
          try {
            // Firmar cierra la sesión en el servidor en el mismo instante:
            // no hay ya ni una recarga de por medio a la que esperar. Se
            // navega directo con el folio que la respuesta ya trae —volver a
            // pedir el estado de una sesión que el propio servidor acaba de
            // cerrar sólo la mandaría de regreso a los cuadros de entrada.
            const { folio } = await post<{ folio: string }>(`/sessions/${sessionId}/sign`)
            localStorage.removeItem(SESSION_KEY)
            navigate(`/clientes?folio=${encodeURIComponent(folio)}`, true)
          } catch (err) {
            // El calendario impreso ya no es el de hoy: hay que reimprimir, no
            // corregir el papel ni la base a escondidas.
            if (err instanceof ApiError) setStale(err.code === 'stale_schedule')
            throw err
          }
        }}
      >
        Activar el contrato
      </ActionButton>
      {stale && state.contract?.plan_id && (
        <div className="row" style={{ marginTop: 'var(--space-8)' }}>
          <ActionButton
            done="Listo para imprimir"
            onAction={async () => {
              // Vuelve a generar el calendario con la fecha de hoy y regresa la
              // sesión al paso de imprimir el contrato.
              await post(`/sessions/${sessionId}/terms`, { plan_id: state.contract?.plan_id })
              await onDone()
            }}
          >
            Volver a imprimir
          </ActionButton>
        </div>
      )}
      {!has && <p className="err" style={{ color: 'var(--ink-faint)' }}>Falta la foto del contrato firmado.</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── cierre ──
export const LOST_REASONS = [
  { value: 'precio', label: 'Precio' },
  { value: 'no le gustaron los modelos', label: 'No le gustaron los modelos' },
  { value: 'quiere pensarlo', label: 'Quiere pensarlo' },
  { value: 'va a comparar', label: 'Va a comparar en otra tienda' },
  { value: 'no hay su talla', label: 'No hay su talla' },
  { value: 'otro', label: 'Otro' },
] as const

export interface CloseControlHandle { open: () => void }

/**
 * El disparador es reemplazable: en la mayoría de los pasos es el botón
 * «Cerrar sesión» del pie, pero en «Datos de la novia» es la (X) de la barra,
 * como en el resto de la aplicación. Cerrar pide sólo el NIP de la vendedora:
 * ya no se pregunta cómo terminó. La única pregunta que puede salir es la
 * confirmación de destruir las hojas de medidas, y sólo si se imprimieron y
 * no hubo contrato — el servidor no deja cerrar sin ella.
 */
export const CloseControl = forwardRef<CloseControlHandle, {
  sessionId: number
  onClosed: () => void
  trigger?: (open: () => void) => ReactNode
}>(function CloseControl({ sessionId, onClosed, trigger }, ref) {
  const { signOutToEntry } = useSession()
  const [step, setStep] = useState<'closed' | 'pin' | 'sheets'>('closed')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() { setStep('closed'); setPin(''); setError(null); setPinError(null) }

  useImperativeHandle(ref, () => ({ open: () => setStep('pin') }), [])

  async function close(value: string, sheetsDisposed?: boolean) {
    await post(`/sessions/${sessionId}/close`, { pin: value, sheets_disposed: sheetsDisposed || undefined })
    onClosed()
  }

  return (
    <>
      {trigger ? trigger(() => setStep('pin')) : (
        <button type="button" className="btn-quiet" onClick={() => setStep('pin')}>Cerrar sesión</button>
      )}

      {step === 'pin' && (
        // El teclado es el mismo de siempre y queda en el centro exacto de la
        // pantalla, como en la entrada: aquí no se dibuja uno aparte. El NIP
        // se confirma contra el servidor y con él mismo se cierra la sesión.
        <Dialog title="Cerrar la sesión" onCancel={reset} closeLabel="Cancelar, seguir en la sesión" full big>
          <PinPad
            hint="Se sueltan las marcas de «viendo ahora». Pide el NIP a la vendedora."
            error={pinError}
            busy={pinBusy}
            onSubmit={async (value) => {
              setPinError(null)
              setPinBusy(true)
              try {
                await close(value)
              } catch (err) {
                if (err instanceof UnauthorizedError) { void signOutToEntry('Tu sesión expiró. Vuelve a marcar tu NIP.'); return }
                if (err instanceof ApiError && err.status === 409 && err.message.includes('destruiste')) {
                  setPin(value)
                  setStep('sheets')
                  return
                }
                setPinError(err instanceof ApiError ? err.message : 'No se pudo cerrar. Vuelve a intentar.')
              } finally {
                setPinBusy(false)
              }
            }}
          />
        </Dialog>
      )}

      {step === 'sheets' && (
        <Dialog title="Hojas de medidas" onCancel={reset} closeLabel="Cancelar" narrow>
          <p>Se imprimieron hojas de medidas y no hubo contrato. Destruye las hojas firmadas de esta sesión antes de cerrar.</p>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 'var(--space-9)' }}>
            <ActionButton
              onAction={async () => {
                try {
                  await close(pin, true)
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'No se pudo cerrar. Vuelve a intentar.')
                  throw err
                }
              }}
            >
              Ya las destruí, cerrar sesión
            </ActionButton>
          </div>
        </Dialog>
      )}
    </>
  )
})
