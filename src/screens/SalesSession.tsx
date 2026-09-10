import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, get, post } from '../lib/api'
import { money } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Dialog } from '../components/Dialog'
import { Field, TextInput, TextArea, Chips } from '../components/Field'

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

  if (error) return <div className="page"><p className="notice notice--error">{error}</p></div>
  if (!state || !sessionId) return <div className="page"><span className="spinner" aria-hidden="true" /></div>

  const refresh = () => reload(sessionId)
  const stage = state.session.stage

  return (
    <div className="page stack">
      <StageBar stage={stage} folio={state.contract?.folio ?? null} />

      {(stage === 'browsing' || stage === 'fitting') && (
        <Catalog sessionId={sessionId} stage={stage} onChange={refresh} />
      )}
      {stage === 'selected' && <BrideForm sessionId={sessionId} onDone={refresh} />}
      {stage === 'bride_data' && <SheetPrint sessionId={sessionId} state={state} onDone={refresh} />}
      {stage === 'sheet_printed' && <SheetSigned sessionId={sessionId} state={state} onDone={refresh} />}
      {stage === 'sheet_signed' && <Terms sessionId={sessionId} onDone={refresh} />}
      {stage === 'terms' && <ContractPrint sessionId={sessionId} state={state} onDone={refresh} />}
      {stage === 'contract_printed' && <SignContract sessionId={sessionId} state={state} onDone={refresh} />}
      {(stage === 'signed' || stage === 'payment') && state.contract && (
        <FirstPayment folio={state.contract.folio} onDone={refresh} />
      )}

      <CloseControl sessionId={sessionId} onClosed={() => { localStorage.removeItem(SESSION_KEY); navigate('/') }} />
    </div>
  )
}

const STAGE_LABEL: Record<Stage, string> = {
  browsing: 'Viendo vestidos', fitting: 'Probando', selected: 'Vestido elegido',
  bride_data: 'Datos de la novia', sheet_printed: 'Hoja impresa', sheet_signed: 'Hoja firmada',
  terms: 'Plan escogido', contract_printed: 'Contrato impreso', signed: 'Contrato firmado',
  payment: 'Anticipo', closed: 'Cerrada',
}

function StageBar({ stage, folio }: { stage: Stage; folio: string | null }) {
  return (
    <div className="row row--between row--wrap">
      <h1>{STAGE_LABEL[stage]}</h1>
      {folio && <strong className="numeric" style={{ fontSize: 'var(--text-lg)' }}>Folio {folio}</strong>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── catálogo ──
function Catalog({ sessionId, stage, onChange }: { sessionId: number; stage: Stage; onChange: () => Promise<void> }) {
  const { me } = useSession()
  const [items, setItems] = useState<KioskItem[]>([])
  const [showPrices, setShowPrices] = useState(true)
  const [open, setOpen] = useState<KioskItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await get<{ items: KioskItem[]; show_prices: boolean }>(`/items/kiosk?session=${sessionId}`)
    setItems(data.items)
    setShowPrices(data.show_prices)
  }, [sessionId])

  useEffect(() => { void load().catch((e: Error) => setError(e.message)) }, [load])

  const dresses = useMemo(() => items.filter((i) => i.kind === 'dress'), [items])

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
    <div className="stack">
      <div className="row row--wrap">
        <ActionButton
          className={`chip ${stage === 'fitting' ? '' : ''}`}
          onAction={async () => { await post(`/sessions/${sessionId}/stage`, { stage: stage === 'fitting' ? 'browsing' : 'fitting' }); await onChange() }}
          done={stage === 'fitting' ? 'Viendo' : 'Probando'}
        >
          {stage === 'fitting' ? 'Volver a ver vestidos' : 'Pasar a probador'}
        </ActionButton>
        <span className="muted">{dresses.length} vestidos</span>
      </div>

      {error && <p className="notice notice--error">{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
        {dresses.map((item) => (
          <article
            key={item.id}
            className="card stack"
            style={{ opacity: item.held_by_other ? 0.45 : 1 }}
          >
            <div className="row row--between">
              <strong>{item.name}</strong>
              <span className="muted numeric">{item.code}</span>
            </div>
            <div className="muted">
              {[item.brand, item.cut, item.size && `Talla ${item.size}`].filter(Boolean).join(' · ')}
            </div>
            {showPrices && me?.kiosk_show_prices !== false && (
              <div className="numeric" style={{ fontSize: 'var(--text-lg)' }}>{money(item.price_cents)}</div>
            )}
            {item.acquisition === 'pedido' && <span className="chip" aria-hidden="true">Se manda a hacer</span>}
            {item.held_by_other && <p className="notice notice--warn">La está viendo otra clienta</p>}
            <div className="row row--wrap">
              {/* Aunque esté apagado sigue siendo tocable. */}
              <button type="button" className="btn btn--bride" onClick={() => void openDetail(item)}>Ver</button>
              <button
                type="button"
                className="chip"
                aria-pressed={item.favorite}
                onClick={() => void toggleFavorite(item)}
              >
                {item.favorite ? '★ Favorito' : '☆ Favorito'}
              </button>
            </div>
          </article>
        ))}
      </div>

      {open && (
        <Dialog
          title={`${open.name} · ${open.code}`}
          onCancel={() => setOpen(null)}
          actions={
            <ActionButton
              onAction={async () => {
                await post(`/sessions/${sessionId}/select`, { item_id: open.id })
                setOpen(null)
                await onChange()
              }}
              done="Elegido"
            >
              Elegir este vestido
            </ActionButton>
          }
        >
          <div className="stack">
            <p className="muted">{[open.brand, open.cut, open.color, open.size && `Talla ${open.size}`].filter(Boolean).join(' · ')}</p>
            {showPrices && <p className="numeric" style={{ fontSize: 'var(--text-xl)' }}>{money(open.price_cents)}</p>}
            {open.acquisition === 'pedido'
              ? <p className="notice notice--ok">Este modelo se manda a hacer: no se aparta y otra novia puede encargarlo también.</p>
              : open.held_by_other
                ? <p className="notice notice--warn">La está viendo otra clienta en este momento.</p>
                : null}
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────── datos de novia ──
function BrideForm({ sessionId, onDone }: { sessionId: number; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', apellido: '', phone: '', wedding_date: '' })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="card stack">
      <h2>Datos de la novia</h2>
      <p className="muted">
        Los cuatro son obligatorios. La fecha del evento decide qué planes se pueden ofrecer;
        si todavía no hay fecha, sólo se podrán ofrecer los planes que se liquidan al recoger.
      </p>
      <Field label="Nombre"><TextInput value={form.name} onChange={set('name')} autoComplete="off" /></Field>
      <Field label="Apellido"><TextInput value={form.apellido} onChange={set('apellido')} autoComplete="off" /></Field>
      <Field label="Teléfono" hint="10 dígitos"><TextInput value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
      <Field label="Fecha del evento" hint="Déjala vacía sólo si de verdad no hay fecha">
        <TextInput type="date" value={form.wedding_date} onChange={set('wedding_date')} />
      </Field>
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

// ───────────────────────────────────────────── hoja de medidas y contrato ──
function SheetPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const folio = state.contract?.folio ?? ''

  return (
    <div className="card stack">
      <h2>Hoja de medidas</h2>
      <p className="muted">Se imprimen dos copias con los datos de la novia y el folio ya puestos. Las medidas se llenan a mano.</p>
      <button type="button" className="btn btn--primary" onClick={() => setAsking(true)}>Imprimir la hoja de medidas</button>

      {asking && (
        <Dialog
          title="Imprimir la hoja de medidas"
          onCancel={() => setAsking(false)}
          actions={
            <ActionButton
              onAction={async () => {
                await post(`/sessions/${sessionId}/sheet-printed`)
                window.open(`/print/${encodeURIComponent(folio)}/medidas`, '_blank', 'noopener')
                setAsking(false)
                await onDone()
              }}
              done="Impresa"
            >
              Imprimir
            </ActionButton>
          }
        >
          <p>Se van a imprimir <strong>2 copias</strong> con el folio {folio}. Todos los campos de medida salen en blanco.</p>
        </Dialog>
      )}
    </div>
  )
}

function SheetSigned({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const has = state.documents.some((d) => d.kind === 'measurement_sheet')
  return (
    <div className="card stack">
      <h2>Foto de la hoja firmada</h2>
      <p className="muted">Las medidas no se capturan al sistema. La foto de la hoja firmada es la evidencia de la tienda.</p>
      <PhotoCapture
        kind="measurement_sheet"
        contractId={state.contract?.id}
        label="Tomar la foto de la hoja firmada"
        onUploaded={onDone}
      />
      <ActionButton
        disabled={!has}
        onAction={async () => { await post(`/sessions/${sessionId}/sheet-signed`); await onDone() }}
      >
        Seguir al plan de pago
      </ActionButton>
      {!has && <p className="muted">Primero toma la foto.</p>}
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

  if (error) return <p className="notice notice--error">{error}</p>
  if (!offers) return <span className="spinner" aria-hidden="true" />

  return (
    <div className="stack">
      <h2>Plan de pago</h2>
      {!weddingDate && (
        <p className="notice notice--warn">
          Sin fecha de evento sólo se pueden ofrecer los planes que se liquidan al recoger el vestido.
        </p>
      )}
      {offers.length === 0 && (
        <p className="notice notice--error">
          Ningún plan cabe para este precio y esta fecha. Ajusta el precio o la fecha del evento.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
        {offers.map((offer) => (
          <article key={offer.plan.id} className="card stack" style={{ borderColor: chosen === offer.plan.id ? 'var(--color-accent)' : undefined }}>
            <div className="row row--between">
              <h3>{offer.plan.name}</h3>
              <strong className="numeric">{money(offer.total_cents)}</strong>
            </div>
            {offer.discount_cents > 0 && <p className="notice notice--ok">Descuento de {money(offer.discount_cents)}</p>}
            <ol className="stack" style={{ paddingLeft: 'var(--space-5)', margin: 0 }}>
              {offer.schedule.map((row) => (
                <li key={row.seq} className="numeric">
                  {row.due_type === 'on_pickup' ? 'Al recoger el vestido' : row.due_date} — {money(row.amount_cents)}
                </li>
              ))}
            </ol>
            <button type="button" className="btn" aria-pressed={chosen === offer.plan.id} onClick={() => setChosen(offer.plan.id)}>
              {chosen === offer.plan.id ? 'Escogido' : 'Escoger este plan'}
            </button>
          </article>
        ))}
      </div>
      <ActionButton
        disabled={chosen === null}
        onAction={async () => { await post(`/sessions/${sessionId}/terms`, { plan_id: chosen }); await onDone() }}
      >
        Guardar el plan
      </ActionButton>
    </div>
  )
}

function ContractPrint({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const folio = state.contract?.folio ?? ''
  return (
    <div className="card stack">
      <h2>Imprimir el contrato</h2>
      <p className="notice notice--warn">Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo.</p>
      <button
        type="button"
        className="btn"
        onClick={() => window.open(`/print/${encodeURIComponent(folio)}/contrato`, '_blank', 'noopener')}
      >
        Abrir el contrato para imprimir
      </button>
      <ActionButton onAction={async () => { await post(`/sessions/${sessionId}/contract-printed`); await onDone() }}>
        Ya se imprimió
      </ActionButton>
    </div>
  )
}

function SignContract({ sessionId, state, onDone }: { sessionId: number; state: SessionState; onDone: () => Promise<void> }) {
  const has = state.documents.some((d) => d.kind === 'contract')
  const [refusal, setRefusal] = useState<string | null>(null)

  return (
    <div className="card stack">
      <h2>Foto del contrato firmado</h2>
      <p className="muted">El contrato se activa sólo con las dos fotos: la hoja de medidas y el contrato.</p>
      <PhotoCapture kind="contract" contractId={state.contract?.id} label="Tomar la foto del contrato firmado" onUploaded={onDone} />
      <ActionButton
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
        done="Contrato activo"
      >
        Activar el contrato
      </ActionButton>
      {refusal && <p className="notice notice--error" role="alert">{refusal}</p>}
      {!has && <p className="muted">Falta la foto del contrato firmado.</p>}
    </div>
  )
}

function FirstPayment({ folio, onDone }: { folio: string; onDone: () => Promise<void> }) {
  return (
    <div className="card stack">
      <h2>Anticipo</h2>
      <p className="muted">Se registra igual que cualquier abono, desde Registrar pago.</p>
      <a className="btn btn--primary" href={`/pagos?folio=${encodeURIComponent(folio)}`}>Registrar el anticipo</a>
      <ActionButton className="btn" onAction={onDone} done="Actualizado">Actualizar</ActionButton>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────── cierre ──
const LOST_REASONS = [
  { value: 'precio', label: 'Precio' },
  { value: 'no le gustaron los modelos', label: 'No le gustaron los modelos' },
  { value: 'quiere pensarlo', label: 'Quiere pensarlo' },
  { value: 'va a comparar', label: 'Va a comparar' },
  { value: 'no hay su talla', label: 'No hay su talla' },
  { value: 'otro', label: 'Otro' },
] as const

function CloseControl({ sessionId, onClosed }: { sessionId: number; onClosed: () => void }) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [pin, setPin] = useState('')
  const [disposed, setDisposed] = useState(false)
  const [needsDisposal, setNeedsDisposal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      {/* Un solo control, lejos de las orillas del aparato. */}
      <div className="row" style={{ justifyContent: 'center', padding: 'var(--space-7) var(--space-8)' }}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>Cerrar la sesión</button>
      </div>

      {open && (
        <Dialog
          title="Cerrar la sesión"
          onCancel={() => setOpen(false)}
          actions={
            <ActionButton
              disabled={!outcome || !reason.trim() || pin.length < 4 || (needsDisposal && !disposed)}
              className="btn btn--danger"
              onAction={async () => {
                try {
                  await post(`/sessions/${sessionId}/close`, {
                    outcome, reason: reason.trim(), note: note.trim() || undefined, pin,
                    sheets_disposed: disposed || undefined,
                  })
                  onClosed()
                } catch (err) {
                  if (err instanceof ApiError && err.message.includes('destruiste')) {
                    setNeedsDisposal(true)
                    setError(err.message)
                  } else if (err instanceof ApiError) {
                    setError(err.message)
                  }
                  throw err
                }
              }}
            >
              Cerrar
            </ActionButton>
          }
        >
          <div className="stack">
            <Chips
              label="¿Cómo terminó?"
              options={[{ value: 'won' as const, label: 'Se vendió' }, { value: 'lost' as const, label: 'No se vendió' }]}
              value={outcome}
              onChange={(value) => { setOutcome(value); setReason('') }}
            />

            {outcome === 'won' && (
              <Field label="¿Cómo estuvo la venta?">
                <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}

            {outcome === 'lost' && (
              <>
                <Chips label="Motivo" options={LOST_REASONS} value={reason as never} onChange={(value) => setReason(value)} />
                <Field label="Nota (opcional)">
                  <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </>
            )}

            {needsDisposal && (
              <label className="notice notice--warn row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={disposed} onChange={(e) => setDisposed(e.target.checked)} />
                <span>Destruye las hojas de medidas firmadas de esta sesión</span>
              </label>
            )}

            <Field label="Tu NIP">
              <TextInput type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>

            {error && <p className="notice notice--error" role="alert">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  )
}
