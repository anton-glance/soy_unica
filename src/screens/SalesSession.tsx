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
import { Chips, Field } from '../components/Field'
import { PrintMedidas } from './PrintMedidas'
import { PrintContrato } from './PrintContrato'
import { ScrollRail } from '../components/ScrollRail'

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

export interface KioskItem {
  id: number; code: string; name: string; brand: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; size: string | null; cut: string | null; color: string | null
  price_cents: number; held_by_other: boolean; held_by_me: boolean; favorite: boolean
  photos: string[]
}

/** La miniatura de una tarjeta: su foto principal, o el dibujo genérico si no tiene. */
function ItemArt({ item, className = 'art' }: { item: KioskItem; className?: string }) {
  const photo = item.photos[0]
  return photo ? <img src={`/api/files/${photo}`} alt="" className={className} /> : <GownArt seed={item.id} className={className} />
}

/**
 * El tipo de accesorio, para los chips rápidos de «Agregar accesorios» —
 * mismas categorías que el desplegable «Accesorios» del sitio (mantillas,
 * bolero, capa, tiaras, cintos). No hay un campo `type` en la base: se lee
 * del nombre, igual que el importador del catálogo decide si algo es
 * accesorio cuando el sitio no le dio categoría.
 */
const ACCESSORY_TYPES: [RegExp, string][] = [
  [/mantilla/i, 'Mantillas'],
  [/bolero/i, 'Bolero'],
  [/\bcapa\b/i, 'Capa'],
  [/tiara|tocado|corona/i, 'Tiaras'],
  [/cint(?:o|ur[oó]n)/i, 'Cintos'],
  [/velo/i, 'Velos'],
  [/crinolina/i, 'Crinolina'],
  [/liga/i, 'Ligas'],
]
function accessoryType(item: KioskItem): string {
  const hay = `${item.name} ${item.code}`
  return ACCESSORY_TYPES.find(([re]) => re.test(hay))?.[1] ?? 'Otros'
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
type KioskView =
  | { at: 'catalog' }
  | { at: 'favorites' }
  | { at: 'handover' }
  | { at: 'pin' }
  | { at: 'selection'; pin: string }

/**
 * La pantalla de la novia. No hay aquí ni un camino al contrato: puede ver
 * vestidos, marcarlos y llamar a la vendedora. Todo lo demás —elegir el
 * vestido, sus datos, el contrato— pasa por el NIP de la vendedora, que además
 * se vuelve a comprobar en el servidor al crear el contrato.
 */
function Kiosk({ sessionId, onChange, onClosed }: {
  sessionId: number; onChange: () => Promise<void>; onClosed: () => void
}) {
  const { signOutToEntry } = useSession()
  const closeRef = useRef<CloseControlHandle>(null)
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [view, setView] = useState<KioskView>({ at: 'catalog' })
  const [pinError, setPinError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El id del corazón que se acaba de agregar: le pone la animación una vez y
  // se limpia solo cuando termina.
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])
  const accessories = useMemo(() => items.filter((i) => i.kind === 'accessory'), [items])
  // «Favoritos» son todo lo que se marcó con el corazón, vestidos y
  // accesorios juntos: antes sólo contaba vestidos y un accesorio marcado
  // desaparecía sin dejar rastro — no en «Mis favoritos», no como accesorio
  // ya elegido al llegar a «Elige el vestido».
  const favs = items.filter((i) => i.favorite)

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
  // demás: esconde el vestidor entero y deja sólo la sección de accesorios,
  // que de por sí ya vive siempre debajo.
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

  async function toggleFavorite(item: KioskItem) {
    const adding = !item.favorite
    await post(`/sessions/${sessionId}/favorites`, { item_id: item.id, remove: item.favorite })
    if (adding) setJustAdded(item.id)
    await load()
  }

  // Vestidos y accesorios comparten la misma tarjeta: la misma foto grande, el
  // mismo corazón y el mismo diálogo de detalle al tocarla.
  function renderCard(item: KioskItem) {
    return (
      <div key={item.id} className={`card${item.held_by_other ? ' busy' : ''}${item.held_by_me ? ' mine' : ''}`}>
        <button
          type="button"
          className="card-hit"
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0 }}
          onClick={() => void openDetail(item)}
          aria-label={`Ver ${item.name}`}
        >
          <ItemArt item={item} />
          <span className="meta" style={{ display: 'block' }}>
            <span className="name">{item.name}</span>
            <span className="brand" style={{ display: 'block' }}>
              {[item.brand, item.size && `talla ${item.size}`].filter(Boolean).join(' · ')}
            </span>
            {showPrices && <span className="price" style={{ display: 'block' }}>{money(item.price_cents)}</span>}
          </span>
        </button>
        {item.held_by_other && <span className="tag">La está viendo otra clienta</span>}
        {!item.held_by_other && item.held_by_me && <span className="tag">Lo estás viendo</span>}
        {/*
          El corazón es su propio botón, hermano del que abre el detalle, no
          un hijo suyo: tocarlo no debe encoger la tarjeta entera, sólo él
          mismo (`.heart:active`, en base.css).
        */}
        <button
          type="button"
          className="heart"
          aria-pressed={item.favorite}
          aria-label={`Me gusta ${item.name}`}
          onClick={() => void toggleFavorite(item)}
        >
          {item.favorite ? '♥' : '♡'}
        </button>
        {justAdded === item.id && (
          <span className="heart-pop" aria-hidden="true" onAnimationEnd={() => setJustAdded(null)}>♥</span>
        )}
      </div>
    )
  }

  // El NIP abre la pantalla de selección de la vendedora, o la saca del kiosco.
  if (view.at === 'pin') {
    return (
      <Screen
        title="NIP de la vendedora"
        onBack={() => { setView({ at: 'catalog' }); setPinError(null) }}
        backLabel="Regresar al catálogo"
      >
        <PinPad
          error={pinError}
          onSubmit={async (pin) => {
            setPinError(null)
            try {
              // Queda escrito en la sesión con los favoritos que se van al probador.
              await post(`/sessions/${sessionId}/handover`, { pin })
              await onChange()
              setView({ at: 'selection', pin })
            } catch (err) {
              if (err instanceof UnauthorizedError) { void signOutToEntry('Tu sesión expiró. Vuelve a marcar tu NIP.'); return }
              setPinError(err instanceof ApiError ? err.message : 'No se pudo continuar. Vuelve a intentar.')
            }
          }}
        />
      </Screen>
    )
  }

  if (view.at === 'selection') {
    return (
      <SelectionScreen
        sessionId={sessionId}
        pin={view.pin}
        favorites={favs.filter((f) => f.kind === 'dress')}
        accessories={accessories}
        showPrices={showPrices}
        onBack={() => setView({ at: 'catalog' })}
        onDone={onChange}
      />
    )
  }

  return (
    <Screen
      title={<Brandmark />}
      // Antes esto abría «Pásale la tablet a la vendedora» — un camino
      // completamente distinto de la (X), que cierra la sesión. Los dos
      // deben llevar al mismo lugar: cerrar la sesión es la única forma de
      // salir de aquí, sea por dónde se toque.
      onBack={() => closeRef.current?.open()}
      backLabel="Cerrar sesión"
      // Del kiosco, no del sistema: van en la barra, no en el pie, porque el
      // pie es donde vive «Ver mis favoritos» y tiene que verse siempre, no
      // sólo al llegar al final de la lista.
      right={
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 'var(--space-5)' }}>
          <span className="pill"><span className="dot" />Sesión abierta</span>
          {/*
            (X), no un botón de texto: «Cerrar sesión» junto a la píldora no
            cabía en una sola línea en la tableta en vertical (1200 px de
            ancho) y la píldora se cortaba a la mitad. La cruz libera el ancho
            que la píldora necesita.
          */}
          <CloseControl ref={closeRef} sessionId={sessionId} onClosed={onClosed} askBride trigger={(open) => <IconButton kind="close" label="Cerrar sesión" onClick={open} />} />
        </div>
      }
      footer={
        <div className="tray">
          <p>
            {favs.length === 0
              ? 'Toca el corazón de lo que te guste. La vendedora lo traerá para probar.'
              : `${favs.length} ${favs.length === 1 ? 'favorito guardado' : 'favoritos guardados'}. Muéstrale la lista a la vendedora cuando quieras probártelos.`}
          </p>
          <button type="button" className="btn-main" disabled={favs.length === 0} onClick={() => setView({ at: 'favorites' })}>
            {favs.length === 0 ? 'Ver mis favoritos' : `Ver mis favoritos (${favs.length})`}
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
        <div className="grid">
          {visible.map(renderCard)}
          {visible.length === 0 && <p className="lede">Nada con ese filtro. Toca «Todos» para ver todo otra vez.</p>}
        </div>
      )}

      {accessories.length > 0 && (
        <div className="wrap" style={{ paddingTop: 0 }}>
          <hr style={{ border: 0, borderTop: '1px solid var(--tape)', margin: '0 0 var(--space-11)' }} />
          <h2 style={{ marginBottom: 'var(--space-9)' }}>Accesorios</h2>
        </div>
      )}
      {accessories.length > 0 && <div className="grid">{accessories.map(renderCard)}</div>}

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
                {open.held_by_other && (<><dt>Disponibilidad</dt><dd>La está viendo otra clienta</dd></>)}
              </dl>
              <div className="row">
                <button type="button" className="btn-main" onClick={() => { void toggleFavorite(open); setOpen(null) }}>
                  {open.favorite ? 'Quitar de favoritos' : 'Me gusta'}
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {view.at === 'favorites' && (
        <FavoritesReview
          favs={favs}
          showPrices={showPrices}
          onClose={() => setView({ at: 'catalog' })}
          onRemove={toggleFavorite}
          onCall={() => setView({ at: 'handover' })}
        />
      )}

      {view.at === 'handover' && (
        <Dialog
          title="Pásale la tablet a la vendedora"
          onCancel={() => setView({ at: 'catalog' })}
          closeLabel="Seguir viendo"
          narrow
          actions={
            <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
              <button type="button" className="btn-quiet" style={{ flex: 1 }} onClick={() => setView({ at: 'catalog' })}>
                De acuerdo
              </button>
              <button type="button" className="btn-main" style={{ flex: 1 }} onClick={() => setView({ at: 'pin' })}>
                Soy la vendedora
              </button>
            </div>
          }
        >
          <p className="lede">Ella sigue desde aquí.</p>
        </Dialog>
      )}
    </Screen>
  )
}

/**
 * B1 — Los favoritos son una revisión, no una segunda elección: la novia ya
 * escogió. Se ven todos, en una fila que se desliza cuando no caben, y el botón
 * principal está siempre disponible.
 */
function FavoritesReview({ favs, showPrices, onClose, onRemove, onCall }: {
  favs: KioskItem[]
  showPrices: boolean
  onClose: () => void
  onRemove: (item: KioskItem) => Promise<void>
  onCall: () => void
}) {
  return (
    <Dialog
      title="Mis favoritos"
      onCancel={onClose}
      closeLabel="Seguir viendo vestidos"
      big
      actions={
        <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
          <button type="button" className="btn-main" onClick={onCall}>Llamar a la vendedora</button>
        </div>
      }
    >
      <p style={{ color: 'var(--ink-soft)', margin: '0 0 var(--space-11)' }}>
        {favs.length === 1
          ? 'La vendedora lo traerá al probador.'
          : 'La vendedora traerá todo esto al probador.'}
      </p>

      {/*
        Se desliza de lado: nunca empuja el botón fuera de la pantalla. Cada
        tarjeta es idéntica a sus vecinas — misma foto, luego el nombre, luego
        el precio, nada más — así ninguna se ve más alta o más ancha que las
        demás según cuánto texto le tocó. Los accesorios llevan su propia
        etiqueta: en esta fila viven junto a los vestidos y sin ella no se
        distinguían.
      */}
      <ScrollRail>
        {favs.map((d) => (
          <figure key={d.id} className="fav-rail__item">
            <div style={{ position: 'relative' }}>
              <ItemArt item={d} />
              {d.kind === 'accessory' && <span className="tag tag--right">Accesorio</span>}
            </div>
            <figcaption>{d.name}</figcaption>
            {showPrices && <p className="mono">{money(d.price_cents)}</p>}
            <button
              type="button"
              className="btn-quiet"
              style={{ marginTop: 'var(--space-3)', minHeight: 44, width: '100%' }}
              onClick={() => void onRemove(d)}
            >
              Quitar
            </button>
          </figure>
        ))}
      </ScrollRail>
    </Dialog>
  )
}

/**
 * B3 — La pantalla de la vendedora. Ve lo que la novia marcó, escoge uno,
 * puede añadir accesorios y confirma. Elegir aquí es lo que aparta el vestido y
 * suelta los demás favoritos.
 */
function SelectionScreen({ sessionId, pin, favorites, accessories, showPrices, onBack, onDone }: {
  sessionId: number
  pin: string
  favorites: KioskItem[]
  accessories: KioskItem[]
  showPrices: boolean
  onBack: () => void
  onDone: () => Promise<void>
}) {
  // Un vestido que otra tableta está viendo no se puede escoger: el servidor lo
  // rechazaría con un 409 y la vendedora se quedaría con el error en la cara.
  // Se marca aquí, antes de que lo toque.
  const pickable = favorites.filter((f) => !f.held_by_other)
  const [dress, setDress] = useState<number | null>(pickable.length === 1 ? (pickable[0] as KioskItem).id : null)
  // Los accesorios que la novia ya marcó con el corazón en el catálogo llegan
  // aquí preseleccionados: no hace falta que la vendedora los vuelva a buscar
  // y marcar uno por uno.
  const [picked, setPicked] = useState<number[]>(() => accessories.filter((a) => a.favorite).map((a) => a.id))
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [accType, setAccType] = useState('Todos')
  const [openAccessory, setOpenAccessory] = useState<KioskItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  const accessoryTypes = useMemo(
    () => ['Todos', ...[...new Set(accessories.map(accessoryType))].sort()],
    [accessories],
  )
  const visibleAccessories = accType === 'Todos' ? accessories : accessories.filter((a) => accessoryType(a) === accType)

  const chosenDress = favorites.find((f) => f.id === dress) ?? null
  const chosenAccessories = accessories.filter((a) => picked.includes(a.id))

  return (
    <Screen
      title="Elige el vestido"
      onBack={onBack}
      backLabel="Regresar al catálogo"
      footer={
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn-quiet" onClick={() => setCatalogOpen(true)}>
            Agregar accesorios{chosenAccessories.length > 0 ? ` (${chosenAccessories.length})` : ''}
          </button>
          <button type="button" className="btn-main" disabled={dress === null} onClick={() => setConfirming(true)}>
            Continuar
          </button>
        </div>
      }
    >
      <div className="wrap">
        <p className="lede">
          Llévale al probador todos los vestidos que marcó. Cuando ya se los haya probado y se
          decida por uno, márcalo aquí abajo y ofrécele accesorios antes de continuar.
        </p>

        <div className="grid grid--tight">
          {favorites.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`pick-card${dress === d.id ? ' is-chosen' : ''}${d.held_by_other ? ' is-taken' : ''}`}
              aria-pressed={dress === d.id}
              disabled={d.held_by_other}
              onClick={() => setDress(d.id)}
            >
              <ItemArt item={d} />
              <span className="meta" style={{ display: 'block' }}>
                <span className="name" style={{ display: 'block' }}>{d.name}</span>
                <span className="brand" style={{ display: 'block' }}>
                  {[d.code, d.color, d.size && `talla ${d.size}`].filter(Boolean).join(' · ')}
                </span>
                {showPrices && <span className="price" style={{ display: 'block' }}>{money(d.price_cents)}</span>}
                {d.held_by_other && <span className="state late">La está viendo otra clienta</span>}
              </span>
            </button>
          ))}
        </div>

        {chosenAccessories.length > 0 && (
          <>
            <h3 style={{ margin: 'var(--space-11) 0 var(--space-6)' }}>Accesorios</h3>
            <div className="hist">
              {chosenAccessories.map((a) => (
                <div key={a.id}>
                  <span>{a.name} <span className="muted mono">{a.code}</span></span>
                  <span className="row" style={{ alignItems: 'center' }}>
                    <span className="mono">{money(a.price_cents)}</span>
                    <button type="button" className="btn-quiet" onClick={() => setPicked((p) => p.filter((id) => id !== a.id))}>
                      Quitar
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/*
        Misma vista que el catálogo del kiosco: retícula de foto grande, el
        corazón para marcarlo ahí mismo — no un marco alrededor de toda la
        tarjeta, que se confundía con «se está cargando» — y el detalle,
        con foto más grande y la descripción, al tocar la tarjeta.
      */}
      {catalogOpen && (
        <Dialog title="Accesorios" onCancel={() => setCatalogOpen(false)} closeLabel="Listo" big>
          {accessories.length === 0 ? (
            <p className="lede">No hay accesorios en esta sucursal.</p>
          ) : (
            <>
              {accessoryTypes.length > 2 && (
                <div className="k-filters k-filters--sheet" style={{ padding: '0 0 var(--space-8)' }}>
                  {accessoryTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="chip"
                      aria-pressed={accType === t}
                      onClick={(e) => { setAccType(t); e.currentTarget.closest('.sheet-body')?.scrollTo({ top: 0 }) }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid--tight">
                {visibleAccessories.map((a) => (
                  <div key={a.id} className="card">
                    <button
                      type="button"
                      className="card-hit"
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0 }}
                      onClick={() => setOpenAccessory(a)}
                      aria-label={`Ver ${a.name}`}
                    >
                      <ItemArt item={a} />
                      <span className="meta" style={{ display: 'block' }}>
                        <span className="name">{a.name}</span>
                        <span className="brand" style={{ display: 'block' }}>{a.code}</span>
                        {showPrices && <span className="price" style={{ display: 'block' }}>{money(a.price_cents)}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="heart"
                      aria-pressed={picked.includes(a.id)}
                      aria-label={`Agregar ${a.name}`}
                      onClick={() => setPicked((p) => (p.includes(a.id) ? p.filter((id) => id !== a.id) : [...p, a.id]))}
                    >
                      {picked.includes(a.id) ? '♥' : '♡'}
                    </button>
                  </div>
                ))}
                {visibleAccessories.length === 0 && <p className="lede">Nada con ese filtro.</p>}
              </div>
            </>
          )}
        </Dialog>
      )}

      {openAccessory && (
        <Dialog title={openAccessory.name} onCancel={() => setOpenAccessory(null)} big>
          <div className="detail">
            <div><PhotoGallery photos={openAccessory.photos} itemId={openAccessory.id} alt={openAccessory.name} /></div>
            <div>
              <p style={{ color: 'var(--ink-faint)', margin: 0 }}>{openAccessory.brand}</p>
              <dl>
                {showPrices && <><dt>Precio</dt><dd>{money(openAccessory.price_cents)}</dd></>}
                <dt>Código</dt><dd className="mono">{openAccessory.code}</dd>
                <dt>Color</dt><dd>{openAccessory.color ?? '—'}</dd>
              </dl>
              <div className="row">
                <button
                  type="button"
                  className="btn-main"
                  onClick={() => {
                    setPicked((p) => (p.includes(openAccessory.id) ? p.filter((id) => id !== openAccessory.id) : [...p, openAccessory.id]))
                    setOpenAccessory(null)
                  }}
                >
                  {picked.includes(openAccessory.id) ? 'Quitar accesorio' : 'Agregar accesorio'}
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {confirming && chosenDress && (
        <Dialog
          title="Confirma la selección"
          onCancel={() => setConfirming(false)}
          narrow
          actions={
            <div className="row" style={{ justifyContent: 'center', width: '100%' }}>
              <ActionButton
                done="Listo"
                onAction={async () => {
                  await post(`/sessions/${sessionId}/select`, {
                    item_id: chosenDress.id, pin, accessory_item_ids: picked,
                  })
                  await onDone()
                }}
              >
                Pasar a las medidas
              </ActionButton>
            </div>
          }
        >
          <div className="stack">
            <div className="hist">
              <div>
                <span>
                  <b style={{ fontWeight: 'var(--weight-medium)' }}>{chosenDress.name}</b>
                  {chosenDress.color ? ` · ${chosenDress.color}` : ''} · <span className="mono">{chosenDress.code}</span>
                </span>
                {showPrices && <span className="mono">{money(chosenDress.price_cents)}</span>}
              </div>
              {chosenAccessories.map((a) => (
                <div key={a.id}><span>{a.name}</span>{showPrices && <span className="mono">{money(a.price_cents)}</span>}</div>
              ))}
            </div>
            {chosenAccessories.length === 0 && (
              <p className="state late">Asegúrate de haberle ofrecido los accesorios a la clienta.</p>
            )}
            {showPrices && (
              <p className="inv-head" style={{ marginTop: 'var(--space-8)' }}>
                <span style={{ fontWeight: 'var(--weight-medium)' }}>Total</span>
                <span className="money">{money(chosenDress.price_cents + chosenAccessories.reduce((n, a) => n + a.price_cents, 0))}</span>
              </p>
            )}
          </div>
        </Dialog>
      )}
    </Screen>
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
 * como en el resto de la aplicación. El NIP y el motivo son siempre los
 * mismos; sólo cambia de dónde se abren — de ahí el `ref` con `open()`.
 */
export const CloseControl = forwardRef<CloseControlHandle, {
  sessionId: number
  onClosed: () => void
  trigger?: (open: () => void) => ReactNode
  /**
   * Sólo el cierre desde el kiosco: es el único punto donde la sesión puede
   * llegar a cerrarse sin que nadie haya pasado por «Datos de la novia»
   * todavía — nunca hay un nombre ni un teléfono guardados. En cualquier otro
   * paso, ya se capturaron y volver a pedirlos sería repetir el trabajo.
   */
  askBride?: boolean
}>(function CloseControl({ sessionId, onClosed, trigger, askBride }, ref) {
  const { signOutToEntry } = useSession()
  const [step, setStep] = useState<'closed' | 'pin' | 'reason'>('closed')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [disposed, setDisposed] = useState(false)
  const [needsDisposal, setNeedsDisposal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [apellido, setApellido] = useState('')
  const [phone, setPhone] = useState('')
  const [triedBride, setTriedBride] = useState(false)

  function reset() { setStep('closed'); setPin(''); setError(null); setPinError(null) }

  useImperativeHandle(ref, () => ({ open: () => setStep('pin') }), [])

  const detail = outcome === 'won' ? reason : note
  // No entra en `ready`: a diferencia del resto, este par se marca en rojo al
  // primer intento en vez de dejar el botón apagado sin decir por qué.
  const brideOk = !askBride || (name.trim().length > 0 && phone.length >= 10)
  const ready = Boolean(outcome) && Boolean(reason.trim()) && Boolean(detail.trim()) && (!needsDisposal || disposed)

  return (
    <>
      {trigger ? trigger(() => setStep('pin')) : (
        <button type="button" className="btn-quiet" onClick={() => setStep('pin')}>Cerrar sesión</button>
      )}

      {step === 'pin' && (
        // El teclado es el mismo de siempre y queda en el centro exacto de la
        // pantalla, como en la entrada: aquí no se dibuja uno aparte. Se
        // confirma contra el servidor antes de avanzar — antes cualquier NIP
        // pasaba a «¿Cómo terminó?» y sólo se rechazaba hasta el envío final.
        <Dialog title="Cerrar la sesión" onCancel={reset} closeLabel="Cancelar, seguir en la sesión" full big>
          <PinPad
            hint="Se borran los favoritos y las marcas de «viendo ahora». Pide el NIP a la vendedora."
            error={pinError}
            busy={pinBusy}
            onSubmit={async (value) => {
              setPinError(null)
              setPinBusy(true)
              try {
                await post('/auth/verify-pin', { pin: value })
                setPin(value)
                setStep('reason')
              } catch (err) {
                if (err instanceof UnauthorizedError) { void signOutToEntry('Tu sesión expiró. Vuelve a marcar tu NIP.'); return }
                setPinError(err instanceof ApiError ? err.message : 'No se pudo continuar. Vuelve a intentar.')
              } finally {
                setPinBusy(false)
              }
            }}
          />
        </Dialog>
      )}

      {step === 'reason' && (
        <Dialog title="¿Cómo terminó?" onCancel={reset} closeLabel="Cancelar" narrow>
          {/*
            Sólo aquí: en el resto de los pasos ya se sabe quién es. Sin esto
            una sesión cerrada desde el kiosco no dejaba ni nombre ni teléfono
            — no había forma de encontrarla después en Clientes.
          */}
          {askBride && (
            <>
              <div className="two">
                <Field label="Nombre de la novia" invalid={triedBride && !name.trim()}>
                  {(id) => <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" />}
                </Field>
                <Field label="Apellido">
                  {(id) => <input id={id} type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="García" />}
                </Field>
              </div>
              <Field label="Teléfono" invalid={triedBride && phone.length < 10}>
                {(id) => (
                  <input
                    id={id}
                    className={phone.length === 0 ? 'mask-empty' : undefined}
                    type="tel"
                    inputMode="numeric"
                    value={formatPhoneMask(phone)}
                    onFocus={(e) => { if (phone.length === 0) e.currentTarget.setSelectionRange(4, 4) }}
                    onChange={(e) => {
                      const el = e.currentTarget
                      const digits = phoneDigitsFromMasked(el.value).slice(0, 10)
                      el.value = formatPhoneMask(digits)
                      const caret = phoneMaskCaret(digits.length)
                      el.setSelectionRange(caret, caret)
                      setPhone(digits)
                    }}
                  />
                )}
              </Field>
            </>
          )}

          <Chips
            label="Resultado"
            options={[{ value: 'won' as const, label: 'Se vendió' }, { value: 'lost' as const, label: 'No se vendió' }]}
            value={outcome}
            onChange={(v) => { setOutcome(v); setReason(''); setNote('') }}
          />

          {outcome === 'won' && (
            <Field label="¿Cómo estuvo la venta?">
              {(id) => <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}

          {outcome === 'lost' && (
            <>
              <Chips label="Motivo" options={LOST_REASONS} value={reason as never} onChange={setReason} small />
              {reason && (
                <Field label="Detalle">
                  {(id) => <input id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué dijo la clienta" />}
                </Field>
              )}
            </>
          )}

          {needsDisposal && (
            <label className="shot" style={{ borderColor: 'var(--clay)', color: 'var(--clay)' }}>
              <input type="checkbox" checked={disposed} onChange={(e) => setDisposed(e.target.checked)} style={{ width: 24, height: 24, minHeight: 0 }} />
              <b>Destruye las hojas de medidas firmadas de esta sesión</b>
            </label>
          )}

          {error && <p className="err" role="alert">{error}</p>}

          <div className="row" style={{ marginTop: 'var(--space-9)' }}>
            <ActionButton
              disabled={!ready}
              onAction={async () => {
                if (askBride && !brideOk) {
                  setTriedBride(true)
                  throw new ApiError('Falta el nombre o el teléfono de la novia.', 400, 'incomplete')
                }
                try {
                  await post(`/sessions/${sessionId}/close`, {
                    outcome, reason: reason.trim(), note: note.trim() || undefined, pin,
                    sheets_disposed: disposed || undefined,
                    ...(askBride ? { name: name.trim(), apellido: apellido.trim() || undefined, phone } : {}),
                  })
                  onClosed()
                } catch (err) {
                  if (err instanceof ApiError) {
                    if (err.message.includes('destruiste')) setNeedsDisposal(true)
                    setError(err.message)
                  }
                  throw err
                }
              }}
            >
              Cerrar sesión
            </ActionButton>
          </div>
        </Dialog>
      )}
    </>
  )
})

