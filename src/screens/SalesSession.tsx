import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, get, post } from '../lib/api'
import { money } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Dialog } from '../components/Dialog'
import { GownArt } from '../components/GownArt'
import { Chips, Field } from '../components/Field'

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
        if (!id) {
          const created = await post<{ id: number }>('/sessions', { device_label: navigator.userAgent.slice(0, 40) })
          id = created.id
          localStorage.setItem(SESSION_KEY, String(id))
          if (!cancelled) setSessionId(id)
        }
        if (!cancelled) await reload(id)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo abrir la sesión.')
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [sessionId, reload])

  if (error) return <div className="wrap"><p className="err">{error}</p></div>
  if (!state || !sessionId) return <div className="wrap"><span className="spinner" aria-hidden="true" /></div>

  const refresh = () => reload(sessionId)
  const stage = state.session.stage
  const browsing = stage === 'browsing' || stage === 'fitting'
  const onClosed = () => { localStorage.removeItem(SESSION_KEY); navigate('/') }

  // Mientras la novia ve vestidos, la pantalla es el kiosco completo.
  if (browsing) return <Kiosk sessionId={sessionId} stage={stage} onChange={refresh} onClosed={onClosed} />

  return (
    <div className="wrap">
      <div className="inv-head">
        <div>
          <h2>{STAGE_LABEL[stage]}</h2>
          <p className="lede" style={{ margin: 0 }}>{STAGE_HINT[stage]}</p>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          {state.contract && <span className="pill pill--brass">Folio {state.contract.folio}</span>}
          <CloseControl sessionId={sessionId} onClosed={onClosed} />
        </div>
      </div>

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
  bride_data: 'Dos copias, con el folio y los datos de la novia ya puestos. Las medidas se llenan a mano.',
  sheet_printed: 'Las medidas no se capturan al sistema: la foto de la hoja firmada es la evidencia de la tienda.',
  sheet_signed: 'Sólo aparecen los planes que caben por precio, por meses y por la fecha del evento.',
  terms: 'El contrato va impreso al reverso de las mismas dos hojas.',
  contract_printed: 'El contrato se activa sólo con las dos fotos: la hoja de medidas y el contrato.',
  signed: 'El primer abono se registra igual que cualquier otro.',
  payment: 'El primer abono se registra igual que cualquier otro.',
  closed: '',
}

// ────────────────────────────────────────────────────────────── kiosco ──
function Kiosk({ sessionId, stage, onChange, onClosed }: { sessionId: number; stage: Stage; onChange: () => Promise<void>; onClosed: () => void }) {
  const { me } = useSession()
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [favsOpen, setFavsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])

  // Los filtros del prototipo, armados con lo que de verdad hay en la sucursal.
  // La fila se mantiene corta como en el diseño: los cortes, una banda de
  // precio y las tallas más comunes. «A medida» no es una talla que se filtre.
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

  return (
    <>
      <div className="k-top">
        <div className="k-brand">
          <h1>Soy Única</h1>
          <em>{me?.store_name.split('·').pop()?.trim()}</em>
        </div>
        <div className="k-session">
          <span className="pill">
            <span className="dot" />
            <span>{stage === 'fitting' ? 'En el probador' : 'Sesión abierta'}</span>
          </span>
          <ActionButton
            className="btn-quiet"
            done={stage === 'fitting' ? 'Viendo' : 'En el probador'}
            onAction={async () => {
              await post(`/sessions/${sessionId}/stage`, { stage: stage === 'fitting' ? 'browsing' : 'fitting' })
              await onChange()
            }}
          >
            {stage === 'fitting' ? 'Volver a ver vestidos' : 'Pasar al probador'}
          </ActionButton>
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
            <div className="detail">
              <div><GownArt seed={open.id} /></div>
              <div>
                <h2>{open.name}</h2>
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
                  <ActionButton
                    className="btn-quiet"
                    done="Elegido"
                    onAction={async () => { await post(`/sessions/${sessionId}/select`, { item_id: open.id }); setOpen(null); await onChange() }}
                  >
                    Elegir este vestido
                  </ActionButton>
                  <button type="button" className="btn-quiet" onClick={() => setOpen(null)}>Seguir viendo</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {favsOpen && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) setFavsOpen(false) }}>
          <div className="sheet">
            <h2 style={{ fontSize: 'var(--text-brand)' }}>Mis favoritos</h2>
            <p style={{ color: 'var(--ink-soft)', margin: 'var(--space-3) 0 var(--space-11)' }}>
              La vendedora traerá estos vestidos al probador.
            </p>
            <div className="fav-list">
              {favs.map((d) => (
                <figure key={d.id}>
                  <GownArt seed={d.id} />
                  <figcaption>{d.name}</figcaption>
                  <button
                    type="button"
                    className="btn-quiet"
                    style={{ marginTop: 'var(--space-3)', minHeight: 44, width: '100%' }}
                    onClick={() => void toggleFavorite(d)}
                  >
                    Quitar
                  </button>
                </figure>
              ))}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-12)' }}>
              <button type="button" className="btn-main" onClick={() => setFavsOpen(false)}>Seguir viendo vestidos</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ───────────────────────────────────────────────────── datos de novia ──
function BrideForm({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', apellido: '', phone: '', wedding_date: '' })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="panel">
      <div className="two">
        <Field label="Nombre">{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} autoComplete="off" />}</Field>
        <Field label="Apellido">{(id) => <input id={id} type="text" value={form.apellido} onChange={set('apellido')} autoComplete="off" />}</Field>
      </div>
      <div className="two">
        <Field label="Teléfono" hint="10 dígitos">{(id) => <input id={id} type="text" inputMode="tel" value={form.phone} onChange={set('phone')} />}</Field>
        <Field label="Fecha del evento" hint="Déjala vacía sólo si de verdad no hay fecha">
          {(id) => <input id={id} type="date" value={form.wedding_date} onChange={set('wedding_date')} />}
        </Field>
      </div>
      <ActionButton
        onAction={async () => {
          await post(`/sessions/${sessionId}/bride`, { ...form, wedding_date: form.wedding_date || null })
          await onDone()
        }}
      >
        Guardar y seguir
      </ActionButton>
    </div>
  )
}

// ─────────────────────────────────── hoja de medidas y contrato ────────
function SheetPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const folio = state.contract?.folio ?? ''

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
                window.open(`/print/${encodeURIComponent(folio)}/medidas`, '_blank', 'noopener')
                setAsking(false)
                await onDone()
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
  return (
    <div className="panel">
      <div className="field">
        <label>Hoja de medidas firmada</label>
        <PhotoCapture kind="measurement_sheet" contractId={state.contract?.id} label="Tomar foto de la hoja" onUploaded={onDone} />
      </div>
      <ActionButton disabled={!has} onAction={async () => { await post(`/sessions/${sessionId}/sheet-signed`); await onDone() }}>
        Seguir al plan de pago
      </ActionButton>
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

function Terms({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [weddingDate, setWeddingDate] = useState<string | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    post<{ offers: Offer[]; wedding_date: string | null }>(`/sessions/${sessionId}/quote`, {})
      .then((data) => { setOffers(data.offers); setWeddingDate(data.wedding_date) })
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
        <p className="err">Ningún plan cabe para este precio y esta fecha. Ajusta el precio o la fecha del evento.</p>
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
      <ActionButton
        disabled={chosen === null}
        onAction={async () => { await post(`/sessions/${sessionId}/terms`, { plan_id: chosen }); await onDone() }}
      >
        Guardar el plan
      </ActionButton>
    </>
  )
}

function ContractPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const folio = state.contract?.folio ?? ''
  return (
    <div className="panel">
      <p className="pill pill--brass" style={{ marginBottom: 'var(--space-9)' }}>
        Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo.
      </p>
      <div className="row">
        <button type="button" className="btn-quiet" onClick={() => window.open(`/print/${encodeURIComponent(folio)}/contrato`, '_blank', 'noopener')}>
          Abrir el contrato para imprimir
        </button>
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

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setStep('pin')}>Cerrar sesión</button>

      {step === 'pin' && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
          <div className="sheet sheet-narrow">
            <h2 style={{ fontSize: 'var(--text-money)' }}>Cerrar la sesión</h2>
            <p style={{ color: 'var(--ink-soft)', margin: 'var(--space-3) 0 var(--space-8)' }}>
              Se borran los favoritos y las marcas de «viendo ahora». Pide el NIP a la vendedora.
            </p>
            <div className="pindots" aria-hidden="true">{'•'.repeat(pin.length)}</div>
            <p className="err" role="alert">{error ?? ''}</p>
            <div className="pinpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button key={n} type="button" onClick={() => { setError(null); setPin((p) => (p.length >= 6 ? p : p + n)) }}>{n}</button>
              ))}
              <button type="button" onClick={() => setPin((p) => p.slice(0, -1))}>borrar</button>
              <button type="button" onClick={() => { setError(null); setPin((p) => (p.length >= 6 ? p : p + '0')) }}>0</button>
              <button
                type="button"
                aria-label="Continuar"
                onClick={() => {
                  if (pin.length < 4) { setError('Escribe el NIP de 4 dígitos.'); return }
                  setStep('reason')
                }}
              >
                ✓
              </button>
            </div>
            <button type="button" className="btn-quiet" style={{ width: '100%' }} onClick={reset}>
              Cancelar, seguir en la sesión
            </button>
          </div>
        </div>
      )}

      {step === 'reason' && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
          <div className="sheet sheet-narrow">
            <h2 style={{ fontSize: 'var(--text-money)' }}>¿Cómo terminó?</h2>
            <p style={{ color: 'var(--ink-soft)', margin: 'var(--space-3) 0 var(--space-8)' }}>
              Una línea nada más. Sirve para el reporte semanal.
            </p>

            <Chips
              label="Resultado"
              options={[{ value: 'won' as const, label: 'Se vendió' }, { value: 'lost' as const, label: 'No se vendió' }]}
              value={outcome}
              onChange={(v) => { setOutcome(v); setReason('') }}
            />

            {outcome === 'won' && (
              <Field label="¿Cómo estuvo la venta?">
                {(id) => <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
              </Field>
            )}

            {outcome === 'lost' && (
              <>
                <Chips label="Motivo" options={LOST_REASONS} value={reason as never} onChange={setReason} small />
                <Field label="Detalle opcional">
                  {(id) => <input id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Le gustó Amaranta pero regresa con su mamá" />}
                </Field>
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
                disabled={!outcome || !reason.trim() || (needsDisposal && !disposed)}
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
              <button type="button" className="btn-quiet" onClick={reset}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
