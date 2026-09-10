import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, moneyShort, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Field, TextInput, Chips } from '../components/Field'

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
  const [folio, setFolio] = useState<string | null>(() => new URLSearchParams(window.location.search).get('folio'))

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const timer = window.setTimeout(() => {
      void get<{ results: SearchRow[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then(({ data }) => setResults(data.results))
        .catch(() => setResults([]))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [q])

  if (folio) return <ContractView folio={folio} onBack={() => setFolio(null)} />

  return (
    <div className="page stack">
      <h1>Registrar pago</h1>
      <Field label="Busca a la clienta" hint="Nombre, apellido, teléfono, folio, código o modelo">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </Field>

      <div className="stack">
        {results.map((row) => (
          <button key={row.folio} type="button" className="card row row--between" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setFolio(row.folio)}>
            <span>
              <strong>{[row.name, row.apellido].filter(Boolean).join(' ') || 'Sin nombre'}</strong>
              <br />
              <span className="muted numeric">{row.folio} · {row.item_name ?? '—'} {row.code ? `(${row.code})` : ''}</span>
            </span>
            <span className="numeric" style={{ textAlign: 'right' }}>
              <strong>{money(row.balance_cents)}</strong><br />
              <span className="muted">saldo</span>
            </span>
          </button>
        ))}
        {q.trim().length >= 2 && results.length === 0 && <p className="muted">No se encontró nada con eso.</p>}
      </div>
    </div>
  )
}

function ContractView({ folio, onBack }: { folio: string; onBack: () => void }) {
  const { me } = useSession()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (error) return <div className="page"><p className="notice notice--error">{error}</p></div>
  if (!detail) return <div className="page"><span className="spinner" aria-hidden="true" /></div>

  const bride = `${detail.customer?.name ?? ''} ${detail.customer?.apellido ?? ''}`.trim()

  return (
    <div className="page stack">
      <button type="button" className="btn btn--ghost" onClick={onBack}>← Otra clienta</button>

      <div className="row row--between row--wrap">
        <div>
          <h1>{bride || 'Sin nombre'}</h1>
          <p className="muted numeric">{detail.contract.folio} · {detail.item?.name} ({detail.item?.code}) · {detail.contract.plan_name}</p>
        </div>
        {/* El saldo es el número más grande de la pantalla. */}
        <div style={{ textAlign: 'right' }}>
          <div className="numeric" style={{ fontSize: 'var(--text-hero)', lineHeight: 1 }}>{moneyShort(detail.ledger.balance_cents)}</div>
          <div className="muted">saldo de {money(detail.ledger.total_cents)}</div>
        </div>
      </div>

      {detail.ledger.overdue.length > 0 && (
        <p className="notice notice--warn">
          {detail.ledger.overdue.length === 1 ? 'Hay 1 parcialidad vencida.' : `Hay ${detail.ledger.overdue.length} parcialidades vencidas.`}
          {detail.late_fee && me?.role === 'owner' && (
            <> Recargo sugerido: perder el descuento ({money(detail.late_fee.lose_discount_cents)}) o {money(detail.late_fee.monthly_fee_cents)} por {detail.late_fee.months_overdue} mes(es). Lo aprueba la dueña; no se aplica solo.</>
          )}
        </p>
      )}

      {detail.hotel.days_charged > 0 && (
        <p className="notice notice--warn">
          Hotel de vestido: {detail.hotel.days_charged} días fuera de la ventana libre · {money(detail.hotel.amount_cents)}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-5)' }}>
        <section className="card stack">
          <h2>Plan acordado</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {detail.ledger.coverage.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 'var(--space-2) 0' }}>
                    {row.seq}. {row.due_type === 'on_pickup' ? 'Al recoger' : dateMX(row.due_date)}
                    {row.status === 'overdue' && <span className="notice notice--error" style={{ marginLeft: 8 }}>Vencida</span>}
                  </td>
                  <td className="numeric" style={{ textAlign: 'right' }}>
                    {money(row.amount_cents)}
                    {row.remaining_cents > 0 && row.applied_cents > 0 && (
                      <><br /><span className="muted">faltan {money(row.remaining_cents)}</span></>
                    )}
                    {row.remaining_cents === 0 && <><br /><span className="muted">cubierta</span></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card stack">
          <h2>Abonos registrados</h2>
          {detail.payments.length === 0 && <p className="muted">Todavía no hay abonos.</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {detail.payments.map((p) => (
                <tr key={p.id} style={{ opacity: p.voided_at ? 0.5 : 1 }}>
                  <td style={{ padding: 'var(--space-2) 0' }}>
                    {dateMX(p.paid_at)} · {p.method === 'cash' ? 'Efectivo' : 'Transferencia'}
                    {p.voided_at && <><br /><span className="muted">Cancelado: {p.void_reason}</span></>}
                  </td>
                  <td className="numeric" style={{ textAlign: 'right', textDecoration: p.voided_at ? 'line-through' : undefined }}>
                    {money(p.amount_cents)}
                  </td>
                  {me?.role === 'owner' && !p.voided_at && (
                    <td style={{ textAlign: 'right' }}>
                      <ActionButton
                        className="btn btn--ghost"
                        onAction={async () => {
                          const reason = window.prompt('¿Por qué se cancela este abono?')
                          if (!reason?.trim()) return
                          await post(`/payments/${p.id}/void`, { reason: reason.trim() })
                          await load()
                        }}
                      >
                        Cancelar
                      </ActionButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card stack">
        <h2>Documentos</h2>
        <div className="row row--wrap">
          {detail.documents.map((doc) => (
            <a key={doc.id} className="chip" href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer">
              {DOC_ES[doc.kind] ?? doc.kind} · {dateMX(doc.created_at.slice(0, 10))}
            </a>
          ))}
          {detail.documents.length === 0 && <span className="muted">Sin documentos.</span>}
        </div>
        <div className="row row--wrap">
          {/* La misma hoja física se firma dos veces más, y se fotografía desde aquí. */}
          <PhotoCapture kind="adjustments" contractId={detail.contract.id} label="Foto del bloque de ajustes" onUploaded={load} />
          <PhotoCapture kind="delivery" contractId={detail.contract.id} label="Foto del bloque de entrega" onUploaded={load} />
        </div>
      </section>

      <PaymentForm detail={detail} onSaved={load} />
    </div>
  )
}

function PaymentForm({ detail, onSaved }: { detail: Detail; onSaved: () => Promise<void> }) {
  const next = detail.ledger.next_due
  const [amount, setAmount] = useState(() => (next ? String(next.remaining_cents / 100) : ''))
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash')
  const [receipt, setReceipt] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])

  useEffect(() => { setAmount(next ? String(next.remaining_cents / 100) : '') }, [next])

  const cents = parseMoney(amount) ?? 0
  const planned = next?.remaining_cents ?? 0

  return (
    <section className="card stack">
      <h2>Registrar un abono</h2>
      {next && (
        <p className="muted">
          Toca la parcialidad {next.seq}: {money(next.remaining_cents)}
          {next.due_type === 'fixed' && next.due_date ? ` con fecha ${dateMX(next.due_date)}` : ' al recoger el vestido'}.
        </p>
      )}

      <Field label="Monto" hint="Acepta cualquier cifra: nunca se rechaza dinero que la novia ya entregó.">
        <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </Field>
      {cents > 0 && planned > 0 && cents < planned && (
        <p className="notice notice--warn">
          Es menos que la parcialidad. Va a quedar cubierta a medias, con {money(planned - cents)} pendientes.
        </p>
      )}
      {cents > planned && planned > 0 && (
        <p className="notice notice--ok">Es más que la parcialidad. La diferencia se corre a la siguiente.</p>
      )}

      <Field label="Fecha"><TextInput type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      <Chips
        label="Forma de pago"
        options={[{ value: 'cash' as const, label: 'Efectivo' }, { value: 'transfer' as const, label: 'Transferencia' }]}
        value={method}
        onChange={setMethod}
      />
      <Field label="Folio del recibo (opcional)"><TextInput value={receipt} onChange={(e) => setReceipt(e.target.value)} /></Field>

      <PhotoCapture
        kind="receipt"
        contractId={detail.contract.id}
        label="Foto del comprobante (obligatoria)"
        onUploaded={(id) => setFileIds((ids) => [...ids, id])}
      />

      <ActionButton
        disabled={fileIds.length === 0 || cents <= 0}
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
          await onSaved()
        }}
        done="Abono registrado"
      >
        Registrar el abono
      </ActionButton>
      {fileIds.length === 0 && <p className="muted">Falta la foto del comprobante.</p>}
    </section>
  )
}

