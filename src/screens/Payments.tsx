import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import type { PhotoKind } from '../lib/image'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'

interface SearchRow {
  folio: string; status: string; total_cents: number; paid_cents: number; balance_cents: number
  name: string | null; apellido: string | null; phone: string | null
  code: string | null; item_name: string | null
}

interface Coverage {
  id: number; seq: number; due_type: 'fixed' | 'on_pickup'; due_date: string | null
  amount_cents: number; applied_cents: number; remaining_cents: number; status: string
}

interface Detail {
  contract: { id: number; folio: string; status: string; plan_name: string | null; total_cents: number; imported: number }
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  item: { id: number; code: string; name: string; status: string; ready_notified_at: string | null } | null
  lines: { id: number; description: string; price_cents: number; line_kind: string }[]
  payments: { id: number; paid_at: string; amount_cents: number; method: string; receipt_folio: string | null; voided_at: string | null; void_reason: string | null }[]
  documents: { id: string; kind: string; created_at: string }[]
  ledger: { total_cents: number; paid_cents: number; balance_cents: number; coverage: Coverage[]; next_due: Coverage | null; overdue: Coverage[] }
  seller: { name: string } | null
  hotel: { days_charged: number; amount_cents: number }
  late_fee: { months_overdue: number; lose_discount_cents: number; monthly_fee_cents: number } | null
}

const DOC_ES: Record<string, string> = {
  measurement_sheet: 'Hoja de medidas', contract: 'Contrato', receipt: 'Comprobante',
  adjustments: 'Ajustes de medidas', delivery: 'Entrega del vestido', item_photo: 'Foto del vestido', expense: 'Gasto',
}

export function PaymentsModule() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchRow[]>([])
  const [searched, setSearched] = useState(false)
  const [folio, setFolio] = useState<string | null>(() => new URLSearchParams(window.location.search).get('folio'))

  // Sin nada tecleado trae la lista completa: son pocas clientas y hojear la
  // tabla sirve más que una caja vacía esperando a que alguien sepa qué buscar.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void get<{ results: SearchRow[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then(({ data }) => { setResults(data.results); setSearched(true) })
        .catch(() => { setResults([]); setSearched(true) })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [q])

  if (folio) return <ContractView folio={folio} onBack={() => setFolio(null)} />

  return (
    <Screen title="Registrar pago" onBack={() => navigate('/')} backLabel="Regresar al inicio">
      <div className="wrap">
        <p className="lede">
          Busca por nombre, teléfono, folio de contrato o modelo del vestido, o toca cualquier
          renglón de la tabla. Todo pago necesita la foto de la nota.
        </p>

        <div className="panel">
          <div className="field" style={{ marginBottom: 'var(--space-6)' }}>
            <label htmlFor="q">Buscar</label>
            <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ana, 8112..., MTY-00142, Madelyn" autoComplete="off" autoFocus />
          </div>
          <div>
            {results.map((row) => (
              <button key={row.folio} type="button" className="result" onClick={() => setFolio(row.folio)}>
                <span>
                  <b style={{ fontWeight: 'var(--weight-regular)' }}>{[row.name, row.apellido].filter(Boolean).join(' ') || 'Sin nombre'}</b>
                  <br />
                  <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-label)' }}>
                    {[row.phone, row.item_name, row.code && `(${row.code})`, row.folio].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="state wait">saldo {money(row.balance_cents)}</span>
              </button>
            ))}
            {searched && results.length === 0 && (
              <p style={{ color: 'var(--ink-faint)' }}>
                {q.trim().length >= 2 ? <>Nada con «{q}». Prueba con el teléfono o el folio.</> : 'Todavía no hay clientas registradas.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </Screen>
  )
}

function ContractView({ folio, onBack }: { folio: string; onBack: () => void }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // El formulario del pago vive aquí, no en un componente aparte: el botón
  // que de verdad lo manda va en el pie fijo de la pantalla (ver más abajo), y
  // para eso necesita ver el mismo estado que los campos.
  const [amount, setAmount] = useState('')
  const [amountFocused, setAmountFocused] = useState(false)
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [receipt, setReceipt] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])
  // Cambiar esta llave remonta <PhotoCapture>: es la única forma de que
  // olvide «Foto adjuntada» después de guardar el pago, porque su estado de
  // «ya subí una foto» vive adentro del componente, no en fileIds.
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
    return <Screen title="Registrar pago" onBack={onBack} backLabel="Regresar a la búsqueda"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!detail) {
    return <Screen title="Registrar pago" onBack={onBack} backLabel="Regresar a la búsqueda" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  const bride = `${detail.customer?.name ?? ''} ${detail.customer?.apellido ?? ''}`.trim()
  const cents = parseMoney(amount) ?? 0
  const planned = next?.remaining_cents ?? 0
  const settled = !next && detail.ledger.balance_cents <= 0
  const canPay = !settled && fileIds.length > 0 && cents > 0

  const docOf = (kind: string) => detail.documents.find((d) => d.kind === kind)

  return (
    // El nombre de la clienta es el título: uno solo, en la barra de arriba.
    // La (X) lleva derecho a los cuadros; el regreso de siempre sigue yendo a
    // la búsqueda — antes esa flecha era la única salida de la pantalla.
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
          {/* Un contrato importado del libro de pagos no tiene fotos de sus
              comprobantes y nunca las va a tener: se cobraron antes de que
              existiera el sistema. Hay que verlo antes de buscarlas. */}
          {detail.contract.imported === 1 && (
            <p className="pill pill--brass" style={{ marginBottom: 'var(--space-8)' }}>
              Contrato histórico, importado del libro de pagos · sus abonos no tienen comprobante
            </p>
          )}
          <p className="muted" style={{ margin: 0 }}>
            {[
              detail.customer?.phone,
              detail.customer?.wedding_date && `boda ${dateMX(detail.customer.wedding_date)}`,
              detail.contract.folio,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Lo que se llevó: vestido y accesorios, con el total. Antes esta
            sección no existía y los accesorios eran invisibles en la única
            pantalla donde de verdad importan. */}
        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Lo que se llevó</h3>
          <div className="hist">
            {detail.lines.map((line) => (
              <div key={line.id}>
                <span>{line.description}</span>
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
              <Field
                label="Monto recibido"
                hint="Acepta cualquier cifra: nunca se rechaza dinero que la novia ya entregó."
              >
                {(id) => (
                  <input
                    id={id} type="text" inputMode="decimal" className="money"
                    // En foco se edita el número tal cual; al salir se ve como dinero
                    // ($, separador de miles, punto decimal) sin cambiar lo que guarda.
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
            <DocCard label={DOC_ES.measurement_sheet as string} doc={docOf('measurement_sheet')} />
            <DocCard label={DOC_ES.contract as string} doc={docOf('contract')} />
            <DocCard
              label={DOC_ES.adjustments as string} doc={docOf('adjustments')}
              kind="adjustments" contractId={detail.contract.id} onUploaded={load}
            />
            <DocCard
              label={DOC_ES.delivery as string} doc={docOf('delivery')}
              kind="delivery" contractId={detail.contract.id} onUploaded={load}
            />
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Screen>
  )
}

/**
 * Las cuatro tarjetas de documentos, del mismo tamaño y con los mismos tres
 * renglones: estado, nombre y fecha. Las dos ya capturadas (hoja de medidas,
 * contrato) sólo se ven; las otras dos (ajustes, entrega) son la misma hoja de
 * medidas fotografiada de nuevo, con sus firmas y notas más recientes, y la
 * tarjeta entera es el botón que toma esa foto.
 */
function DocCard({ label, doc, kind, contractId, onUploaded }: {
  label: string
  doc?: { id: string; created_at: string }
  kind?: PhotoKind
  contractId?: number
  onUploaded?: (fileId: string) => void | Promise<void>
}) {
  if (doc) {
    return (
      <a className="doc-card doc-card--done" href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer">
        <span className="doc-card__status">Completado</span>
        <span className="doc-card__name">{label}</span>
        <span className="doc-card__date">{dateMX(doc.created_at.slice(0, 10))}</span>
      </a>
    )
  }
  return (
    <div className="doc-card doc-card--pending">
      <span className="doc-card__status">Pendiente · {label}</span>
      <span className="doc-card__name">{label}</span>
      {kind && contractId !== undefined && onUploaded && (
        <PhotoCapture kind={kind} contractId={contractId} label="Tomar foto" onUploaded={onUploaded} />
      )}
    </div>
  )
}
