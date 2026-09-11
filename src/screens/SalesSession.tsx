import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, UnauthorizedError, get, post } from '../lib/api'
import { money } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Dialog } from '../components/Dialog'
import { GownArt } from '../components/GownArt'
import { IconButton } from '../components/IconButton'
import { Brandmark } from '../components/Brandmark'
import { PinPad } from '../components/PinPad'
import { PrintOverlay } from '../components/PrintOverlay'
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

interface KioskItem {
  id: number; code: string; name: string; brand: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; size: string | null; cut: string | null; color: string | null
  price_cents: number; held_by_other: boolean; held_by_me: boolean; favorite: boolean
}

interface SessionState {
  session: { id: number; stage: Stage; contract_id: number | null; closed_at: string | null }
  favorites: number[]
  contract: { id: number; folio: string; total_cents: number; plan_name: string | null } | null
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  documents: { id: string; kind: string }[]
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
    return () => { cancelled = true }
  // `sessionId` a propósito fuera: el arranque lo resuelve solo una vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <>
        <div className="screen-nav">
          <div className="screen-nav__slot"><IconButton kind="back" label="Regresar al inicio" onClick={() => navigate('/')} /></div>
          <div />
          <div className="screen-nav__slot screen-nav__slot--end" />
        </div>
        <div className="entry">
          <h1>No se pudo abrir la sesión</h1>
          <p className="err">{error}</p>
          <button type="button" className="btn-main" onClick={() => { localStorage.removeItem(SESSION_KEY); window.location.reload() }}>
            Empezar una sesión nueva
          </button>
        </div>
      </>
    )
  }
  if (!state || !sessionId) return <div className="wrap"><span className="spinner" aria-hidden="true" /></div>

  const refresh = () => reload(sessionId)
  const stage = state.session.stage
  const onClosed = () => { localStorage.removeItem(SESSION_KEY); navigate('/') }

  // Mientras la novia ve vestidos, la pantalla es suya: el kiosco completo.
  if (stage === 'browsing' || stage === 'fitting') {
    return <Kiosk sessionId={sessionId} stage={stage} onChange={refresh} onClosed={onClosed} />
  }

  // De aquí en adelante la tableta ya es de la vendedora.
  return (
    <>
      <div className="screen-nav">
        <div className="screen-nav__slot"><Brandmark /></div>
        <div className="screen-nav__title">{STAGE_LABEL[stage]}</div>
        <div className="screen-nav__slot screen-nav__slot--end">
          {state.contract && <span className="pill pill--brass">Folio {state.contract.folio}</span>}
          <CloseControl sessionId={sessionId} onClosed={onClosed} />
        </div>
      </div>

      <div className="wrap">
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
    </>
  )
}

const STAGE_LABEL: Record<Stage, string> = {
  browsing: 'Viendo vestidos', fitting: 'En el probador', selected: 'Datos de la novia',
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

// ────────────────────────────────────────────────────────────── kiosco ──
/**
 * La pantalla de la novia. No hay aquí ni un solo camino al contrato: puede ver
 * vestidos, marcarlos y pedir pasar al probador. Elegir el vestido, capturar
 * sus datos y todo lo que sigue exige el NIP de la vendedora.
 */
function Kiosk({ sessionId, stage, onChange, onClosed }: {
  sessionId: number; stage: Stage; onChange: () => Promise<void>; onClosed: () => void
}) {
  const { signOutToEntry } = useSession()
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [favsOpen, setFavsOpen] = useState(false)
  const [handover, setHandover] = useState<KioskItem | null>(null)
  const [gate, setGate] = useState<KioskItem | null>(null)
  const [gateError, setGateError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])

  // Los filtros del prototipo, armados con lo que de verdad hay en la sucursal.
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

  const favs = dresses.filter((d) => d.favorite)

  async function openDetail(item: KioskItem) {
    setOpen(item)
    // Abrir el detalle aparta el vestido único, si está libre.
    await post(`/sessions/${sessionId}/view`, { item_id: item.id }).catch(() => undefined)
    await load()
  }

  async function toggleFavorite(item: KioskItem) {
    await post(`/sessions/${sessionId}/favorites`, { item_id: item.id, remove: item.favorite })
    await load()
  }

  // Sólo después del NIP correcto se emite el folio y aparece Datos de la novia.
  if (gate) {
    return (
      <PinPad
        title="NIP de la vendedora"
        hint={`${gate.name} · ${gate.code}`}
        error={gateError}
        backLabel="Regresar al catálogo"
        onBack={() => { setGate(null); setGateError(null) }}
        onSubmit={async (pin) => {
          setGateError(null)
          try {
            await post(`/sessions/${sessionId}/select`, { item_id: gate.id, pin })
            await onChange()
          } catch (err) {
            if (err instanceof UnauthorizedError) { void signOutToEntry('Tu sesión expiró. Vuelve a marcar tu NIP.'); return }
            setGateError(err instanceof ApiError ? err.message : 'No se pudo continuar. Vuelve a intentar.')
          }
        }}
      />
    )
  }

  return (
    <>
      <div className="k-top">
        <Brandmark size="lg" />
        <div className="k-session">
          <span className="pill"><span className="dot" />{stage === 'fitting' ? 'En el probador' : 'Sesión abierta'}</span>
          <CloseControl sessionId={sessionId} onClosed={onClosed} />
        </div>
      </div>

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
        <button type="button" className="btn-main" disabled={favs.length === 0} onClick={() => setFavsOpen(true)}>
          {favs.length === 0 ? 'Ver mis favoritos' : `Ver mis favoritos (${favs.length})`}
        </button>
      </div>

      {open && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null) }}>
          <div className="sheet">
            <div className="sheet-head">
              <h2>{open.name}</h2>
              <IconButton kind="close" label="Cerrar" size="lg" onClick={() => setOpen(null)} />
            </div>
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
          </div>
        </div>
      )}

      {favsOpen && (
        <FavoritesModal
          favs={favs}
          showPrices={showPrices}
          onClose={() => setFavsOpen(false)}
          onRemove={toggleFavorite}
          onFitting={(item) => { setFavsOpen(false); setHandover(item) }}
        />
      )}

      {handover && (
        <div className="veil">
          <div className="sheet sheet-narrow" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-detail)', marginBottom: 'var(--space-5)' }}>
              Pásale la tablet a la vendedora
            </h2>
            <p className="lede" style={{ margin: '0 auto var(--space-11)' }}>
              Ella sigue desde aquí con {handover.name}.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn-quiet" onClick={() => setHandover(null)}>De acuerdo</button>
              <button type="button" className="btn-main" onClick={() => { setGate(handover); setHandover(null) }}>
                Soy la vendedora
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

/**
 * Los favoritos de la novia. Aquí confirma cuál es el suyo y pide pasar al
 * probador; es la única salida del kiosco hacia adelante.
 */
function FavoritesModal({ favs, showPrices, onClose, onRemove, onFitting }: {
  favs: KioskItem[]
  showPrices: boolean
  onClose: () => void
  onRemove: (item: KioskItem) => Promise<void>
  onFitting: (item: KioskItem) => void
}) {
  const [chosen, setChosen] = useState<number | null>(favs.length === 1 ? (favs[0] as KioskItem).id : null)
  const pick = favs.find((f) => f.id === chosen) ?? null

  return (
    <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet">
        <div className="sheet-head">
          <h2 style={{ fontSize: 'var(--text-brand)' }}>Mis favoritos</h2>
          <IconButton kind="close" label="Seguir viendo vestidos" size="lg" onClick={onClose} />
        </div>
        <p style={{ color: 'var(--ink-soft)', margin: '0 0 var(--space-11)' }}>
          {favs.length === 1
            ? 'La vendedora traerá este vestido al probador.'
            : 'Toca el que más te guste. La vendedora lo traerá al probador.'}
        </p>

        <div className="fav-list">
          {favs.map((d) => (
            <figure key={d.id}>
              <button
                type="button"
                style={{
                  display: 'block', width: '100%', padding: 0, borderRadius: 'var(--radius)',
                  outline: chosen === d.id ? '3px solid var(--brass)' : 'none', outlineOffset: 2,
                }}
                aria-pressed={chosen === d.id}
                onClick={() => setChosen(d.id)}
              >
                <GownArt seed={d.id} />
              </button>
              <figcaption>{d.name}</figcaption>
              {showPrices && <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{money(d.price_cents)}</p>}
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

        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-12)' }}>
          <button type="button" className="btn-main" disabled={!pick} onClick={() => pick && onFitting(pick)}>
            Pasar al probador
          </button>
        </div>
        {favs.length > 1 && !pick && (
          <p className="muted" style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
            Toca primero el vestido que quieres probarte.
          </p>
        )}
      </div>
    </div>
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
          <input id="bride-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
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
/**
 * Guardados los datos de la novia se va directo al diálogo de impresión: no
 * hay una pantalla intermedia que sólo tenga un botón.
 */
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
      .then((data) => { setOffers(data.offers); setRejected(data.rejected ?? []); setWeddingDate(data.wedding_date) })
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
          {/* Decir cuál restricción falló, plan por plan, para saber qué mover. */}
          <div className="hist">
            {rejected.map((r) => (
              <div key={r.plan_name}><span>{r.plan_name}</span><span className="muted">{r.detail}</span></div>
            ))}
          </div>
        </div>
      )}

      {offers.map((offer) => (
        <div key={offer.plan.id} className="panel" style={{ borderColor: chosen === offer.plan.id ? 'var(--brass)' : undefined }}>
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
          <button
            type="button"
            className="chip"
            style={{ marginTop: 'var(--space-8)' }}
            aria-pressed={chosen === offer.plan.id}
            onClick={() => setChosen(offer.plan.id)}
          >
            {chosen === offer.plan.id ? 'Plan escogido' : 'Escoger este plan'}
          </button>
        </div>
      ))}

      {offers.length > 0 && (
        <ActionButton
          disabled={chosen === null}
          onAction={async () => { await post(`/sessions/${sessionId}/terms`, { plan_id: chosen }); await onDone() }}
        >
          Guardar el plan
        </ActionButton>
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
  const [refusal, setRefusal] = useState<string | null>(null)

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
            setRefusal(null)
            await onDone()
          } catch (err) {
            if (err instanceof ApiError) setRefusal(err.message)
            throw err
          }
        }}
      >
        Activar el contrato
      </ActionButton>
      {refusal && <p className="err" role="alert">{refusal}</p>}
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
/** Las etiquetas son las del prototipo; los valores, los que acepta el Worker. */
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

  // El detalle es obligatorio en los dos caminos: es lo que sirve después.
  const detail = outcome === 'won' ? reason : note
  const ready = Boolean(outcome) && Boolean(reason.trim()) && Boolean(detail.trim()) && (!needsDisposal || disposed)

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setStep('pin')}>Cerrar sesión</button>

      {step === 'pin' && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
          <div className="sheet sheet-narrow">
            <div className="sheet-head">
              <h2 style={{ fontSize: 'var(--text-money)' }}>Cerrar la sesión</h2>
              <IconButton kind="close" label="Cancelar, seguir en la sesión" onClick={reset} />
            </div>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 var(--space-8)' }}>
              Se borran los favoritos y las marcas de «viendo ahora». Pide el NIP a la vendedora.
            </p>
            <PinPadInline pin={pin} setPin={setPin} error={error} onConfirm={() => {
              if (pin.length < 4) { setError('Escribe el NIP de 4 dígitos.'); return }
              setError(null)
              setStep('reason')
            }} />
          </div>
        </div>
      )}

      {step === 'reason' && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
          <div className="sheet sheet-narrow">
            <div className="sheet-head">
              <h2 style={{ fontSize: 'var(--text-money)' }}>¿Cómo terminó?</h2>
              <IconButton kind="close" label="Cancelar" onClick={reset} />
            </div>

            {/* Primero el resultado; el motivo aparece sólo si no se vendió. */}
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
          </div>
        </div>
      )}
    </>
  )
}

/** El mismo teclado, embebido en el diálogo de cierre. */
function PinPadInline({ pin, setPin, error, onConfirm }: {
  pin: string
  setPin: (fn: (p: string) => string) => void
  error: string | null
  onConfirm: () => void
}) {
  return (
    <>
      <div className="pindots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <p className="err" role="alert">{error ?? ''}</p>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} type="button" onClick={() => setPin((p) => (p.length >= 6 ? p : p + n))}>{n}</button>
        ))}
        <button type="button" className="is-quiet" onClick={() => setPin((p) => p.slice(0, -1))}>borrar</button>
        <button type="button" onClick={() => setPin((p) => (p.length >= 6 ? p : p + '0'))}>0</button>
        <button type="button" className="is-confirm" onClick={onConfirm} aria-label="Confirmar">✓</button>
      </div>
    </>
  )
}
