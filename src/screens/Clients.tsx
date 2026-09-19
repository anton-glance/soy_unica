import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, dateTimeMX, formatPhoneMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import type { PhotoKind } from '../lib/image'
import { Field } from '../components/Field'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { GownArt } from '../components/GownArt'
import { SESSION_KEY, LOST_REASONS } from './SalesSession'
import { STAGE_LABEL } from './Tiles'

const LOST_LABEL: Record<string, string> = Object.fromEntries(LOST_REASONS.map((r) => [r.value, r.label]))

interface ClientRow {
  customer_id: number; name: string; apellido: string; phone: string
  registrada: string; wedding_date: string | null
  session_id: number | null; session_stage: string | null; closed_at_stage: string | null
  outcome: string | null; closed_at: string | null
  folio: string | null; contract_status: string | null
  total_cents: number; paid_cents: number; balance_cents: number
}

const SOLD_STATUSES = new Set(['active', 'paid', 'delivered'])

/**
 * Un solo estado por clienta, de principio a fin — antes la tabla sólo decía
 * la fecha de la boda, que no dice nada de dónde va la venta. La etapa de la
 * sesión cuenta hasta dónde llegó; el contrato y lo pagado, de ahí en
 * adelante. Es el avance real, no si al final compró o no: una sesión perdida
 * que sí llegó a la hoja de medidas se sigue viendo como «Hoja de medidas».
 */
type ClientStatus = 'pendiente' | 'medidas' | 'firmado' | 'parcial' | 'completo' | 'entregado'
const STATUS_LABEL: Record<ClientStatus, string> = {
  pendiente: 'Pendiente', medidas: 'Hoja de medidas', firmado: 'Contrato firmado',
  parcial: 'Pago parcial', completo: 'Pago completo', entregado: 'Entregado',
}
const STATUS_TONE: Record<ClientStatus, string> = {
  pendiente: 'mute', medidas: 'warn', firmado: 'warn', parcial: 'warn', completo: 'ok', entregado: 'ok',
}
// De aquí en adelante la hoja de medidas ya se firmó, sea cual sea cómo terminó.
const MEASURED_STAGES = new Set(['sheet_signed', 'terms', 'contract_printed', 'signed', 'payment', 'closed'])

function clientStatus(row: ClientRow): ClientStatus {
  if (row.contract_status === 'delivered') return 'entregado'
  if (row.contract_status === 'active' || row.contract_status === 'paid') {
    if (row.balance_cents <= 0) return 'completo'
    if (row.paid_cents > 0) return 'parcial'
    return 'firmado'
  }
  const stage = row.session_stage === 'closed' ? row.closed_at_stage : row.session_stage
  return stage && MEASURED_STAGES.has(stage) ? 'medidas' : 'pendiente'
}

/** Columns sortable client-side: the list is capped at a few hundred rows. */
const COLS = [
  ['name', 'Nombre'], ['phone', 'Teléfono'], ['registrada', 'Registrada'],
  ['status', 'Estado'], ['total_cents', 'Total'], ['balance_cents', 'Saldo'],
] as const

export function ClientsModule() {
  const navigate = useNavigate()
  const [view, setView] = useState<{ at: 'list' } | { at: 'contract'; folio: string } | { at: 'client'; id: number }>(() => {
    const params = new URLSearchParams(window.location.search)
    const folio = params.get('folio')
    const cliente = params.get('cliente')
    if (folio) return { at: 'contract', folio }
    if (cliente) return { at: 'client', id: Number(cliente) }
    return { at: 'list' }
  })

  if (view.at === 'contract') return <ContractView folio={view.folio} onBack={() => setView({ at: 'list' })} />
  if (view.at === 'client') return <ClientDetail customerId={view.id} onBack={() => setView({ at: 'list' })} />

  return (
    <ClientList
      onBack={() => navigate('/')}
      onOpen={(row) => {
        if (row.folio && SOLD_STATUSES.has(row.contract_status ?? '')) setView({ at: 'contract', folio: row.folio })
        else setView({ at: 'client', id: row.customer_id })
      }}
    />
  )
}

const STATUS_ORDER: ClientStatus[] = ['pendiente', 'medidas', 'firmado', 'parcial', 'completo', 'entregado']

function ClientList({ onBack, onOpen }: { onBack: () => void; onOpen: (row: ClientRow) => void }) {
  const [q, setQ] = useState('')
  const [chip, setChip] = useState<'todas' | ClientStatus>('todas')
  const [sort, setSort] = useState<string>('registrada')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [results, setResults] = useState<ClientRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void get<{ results: ClientRow[] }>(`/clients?q=${encodeURIComponent(q.trim())}`)
        .then(({ data }) => { setResults(data.results); setError(null) })
        .catch((err: Error) => setError(err.message))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [q])

  const counts = Object.fromEntries(STATUS_ORDER.map((st) => [st, results.filter((r) => clientStatus(r) === st).length])) as Record<ClientStatus, number>

  const filtered = chip === 'todas' ? results : results.filter((r) => clientStatus(r) === chip)
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'status') {
      const cmp = STATUS_ORDER.indexOf(clientStatus(a)) - STATUS_ORDER.indexOf(clientStatus(b))
      return dir === 'asc' ? cmp : -cmp
    }
    const va = a[sort as keyof ClientRow] ?? ''
    const vb = b[sort as keyof ClientRow] ?? ''
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return dir === 'asc' ? cmp : -cmp
  })

  return (
    // El título vive en la barra de arriba, como en Inventario.
    <Screen title="Clientes" onBack={onBack} backLabel="Regresar al inicio">
      <div className="wrap">
        <p className="lede">
          Toda clienta que dio sus datos, haya comprado o no. Busca por nombre, teléfono o folio, o
          toca cualquier renglón.
        </p>
        {error && <p className="err">{error}</p>}

        <div className="inv-bar">
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="cq">Buscar</label>
            <input id="cq" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ana, 8112..., MTY-00142" autoComplete="off" autoFocus />
          </div>
          <a className="btn-quiet" href="/api/clients/export">Exportar CSV</a>
        </div>

        <div className="row" style={{ marginBottom: 'var(--space-9)' }}>
          <button type="button" className="chip chip--sm" aria-pressed={chip === 'todas'} onClick={() => setChip('todas')}>
            Todas ({results.length})
          </button>
          {STATUS_ORDER.map((st) => (
            <button key={st} type="button" className="chip chip--sm" aria-pressed={chip === st} onClick={() => setChip(st)}>
              {STATUS_LABEL[st]} ({counts[st]})
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {COLS.map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => { if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDir('asc') } }}
                  >
                    {label}{sort === key && <span className="ar"> {dir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const status = clientStatus(row)
                return (
                <tr key={row.customer_id} onClick={() => onOpen(row)}>
                  <td className="model">{[row.name, row.apellido].filter(Boolean).join(' ') || 'Sin nombre'}</td>
                  <td className="mono">{formatPhoneMX(row.phone)}</td>
                  <td className="mono">{dateMX(row.registrada.slice(0, 10))}</td>
                  <td><span className={`bdg ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span></td>
                  <td className="mono">{row.total_cents > 0 ? money(row.total_cents) : '—'}</td>
                  <td className="mono">{row.balance_cents > 0 ? money(row.balance_cents) : row.total_cents > 0 ? 'liquidado' : '—'}</td>
                </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>
                    Nada coincide con esa búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Screen>
  )
}

// ─────────────────────────────────────────────── el contrato, con pagos ──
interface Coverage {
  id: number; seq: number; due_type: 'fixed' | 'on_pickup'; due_date: string | null
  amount_cents: number; applied_cents: number; remaining_cents: number; status: string
}
interface Detail {
  contract: { id: number; folio: string; status: string; plan_name: string | null; total_cents: number; imported: number }
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  item: { id: number; code: string; name: string; status: string; ready_notified_at: string | null } | null
  lines: { id: number; description: string; price_cents: number; line_kind: string; added_at: string | null }[]
  payments: { id: number; paid_at: string; amount_cents: number; method: string; receipt_folio: string | null; voided_at: string | null; void_reason: string | null }[]
  documents: { id: string; kind: string; created_at: string; payment_id: number | null }[]
  ledger: { total_cents: number; paid_cents: number; balance_cents: number; coverage: Coverage[]; next_due: Coverage | null; overdue: Coverage[] }
  seller: { name: string } | null
  hotel: { days_charged: number; amount_cents: number }
  late_fee: { months_overdue: number; lose_discount_cents: number; monthly_fee_cents: number } | null
}

function ContractView({ folio, onBack }: { folio: string; onBack: () => void }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [addingAccessory, setAddingAccessory] = useState(false)

  const [amount, setAmount] = useState('')
  const [amountFocused, setAmountFocused] = useState(false)
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [receipt, setReceipt] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])
  const [photoKey, setPhotoKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const { data } = await get<Detail>(`/contracts/${encodeURIComponent(folio)}`)
      setDetail(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el contrato.')
    }
  }, [folio])

  useEffect(() => { void load() }, [load])

  const next = detail?.ledger.next_due ?? null
  useEffect(() => { setAmount(next ? String(next.remaining_cents / 100) : '') }, [next])

  if (error) {
    return <Screen title="Clientes" onBack={onBack} backLabel="Regresar a la búsqueda"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!detail) {
    return <Screen title="Clientes" onBack={onBack} backLabel="Regresar a la búsqueda" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  const bride = `${detail.customer?.name ?? ''} ${detail.customer?.apellido ?? ''}`.trim()
  const cents = parseMoney(amount) ?? 0
  const planned = next?.remaining_cents ?? 0
  const settled = !next && detail.ledger.balance_cents <= 0
  const canPay = !settled && fileIds.length > 0 && cents > 0

  const docOf = (kind: string) => detail.documents.find((d) => d.kind === kind)
  const receipts = detail.documents.filter((d) => d.kind === 'receipt')

  // Item 15: cada dato con su etiqueta — antes era una sola línea de puntos sin
  // decir cuál era el teléfono, cuál la boda y cuál el folio.
  const infoParts = [
    detail.customer?.phone && `Tel: ${formatPhoneMX(detail.customer.phone)}`,
    detail.customer?.wedding_date && `Fecha de boda: ${dateMX(detail.customer.wedding_date)}`,
    `Contrato: ${detail.contract.folio}`,
  ].filter(Boolean)

  return (
    <Screen
      title={bride || 'Sin nombre'}
      onBack={onBack}
      backLabel="Regresar a la búsqueda"
      onClose={() => navigate('/')}
      closeLabel="Ir al inicio"
      footer={!settled && (
        <ActionButton
          disabled={!canPay}
          done="Pago registrado"
          onAction={async () => {
            await post('/payments', {
              folio: detail.contract.folio,
              amount_cents: cents,
              paid_at: paidAt,
              method,
              receipt_folio: receipt || undefined,
              installment_id: next?.id,
              file_ids: fileIds,
            })
            setFileIds([])
            setReceipt('')
            setPhotoKey((k) => k + 1)
            const left = detail.ledger.balance_cents - cents
            await load()
            setToast(
              left > 0
                ? `Pago de ${money(cents)} registrado. Saldo ${money(left)}.`
                : `Pago de ${money(cents)} registrado. Contrato liquidado.`,
            )
            window.setTimeout(() => setToast(null), 5000)
          }}
        >
          Registrar pago de {money(cents)}
        </ActionButton>
      )}
    >
      <div className="wrap">
        <div className="panel">
          {detail.contract.imported === 1 && (
            <p className="pill pill--brass" style={{ marginBottom: 'var(--space-8)' }}>
              Contrato histórico, importado del libro de pagos · sus abonos no tienen comprobante
            </p>
          )}
          <p className="muted" style={{ margin: 0 }}>{infoParts.join(' · ')}</p>
        </div>

        <div className="panel">
          <div className="inv-head" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ margin: 0 }}>Lo que se llevó</h3>
            {/* Sólo accesorios: el vestido siempre necesita sesión y medidas. */}
            <button type="button" className="btn-quiet" onClick={() => setAddingAccessory(true)}>Agregar</button>
          </div>
          <div className="hist">
            {detail.lines.map((line) => (
              <div key={line.id}>
                <span>{line.description}{line.added_at && <span className="muted"> · agregado {dateMX(line.added_at.slice(0, 10))}</span>}</span>
                <span className="mono">{money(line.price_cents)}</span>
              </div>
            ))}
            {detail.lines.length === 0 && <p className="muted">Sin renglones registrados.</p>}
          </div>
          <p style={{ margin: 'var(--space-8) 0 0', fontSize: 'var(--text-h2)', fontFamily: 'var(--font-display)' }}>
            Total: <span className="mono">{money(detail.ledger.total_cents)}</span>
          </p>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Plan de pago{detail.contract.plan_name ? ` · ${detail.contract.plan_name}` : ''}</h3>
          <table className="sched">
            <thead><tr><th>Pago</th><th>Vence</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>
              {detail.ledger.coverage.map((row) => (
                <tr key={row.id} className={next?.id === row.id ? 'due' : ''}>
                  <td>{row.seq} de {detail.ledger.coverage.length}</td>
                  <td>{row.due_type === 'on_pickup' ? 'Al recoger' : dateMX(row.due_date)}</td>
                  <td className="mono">
                    {money(row.amount_cents)}
                    {row.applied_cents > 0 && row.remaining_cents > 0 && (
                      <><br /><span className="muted">faltan {money(row.remaining_cents)}</span></>
                    )}
                  </td>
                  <td>
                    {row.remaining_cents === 0
                      ? <span className="state">cubierta</span>
                      : row.status === 'overdue'
                        ? <span className="state late">vencida</span>
                        : next?.id === row.id
                          ? <span className="state late">toca ahora</span>
                          : <span className="state wait">pendiente</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ margin: 'var(--space-8) 0 0', fontSize: 'var(--text-h2)', fontFamily: 'var(--font-display)' }}>
            Saldo: <span className="mono">{money(detail.ledger.balance_cents)}</span>
          </p>

          {detail.ledger.overdue.length > 0 && detail.late_fee && me?.role === 'owner' && (
            <p className="lede" style={{ marginTop: 'var(--space-8)' }}>
              Recargo que permite el contrato: perder el descuento ({money(detail.late_fee.lose_discount_cents)}) o{' '}
              {money(detail.late_fee.monthly_fee_cents)} por {detail.late_fee.months_overdue}{' '}
              {detail.late_fee.months_overdue === 1 ? 'mes' : 'meses'}. Lo aprueba la dueña; no se aplica solo.
            </p>
          )}

          {detail.hotel.days_charged > 0 && (
            <p className="pill pill--clay" style={{ marginTop: 'var(--space-8)' }}>
              Hotel de vestido: {detail.hotel.days_charged} días fuera de la ventana libre · {money(detail.hotel.amount_cents)}
            </p>
          )}
        </div>

        {settled ? (
          <div className="panel"><p className="state">Contrato liquidado. El vestido pasa a listo para entrega en cuanto termine la costura.</p></div>
        ) : (
          <div className="panel">
            <h3 style={{ marginBottom: 'var(--space-8)' }}>Nuevo pago</h3>

            <div className="two">
              <Field label="Monto recibido" hint="Acepta cualquier cifra: nunca se rechaza dinero que la novia ya entregó.">
                {(id) => (
                  <input
                    id={id} type="text" inputMode="decimal" className="money"
                    value={amountFocused || parseMoney(amount) === null || amount.trim() === '' ? amount : money(parseMoney(amount) as number)}
                    onFocus={() => setAmountFocused(true)}
                    onBlur={() => setAmountFocused(false)}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Fecha">{(id) => <input id={id} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />}</Field>
            </div>

            {cents > 0 && planned > 0 && cents < planned && (
              <p className="state late" style={{ marginBottom: 'var(--space-9)' }}>
                Es menos que la parcialidad. Va a quedar cubierta a medias, con {money(planned - cents)} pendientes.
              </p>
            )}
            {cents > planned && planned > 0 && (
              <p className="state" style={{ marginBottom: 'var(--space-9)' }}>
                Es más que la parcialidad. La diferencia se corre a la siguiente.
              </p>
            )}

            <div className="two">
              <Field label="Forma de pago">
                {(id) => (
                  <select id={id} value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer')}>
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                )}
              </Field>
              <Field label="Folio de la nota">{(id) => <input id={id} type="text" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="A-1842" />}</Field>
            </div>

            <div className="field">
              <label>Comprobante (obligatorio)</label>
              <PhotoCapture
                key={photoKey}
                kind="receipt"
                contractId={detail.contract.id}
                label="Tomar foto de la nota"
                onUploaded={(id) => setFileIds((ids) => [...ids, id])}
              />
              {fileIds.length === 0 && <p className="err" style={{ color: 'var(--ink-faint)' }}>Sin foto no se registra el pago.</p>}
            </div>

            <p className="muted" style={{ fontSize: 'var(--text-label)', margin: 'var(--space-7) 0 0' }}>
              Los pagos no se pueden editar después. Si hay un error, la dueña lo cancela y se registra de nuevo.
            </p>
          </div>
        )}

        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Abonos registrados</h3>
          {detail.payments.length === 0 && <p className="muted">Todavía no hay abonos.</p>}
          <div className="hist">
            {detail.payments.map((p) => (
              <div key={p.id} style={{ opacity: p.voided_at ? .5 : 1 }}>
                <span>
                  {dateMX(p.paid_at)} · {p.method === 'cash' ? 'Efectivo' : 'Transferencia'}
                  {p.receipt_folio && ` · nota ${p.receipt_folio}`}
                  {p.voided_at && <><br /><span className="muted">Cancelado: {p.void_reason}</span></>}
                </span>
                <span className="row" style={{ alignItems: 'center' }}>
                  <span className="mono" style={{ textDecoration: p.voided_at ? 'line-through' : undefined }}>{money(p.amount_cents)}</span>
                  {me?.role === 'owner' && !p.voided_at && (
                    <ActionButton
                      className="btn-quiet"
                      onAction={async () => {
                        const reason = window.prompt('¿Por qué se cancela este abono?')
                        if (!reason?.trim()) return
                        await post(`/payments/${p.id}/void`, { reason: reason.trim() })
                        await load()
                        setToast('Abono cancelado. El renglón se queda a la vista.')
                        window.setTimeout(() => setToast(null), 4000)
                      }}
                    >
                      Cancelar
                    </ActionButton>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-8)' }}>Documentos</h3>
          <div className="docs">
            <DocCard label="Hoja de medidas" doc={docOf('measurement_sheet')} />
            <DocCard label="Contrato" doc={docOf('contract')} />
            <DocCard label="Ajustes de medidas" doc={docOf('adjustments')} kind="adjustments" contractId={detail.contract.id} onUploaded={load} />
            <DocCard label="Entrega del vestido" doc={docOf('delivery')} kind="delivery" contractId={detail.contract.id} onUploaded={load} />
            {/* Item 20: el comprobante de cada pago también es un documento —
                antes se subía y quedaba invisible aquí, sólo dentro del abono. */}
            {receipts.map((doc) => {
              const payment = detail.payments.find((p) => p.id === doc.payment_id)
              return (
                <DocCard
                  key={doc.id}
                  label="Pago registrado"
                  doc={doc}
                  note={[payment && money(payment.amount_cents), payment?.receipt_folio && `nota ${payment.receipt_folio}`].filter(Boolean).join(' · ')}
                />
              )
            })}
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}

      {addingAccessory && (
        <AddAccessory
          folio={detail.contract.folio}
          onClose={() => setAddingAccessory(false)}
          onAdded={async () => {
            setAddingAccessory(false)
            await load()
            setToast('Accesorio agregado. Se sumó al total que debe.')
            window.setTimeout(() => setToast(null), 4000)
          }}
        />
      )}
    </Screen>
  )
}

interface AccessoryItem { id: number; code: string; name: string; price_cents: number; needs_review: number; photos: string[] }

/** Item 18: sólo accesorios después de firmado — ni sesión ni medidas hacen falta. */
function AddAccessory({ folio, onClose, onAdded }: { folio: string; onClose: () => void; onAdded: () => Promise<void> }) {
  const [items, setItems] = useState<AccessoryItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void get<{ items: AccessoryItem[] }>('/items?kind=accessory&status=available')
      .then(({ data }) => setItems(data.items))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <Dialog title="Agregar accesorio" onCancel={onClose} closeLabel="Cerrar" big>
      <p className="lede">Se suma al total del contrato como dinero que debe además de su plan.</p>
      {error && <p className="err">{error}</p>}
      {items.length === 0 && !error && <p className="muted">No hay accesorios disponibles en esta sucursal.</p>}
      <div className="grid grid--tight">
        {items.map((a) => (
          <div key={a.id} className="pick-card">
            {a.photos[0] ? <img src={`/api/files/${a.photos[0]}`} alt="" className="art" /> : <GownArt seed={a.id} />}
            <span className="meta" style={{ display: 'block' }}>
              <span className="name" style={{ display: 'block' }}>{a.name}</span>
              <span className="brand" style={{ display: 'block' }}>{a.code}</span>
              <span className="price" style={{ display: 'block' }}>{money(a.price_cents)}</span>
              <ActionButton
                className="btn-quiet"
                done="Agregado"
                disabled={a.price_cents <= 0 || a.needs_review === 1}
                onAction={async () => { await post(`/contracts/${encodeURIComponent(folio)}/accessories`, { item_id: a.id }); await onAdded() }}
              >
                Agregar
              </ActionButton>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

/**
 * Las tarjetas de documentos: mismo tamaño, tres renglones — estado, nombre,
 * fecha (o una nota en su lugar). «Pendiente» va en rojo y no repite el
 * nombre del documento una segunda vez (antes «Pendiente · Ajustes de
 * medidas» iba seguido de «Ajustes de medidas» otra vez, renglón por medio).
 */
function DocCard({ label, doc, kind, contractId, onUploaded, note }: {
  label: string
  doc?: { id: string; created_at: string }
  kind?: PhotoKind
  contractId?: number
  onUploaded?: (fileId: string) => void | Promise<void>
  note?: string
}) {
  if (doc) {
    return (
      <a className="doc-card doc-card--done" href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer">
        <span className="doc-card__status">Completado</span>
        <span className="doc-card__name">{label}</span>
        <span className="doc-card__date">{note || dateMX(doc.created_at.slice(0, 10))}</span>
      </a>
    )
  }
  return (
    <div className="doc-card doc-card--pending">
      <span className="doc-card__status">Pendiente</span>
      <span className="doc-card__name">{label}</span>
      {kind && contractId !== undefined && onUploaded && (
        <PhotoCapture kind={kind} contractId={contractId} label="Tomar foto" onUploaded={onUploaded} hideIdleLabel />
      )}
    </div>
  )
}

// ─────────────────────────────────────── la clienta sin venta todavía ──
interface ClientDetailData {
  customer: { id: number; name: string; apellido: string; phone: string; wedding_date: string | null; created_at: string }
  session: {
    id: number; stage: string; opened_at: string; closed_at: string | null; closed_at_stage: string | null
    outcome: string | null; reason: string | null; note: string | null; contract_id: number | null
  } | null
  favorite_items: { id: number; code: string; name: string; kind: string; price_cents: number }[]
  contract: Detail | null
}

/**
 * La clienta que dio sus datos pero no compró — o cuya venta se canceló. No
 * hay folio que buscar, así que esta ficha se abre por su id de clienta, no
 * por contrato.
 */
function ClientDetail({ customerId, onBack }: { customerId: number; onBack: () => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<ClientDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void get<ClientDetailData>(`/clients/${customerId}`)
      .then(({ data }) => setData(data))
      .catch((err: Error) => setError(err.message))
  }, [customerId])

  if (error) return <Screen title="Clientes" onBack={onBack} backLabel="Regresar a la búsqueda"><div className="wrap"><p className="err">{error}</p></div></Screen>
  if (!data) return <Screen title="Clientes" onBack={onBack} backLabel="Regresar a la búsqueda" center><span className="spinner" aria-hidden="true" /></Screen>

  const { customer, session, favorite_items: favorites } = data
  const bride = `${customer.name} ${customer.apellido}`.trim()
  // Todavía se puede retomar si la sesión sigue abierta: el tiempo aún no la
  // cerró sola y nadie la cerró con un motivo. Semanas después casi siempre ya
  // se cerró — eso es lo que docs/NEXT.md deja anotado para resolver de fondo.
  const resumable = session !== null && session.closed_at === null

  function resume() {
    if (!session) return
    localStorage.setItem(SESSION_KEY, String(session.id))
    navigate('/sesion')
  }

  const infoParts = [
    customer.phone && `Tel: ${formatPhoneMX(customer.phone)}`,
    customer.wedding_date && `Fecha de boda: ${dateMX(customer.wedding_date)}`,
    `Registrada: ${dateMX(customer.created_at.slice(0, 10))}`,
  ].filter(Boolean)

  return (
    <Screen title={bride || 'Sin nombre'} onBack={onBack} backLabel="Regresar a la búsqueda" onClose={() => navigate('/')} closeLabel="Ir al inicio">
      <div className="wrap">
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>{infoParts.join(' · ')}</p>
        </div>

        <div className="panel">
          <div className="inv-head" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ margin: 0 }}>Lo que vio</h3>
            {resumable && <button type="button" className="btn-quiet" onClick={resume}>Agregar</button>}
          </div>
          {favorites.length === 0 && <p className="muted">No marcó ningún favorito.</p>}
          <div className="hist">
            {favorites.map((f) => (
              <div key={f.id}>
                <span>{f.name} <span className="muted mono">{f.code}</span></span>
                <span className="mono">{money(f.price_cents)}</span>
              </div>
            ))}
          </div>
          {resumable && (
            <p className="lede" style={{ margin: 'var(--space-8) 0 0' }}>
              Su sesión sigue abierta, en «{STAGE_LABEL[session.stage] ?? session.stage}». «Agregar» la retoma justo ahí,
              con sus favoritos intactos, en vez de empezar una nueva.
            </p>
          )}
        </div>

        {session && session.closed_at && session.outcome !== 'won' && (
          <div className="panel">
            <h3 style={{ marginBottom: 'var(--space-6)' }}>Por qué no se vendió</h3>
            <p style={{ fontSize: 'var(--text-lg)', margin: 0 }}>
              {session.outcome === 'abandoned'
                ? 'Sin actividad: se fue sin decir nada y la sesión se cerró sola.'
                : (LOST_LABEL[session.reason ?? ''] ?? session.reason ?? 'Sin motivo registrado')}
            </p>
            {session.note && <p className="muted" style={{ margin: 'var(--space-3) 0 0' }}>{session.note}</p>}
            <p className="muted" style={{ margin: 'var(--space-6) 0 0', fontSize: 'var(--text-label)' }}>
              Llegó hasta «{STAGE_LABEL[session.closed_at_stage ?? ''] ?? session.closed_at_stage}» · cerrada el {dateTimeMX(session.closed_at)}
            </p>
          </div>
        )}
      </div>
    </Screen>
  )
}
