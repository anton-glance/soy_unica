import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, UnauthorizedError, get, post } from '../lib/api'
import { money } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Dialog } from '../components/Dialog'
import { GownArt } from '../components/GownArt'
import { Brandmark } from '../components/Brandmark'
import { PinPad } from '../components/PinPad'
import { PrintOverlay } from '../components/PrintOverlay'
import { Screen } from '../components/Screen'
import { Chips, Field } from '../components/Field'
import { PrintMedidas } from './PrintMedidas'
import { PrintContrato } from './PrintContrato'

/**
 * El identificador de la sesión de venta vive en `localStorage`, por navegador.
 * Sobrevive a un reinicio de la base: si alguna vez se restaura un respaldo, el
 * id guardado ya no existirá del otro lado. Por eso, cuando no se puede
 * resolver, se descarta y se abre una sesión nueva en vez de dejar una pantalla
 * sin salida.
 */
const SESSION_KEY = 'su:session'

type Stage =
  | 'browsing' | 'fitting' | 'selected' | 'bride_data' | 'sheet_printed'
  | 'sheet_signed' | 'terms' | 'contract_printed' | 'signed' | 'payment' | 'closed'

export interface KioskItem {
  id: number; code: string; name: string; brand: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; size: string | null; cut: string | null; color: string | null
  price_cents: number; held_by_other: boolean; held_by_me: boolean; favorite: boolean
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
  terms: 'Imprimir el contrato', contract_printed: 'Foto del contrato firmado', signed: 'Anticipo',
  payment: 'Anticipo', closed: 'Sesión cerrada',
}
const STAGE_HINT: Record<Stage, string> = {
  browsing: '', fitting: '',
  selected: 'Los cuatro datos son obligatorios. La fecha del evento decide qué planes se pueden ofrecer.',
  bride_data: '',
  sheet_printed: 'Las medidas no se capturan al sistema: la foto de la hoja firmada es la evidencia de la tienda.',
  sheet_signed: 'Sólo aparecen los planes que caben por precio, por meses y por la fecha del evento.',
  terms: 'El contrato va impreso al reverso de las mismas dos hojas.',
  contract_printed: 'El contrato se activa sólo con las dos fotos: la hoja de medidas y el contrato.',
  signed: 'El primer abono se registra igual que cualquier otro.',
  payment: 'El primer abono se registra igual que cualquier otro.',
  closed: '',
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
    return <Kiosk sessionId={sessionId} onChange={refresh} onClosed={onClosed} onLeave={() => navigate('/')} />
  }

  const footer = <CloseControl sessionId={sessionId} onClosed={onClosed} />

  return (
    <Screen
      title={STAGE_TITLE[stage]}
      onBack={() => navigate('/')}
      backLabel="Regresar al inicio"
      footer={footer}
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
        {(stage === 'signed' || stage === 'payment') && state.contract && (
          <FirstPayment folio={state.contract.folio} onDone={refresh} />
        )}
      </div>
    </Screen>
  )
}

// ────────────────────────────────────────────────────────────── kiosco ──
type KioskView =
  | { at: 'catalog' }
  | { at: 'favorites' }
  | { at: 'handover'; then: 'select' | 'leave' }
  | { at: 'pin'; then: 'select' | 'leave' }
  | { at: 'selection'; pin: string }

/**
 * La pantalla de la novia. No hay aquí ni un camino al contrato: puede ver
 * vestidos, marcarlos y llamar a la vendedora. Todo lo demás —elegir el
 * vestido, sus datos, el contrato— pasa por el NIP de la vendedora, que además
 * se vuelve a comprobar en el servidor al crear el contrato.
 */
function Kiosk({ sessionId, onChange, onClosed, onLeave }: {
  sessionId: number; onChange: () => Promise<void>; onClosed: () => void; onLeave: () => void
}) {
  const { signOutToEntry } = useSession()
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [view, setView] = useState<KioskView>({ at: 'catalog' })
  const [pinError, setPinError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])
  const accessories = useMemo(() => items.filter((i) => i.kind === 'accessory'), [items])
  const favs = dresses.filter((d) => d.favorite)

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
      ...cuts.map((c) => [c, /^corte/i.test(c) ? c : `Corte ${c.toLowerCase()}`] as const),
      ['-25000', 'Hasta $25,000'] as const,
      ...sizes.map((size) => [size, `Talla ${size}`] as const),
    ]
  }, [dresses])

  const visible = dresses.filter((d) => {
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
    await post(`/sessions/${sessionId}/favorites`, { item_id: item.id, remove: item.favorite })
    await load()
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
              if (view.then === 'leave') {
                // Salir del kiosco no es un traspaso: sólo comprueba el NIP.
                await post('/auth/verify-pin', { pin })
                onLeave()
                return
              }
              // Esto sí es el traspaso, y queda escrito en la sesión con los
              // favoritos que se van al probador.
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
        favorites={favs}
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
      // La novia trae la tableta: para salir del kiosco también hace falta el
      // NIP, si no bastaría un toque para llegar a los contratos.
      onBack={() => setView({ at: 'handover', then: 'leave' })}
      backLabel="Salir del kiosco"
      footer={
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="pill"><span className="dot" />Sesión abierta</span>
          <CloseControl sessionId={sessionId} onClosed={onClosed} />
        </div>
      }
    >
      <div className="k-filters">
        {filters.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="wrap"><p className="err">{error}</p></div>}

      <div className="grid">
        {visible.map((item) => (
          <div key={item.id} className={`card${item.held_by_other ? ' busy' : ''}${item.held_by_me ? ' mine' : ''}`}>
            <button
              type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0 }}
              onClick={() => void openDetail(item)}
              aria-label={`Ver ${item.name}`}
            >
              <GownArt seed={item.id} />
              <span className="meta" style={{ display: 'block' }}>
                <span className="name" style={{ display: 'block' }}>{item.name}</span>
                <span className="brand" style={{ display: 'block' }}>
                  {[item.brand, item.size && `talla ${item.size}`].filter(Boolean).join(' · ')}
                </span>
                {showPrices && <span className="price" style={{ display: 'block' }}>{money(item.price_cents)}</span>}
              </span>
            </button>
            {item.held_by_other && <span className="tag">La está viendo otra clienta</span>}
            {!item.held_by_other && item.held_by_me && <span className="tag">Lo estás viendo</span>}
            {!item.held_by_other && !item.held_by_me && item.acquisition === 'pedido' && (
              <span className="tag">Se manda a hacer</span>
            )}
            <button
              type="button"
              className="heart"
              aria-pressed={item.favorite}
              aria-label={`Me gusta ${item.name}`}
              onClick={() => void toggleFavorite(item)}
            >
              {item.favorite ? '♥' : '♡'}
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="lede">Nada con ese filtro. Toca «Todos» para ver todo otra vez.</p>}
      </div>

      <div className="tray">
        <p>
          {favs.length === 0
            ? 'Toca el corazón de los vestidos que te gusten. La vendedora los traerá para probar.'
            : `${favs.length} ${favs.length === 1 ? 'vestido guardado' : 'vestidos guardados'}. Muéstrale la lista a la vendedora cuando quieras probártelos.`}
        </p>
        <button type="button" className="btn-main" disabled={favs.length === 0} onClick={() => setView({ at: 'favorites' })}>
          {favs.length === 0 ? 'Ver mis favoritos' : `Ver mis favoritos (${favs.length})`}
        </button>
      </div>

      {open && (
        <Dialog title={open.name} onCancel={() => setOpen(null)} big>
          <div className="detail">
            <div><GownArt seed={open.id} /></div>
            <div>
              <p style={{ color: 'var(--ink-faint)', margin: 0 }}>{open.brand}</p>
              <dl>
                {showPrices && <><dt>Precio</dt><dd>{money(open.price_cents)}</dd></>}
                <dt>Código</dt><dd className="mono">{open.code}</dd>
                <dt>Talla</dt><dd>{open.size ?? '—'}</dd>
                <dt>Corte</dt><dd>{open.cut ?? '—'}</dd>
                <dt>Color</dt><dd>{open.color ?? '—'}</dd>
                <dt>Disponibilidad</dt>
                <dd>
                  {open.acquisition === 'pedido'
                    ? 'Se manda a hacer: otra novia puede encargarlo también'
                    : open.held_by_other
                      ? 'La está viendo otra clienta'
                      : 'Disponible en esta sucursal'}
                </dd>
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
          onCall={() => setView({ at: 'handover', then: 'select' })}
        />
      )}

      {view.at === 'handover' && (
        <Dialog
          title="Pásale la tablet a la vendedora"
          onCancel={() => setView({ at: 'catalog' })}
          closeLabel="Seguir viendo"
          narrow
          actions={
            <>
              <button type="button" className="btn-quiet" onClick={() => setView({ at: 'catalog' })}>De acuerdo</button>
              <button type="button" className="btn-main" onClick={() => setView({ at: 'pin', then: view.then })}>
                Soy la vendedora
              </button>
            </>
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
          ? 'La vendedora traerá este vestido al probador.'
          : 'La vendedora traerá estos vestidos al probador.'}
      </p>

      {/* Se desliza de lado: nunca empuja el botón fuera de la pantalla. */}
      <div className="fav-rail">
        {favs.map((d) => (
          <figure key={d.id} className="fav-rail__item">
            <GownArt seed={d.id} />
            <figcaption>{d.name}</figcaption>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {[d.acquisition === 'pedido' ? 'Se manda a hacer' : d.size && `talla ${d.size}`, showPrices && money(d.price_cents)]
                .filter(Boolean).join(' · ')}
            </p>
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
      </div>
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
  const [picked, setPicked] = useState<number[]>([])
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

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
        <p className="lede">Estos son los vestidos que la clienta quiere probarse.</p>

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
              <GownArt seed={d.id} />
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

      {catalogOpen && (
        <Dialog title="Accesorios" onCancel={() => setCatalogOpen(false)} closeLabel="Listo" big>
          <div className="fav-rail">
            {accessories.map((a) => (
              <figure key={a.id} className="fav-rail__item">
                <GownArt seed={a.id} />
                <figcaption>{a.name}</figcaption>
                <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{a.code} · {money(a.price_cents)}</p>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={picked.includes(a.id)}
                  style={{ marginTop: 'var(--space-3)', width: '100%' }}
                  onClick={() => setPicked((p) => (p.includes(a.id) ? p.filter((id) => id !== a.id) : [...p, a.id]))}
                >
                  {picked.includes(a.id) ? 'Agregado' : 'Agregar'}
                </button>
              </figure>
            ))}
            {accessories.length === 0 && <p className="lede">No hay accesorios en esta sucursal.</p>}
          </div>
        </Dialog>
      )}

      {confirming && chosenDress && (
        <Dialog
          title="Confirma la selección"
          onCancel={() => setConfirming(false)}
          narrow
          actions={
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
          }
        >
          <div className="stack">
            <p style={{ fontSize: 'var(--text-lg)' }}>
              <b style={{ fontWeight: 'var(--weight-medium)' }}>{chosenDress.name}</b>
              {chosenDress.color ? ` · ${chosenDress.color}` : ''} · <span className="mono">{chosenDress.code}</span>
            </p>
            {chosenAccessories.length > 0 ? (
              <div className="hist">
                {chosenAccessories.map((a) => (
                  <div key={a.id}><span>{a.name}</span><span className="mono">{money(a.price_cents)}</span></div>
                ))}
              </div>
            ) : (
              <p className="state late">Asegúrate de haberle ofrecido los accesorios a la clienta.</p>
            )}
          </div>
        </Dialog>
      )}
    </Screen>
  )
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
      <div className="two">
        <div className="field">
          <label htmlFor="bride-phone">Teléfono</label>
          {/* `type="tel"` con inputMode numérico; los no-dígitos se caen solos. */}
          <input
            id="bride-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="8112345678"
            onInput={(e) => {
              const el = e.currentTarget
              el.value = el.value.replace(/\D/g, '').slice(0, 10)
            }}
          />
          <p className="err" style={{ color: 'var(--ink-faint)' }}>10 dígitos</p>
        </div>
        <div className="field">
          <label htmlFor="bride-wedding">Fecha del evento</label>
          {/* No hay bodas en el pasado; el servidor lo vuelve a revisar. */}
          <input id="bride-wedding" name="wedding_date" type="date" min={today} />
          <p className="err" style={{ color: 'var(--ink-faint)' }}>Déjala vacía sólo si de verdad no hay fecha</p>
        </div>
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
          <span className="plan-card__mark">{chosen === offer.plan.id ? 'Plan escogido' : 'Tocar para escoger'}</span>
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

function ContractPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const folio = state.contract?.folio ?? ''
  const [printing, setPrinting] = useState(false)

  if (printing) {
    return (
      <PrintOverlay>
        <PrintContrato folio={folio} onBack={() => setPrinting(false)} />
      </PrintOverlay>
    )
  }

  return (
    <div className="panel">
      <p className="pill pill--brass" style={{ marginBottom: 'var(--space-9)' }}>
        Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo.
      </p>
      <div className="row">
        <button type="button" className="btn-quiet" onClick={() => setPrinting(true)}>Abrir el contrato para imprimir</button>
        <ActionButton onAction={async () => { await post(`/sessions/${sessionId}/contract-printed`); await onDone() }}>
          Ya se imprimió
        </ActionButton>
      </div>
    </div>
  )
}

function SignContract({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
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
      <ActionButton
        done="Contrato activo"
        onAction={async () => {
          try {
            await post(`/sessions/${sessionId}/sign`)
            setStale(false)
            await onDone()
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

function FirstPayment({ folio, onDone }: { folio: string; onDone: () => Promise<void> }) {
  return (
    <div className="panel">
      <div className="row">
        <a className="btn-main" href={`/pagos?folio=${encodeURIComponent(folio)}`}>Registrar el anticipo</a>
        <ActionButton className="btn-quiet" onAction={onDone} done="Actualizado">Actualizar</ActionButton>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── cierre ──
const LOST_REASONS = [
  { value: 'precio', label: 'Precio' },
  { value: 'no le gustaron los modelos', label: 'No le gustaron los modelos' },
  { value: 'quiere pensarlo', label: 'Quiere pensarlo' },
  { value: 'va a comparar', label: 'Va a comparar en otra tienda' },
  { value: 'no hay su talla', label: 'No hay su talla' },
  { value: 'otro', label: 'Otro' },
] as const

function CloseControl({ sessionId, onClosed }: { sessionId: number; onClosed: () => void }) {
  const [step, setStep] = useState<'closed' | 'pin' | 'reason'>('closed')
  const [pin, setPin] = useState('')
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [disposed, setDisposed] = useState(false)
  const [needsDisposal, setNeedsDisposal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setStep('closed'); setPin(''); setError(null) }

  const detail = outcome === 'won' ? reason : note
  const ready = Boolean(outcome) && Boolean(reason.trim()) && Boolean(detail.trim()) && (!needsDisposal || disposed)

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setStep('pin')}>Cerrar sesión</button>

      {step === 'pin' && (
        // El teclado es el mismo de siempre y queda en el centro exacto de la
        // pantalla, como en la entrada: aquí no se dibuja uno aparte.
        <Dialog title="Cerrar la sesión" onCancel={reset} closeLabel="Cancelar, seguir en la sesión" full big>
          <PinPad
            hint="Se borran los favoritos y las marcas de «viendo ahora». Pide el NIP a la vendedora."
            error={error}
            onSubmit={(value) => { setPin(value); setError(null); setStep('reason') }}
          />
        </Dialog>
      )}

      {step === 'reason' && (
        <Dialog title="¿Cómo terminó?" onCancel={reset} closeLabel="Cancelar" narrow>
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
                try {
                  await post(`/sessions/${sessionId}/close`, {
                    outcome, reason: reason.trim(), note: note.trim() || undefined, pin,
                    sheets_disposed: disposed || undefined,
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
}

