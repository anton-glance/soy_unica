import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Field } from '../components/Field'

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
  contract: { id: number; folio: string; status: string; plan_name: string | null; total_cents: number }
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  item: { id: number; code: string; name: string; status: string; ready_notified_at: string | null } | null
  lines: { description: string; price_cents: number; line_kind: string }[]
  payments: { id: number; paid_at: string; amount_cents: number; method: string; receipt_folio: string | null; voided_at: string | null; void_reason: string | null }[]
  documents: { id: string; kind: string; created_at: string }[]
  ledger: { total_cents: number; paid_cents: number; balance_cents: number; coverage: Coverage[]; next_due: Coverage | null; overdue: Coverage[] }
  seller: { name: string } | null
  hotel: { days_charged: number; amount_cents: number }
  late_fee: { months_overdue: number; lose_discount_cents: number; monthly_fee_cents: number } | null
}

const DOC_ES: Record<string, string> = {
  measurement_sheet: 'Hoja de medidas', contract: 'Contrato', receipt: 'Comprobante',
  adjustments: 'Ajustes', delivery: 'Entrega', item_photo: 'Foto del vestido', expense: 'Gasto',
}

export function PaymentsModule() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchRow[]>([])
  const [searched, setSearched] = useState(false)
  const [folio, setFolio] = useState<string | null>(() => new URLSearchParams(window.location.search).get('folio'))

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return }
    const timer = window.setTimeout(() => {
      void get<{ results: SearchRow[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then(({ data }) => { setResults(data.results); setSearched(true) })
        .catch(() => { setResults([]); setSearched(true) })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [q])

  if (folio) return <ContractView folio={folio} onBack={() => setFolio(null)} />

  return (
    <div className="wrap">
      <h2>Registrar pago</h2>
      <p className="lede">
        Busca por nombre, teléfono, folio de contrato o modelo del vestido. Todo pago necesita la foto de la nota.
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
            <p style={{ color: 'var(--ink-faint)' }}>Nada con «{q}». Prueba con el teléfono o el folio.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ContractView({ folio, onBack }: { folio: string; onBack: () => void }) {
  const { me } = useSession()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  if (error) return <div className="wrap"><p className="err">{error}</p></div>
  if (!detail) return <div className="wrap"><span className="spinner" aria-hidden="true" /></div>

  const bride = `${detail.customer?.name ?? ''} ${detail.customer?.apellido ?? ''}`.trim()
  const next = detail.ledger.next_due

  return (
    <>
      <div className="wrap">
        <button type="button" className="btn-quiet" style={{ marginBottom: 'var(--space-9)' }} onClick={onBack}>← Otra clienta</button>

        <div className="panel">
          <h3>{bride || 'Sin nombre'}</h3>
          <p className="muted" style={{ margin: 'var(--space-2) 0 var(--space-9)' }}>
            {[
              detail.customer?.phone,
              detail.customer?.wedding_date && `boda ${dateMX(detail.customer.wedding_date)}`,
              detail.item && `${detail.item.name} · ${detail.item.code}`,
              detail.contract.plan_name && `plan ${detail.contract.plan_name}`,
              detail.contract.folio,
              detail.seller && `vendió ${detail.seller.name}`,
            ].filter(Boolean).join(' · ')}
          </p>

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

        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Documentos</h3>
          <div className="row">
            {detail.documents.map((doc) => (
              <a key={doc.id} className="chip chip--sm" href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer">
                {DOC_ES[doc.kind] ?? doc.kind} · {dateMX(doc.created_at.slice(0, 10))}
              </a>
            ))}
            {detail.documents.length === 0 && <span className="muted">Sin documentos.</span>}
          </div>
          <div className="two" style={{ marginTop: 'var(--space-9)' }}>
            {/* La misma hoja física se firma dos veces más, y se fotografía desde aquí. */}
            <div className="field">
              <label>Bloque de ajustes</label>
              <PhotoCapture kind="adjustments" contractId={detail.contract.id} label="Tomar foto" onUploaded={load} />
            </div>
            <div className="field">
              <label>Bloque de entrega</label>
              <PhotoCapture kind="delivery" contractId={detail.contract.id} label="Tomar foto" onUploaded={load} />
            </div>
          </div>
        </div>

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

        <PaymentForm
          detail={detail}
          onSaved={async (message) => { await load(); setToast(message); window.setTimeout(() => setToast(null), 5000) }}
        />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

function PaymentForm({ detail, onSaved }: { detail: Detail; onSaved: (message: string) => Promise<void> }) {
  const next = detail.ledger.next_due
  const [amount, setAmount] = useState(() => (next ? String(next.remaining_cents / 100) : ''))
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [receipt, setReceipt] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])

  useEffect(() => { setAmount(next ? String(next.remaining_cents / 100) : '') }, [next])

  if (!next && detail.ledger.balance_cents <= 0) {
    return <div className="panel"><p className="state">Contrato liquidado. El vestido pasa a listo para entrega en cuanto termine la costura.</p></div>
  }

  const cents = parseMoney(amount) ?? 0
  const planned = next?.remaining_cents ?? 0

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-8)' }}>Nuevo pago</h3>

      <div className="two">
        <Field
          label="Monto recibido"
          hint="Acepta cualquier cifra: nunca se rechaza dinero que la novia ya entregó."
        >
          {(id) => <input id={id} type="text" inputMode="decimal" className="money" value={amount} onChange={(e) => setAmount(e.target.value)} />}
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
          kind="receipt"
          contractId={detail.contract.id}
          label="Tomar foto de la nota"
          onUploaded={(id) => setFileIds((ids) => [...ids, id])}
        />
        {fileIds.length === 0 && <p className="err" style={{ color: 'var(--ink-faint)' }}>Sin foto no se registra el pago.</p>}
      </div>

      <ActionButton
        disabled={fileIds.length === 0 || cents <= 0}
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
          const left = detail.ledger.balance_cents - cents
          await onSaved(
            left > 0
              ? `Pago de ${money(cents)} registrado. Saldo ${money(left)}.`
              : `Pago de ${money(cents)} registrado. Contrato liquidado.`,
          )
        }}
      >
        Registrar pago de {money(cents)}
      </ActionButton>

      <p className="muted" style={{ fontSize: 'var(--text-label)', margin: 'var(--space-7) 0 0' }}>
        Los pagos no se pueden editar después. Si hay un error, la dueña lo cancela y se registra de nuevo.
      </p>
    </div>
  )
}
