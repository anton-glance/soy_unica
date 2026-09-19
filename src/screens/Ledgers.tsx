import { useCallback, useEffect, useState } from 'react'
import { get } from '../lib/api'
import { dateMX, money } from '../lib/format'
import { useNavigate } from '../lib/router'
import { Screen } from '../components/Screen'
import { PERIODS, rangeFor, todayLocal, type PeriodKey } from '../lib/period'

/**
 * El mismo selector de periodo que Reports, para el rollo completo de pagos
 * o de gastos — antes sólo existía por semana (Registrar gasto) o dentro de
 * un contrato, uno por uno (pagos). Aquí se ven todos juntos, filtrados.
 */
function usePeriod() {
  const today = todayLocal()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('week')
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: today, to: today })
  const [range, setRange] = useState<[string, string]>(() => rangeFor('week', today))

  function pick(key: PeriodKey) {
    setPeriodKey(key)
    if (key !== 'custom') setRange(rangeFor(key, today))
  }
  const customError = custom.from > custom.to ? '«Desde» no puede ser posterior a «hasta».' : custom.to > today ? 'No se puede pedir un periodo en el futuro.' : null

  return { today, periodKey, pick, custom, setCustom, customError, range, setRange }
}

function PeriodBar({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <>
      <div className="period-bar">
        {PERIODS.map((period) => (
          <button key={period.key} type="button" className="chip" aria-pressed={p.periodKey === period.key} onClick={() => p.pick(period.key)}>
            {period.label}
          </button>
        ))}
      </div>
      {p.periodKey === 'custom' && (
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--space-9)' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="ld-from">Desde</label>
            <input id="ld-from" type="date" max={p.today} value={p.custom.from} onChange={(e) => p.setCustom((c) => ({ ...c, from: e.target.value }))} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="ld-to">Hasta</label>
            <input id="ld-to" type="date" max={p.today} value={p.custom.to} onChange={(e) => p.setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
          <button type="button" className="btn-main" disabled={!!p.customError} onClick={() => p.setRange([p.custom.from, p.custom.to])}>
            Aplicar
          </button>
        </div>
      )}
      {p.periodKey === 'custom' && p.customError && <p className="err">{p.customError}</p>}
      <p className="muted" style={{ marginBottom: 'var(--space-11)' }}>Del {dateMX(p.range[0])} al {dateMX(p.range[1])}</p>
    </>
  )
}

// ───────────────────────────────────────────────────────────── pagos ──
interface PaymentRow {
  id: number; paid_at: string; amount_cents: number; method: string; receipt_folio: string | null
  voided_at: string | null; void_reason: string | null; folio: string; bride: string
}

const METHOD_ES: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia' }

export function PaymentsLedger() {
  const navigate = useNavigate()
  const p = usePeriod()
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await get<{ payments: PaymentRow[]; total_cents: number }>(`/payments?from=${p.range[0]}&to=${p.range[1]}`)
      setRows(data.payments)
      setTotal(data.total_cents)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pagos.')
    }
  }, [p.range])

  useEffect(() => { void load() }, [load])

  return (
    <Screen
      title="Todos los pagos"
      onBack={() => navigate('/')}
      backLabel="Regresar al inicio"
      right={<a className="btn-quiet" href={`/api/payments/export?from=${p.range[0]}&to=${p.range[1]}`}>Exportar CSV</a>}
    >
      <div className="wrap">
        <p className="lede">Cada abono registrado en esta sucursal en el periodo, cancelados incluidos.</p>
        {error && <p className="err">{error}</p>}
        <PeriodBar p={p} />

        <p style={{ fontSize: 'var(--text-h2)', fontFamily: 'var(--font-display)', margin: '0 0 var(--space-11)' }}>
          Recibido: <span className="mono">{money(total)}</span>
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th><th>Clienta</th><th>Folio</th><th>Monto</th><th>Forma</th><th>Nota</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ opacity: r.voided_at ? .5 : 1, cursor: 'default' }}>
                  <td className="mono">{dateMX(r.paid_at)}</td>
                  <td className="model">{r.bride || 'Sin nombre'}</td>
                  <td className="mono">{r.folio}</td>
                  <td className="mono" style={{ textDecoration: r.voided_at ? 'line-through' : undefined }}>{money(r.amount_cents)}</td>
                  <td>{METHOD_ES[r.method] ?? r.method}</td>
                  <td>{r.receipt_folio ?? '—'}</td>
                  <td>{r.voided_at ? <span className="state late">Cancelado</span> : <span className="state">Vigente</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>Ningún pago en este periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Screen>
  )
}

// ──────────────────────────────────────────────────────────── gastos ──
interface ExpenseRow {
  id: number; spent_at: string; category: string; amount_cents: number; vendor: string | null; note: string | null
}

export function ExpensesLedger() {
  const navigate = useNavigate()
  const p = usePeriod()
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await get<{ expenses: ExpenseRow[]; total_cents: number }>(`/expenses/period?from=${p.range[0]}&to=${p.range[1]}`)
      setRows(data.expenses)
      setTotal(data.total_cents)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los gastos.')
    }
  }, [p.range])

  useEffect(() => { void load() }, [load])

  return (
    <Screen
      title="Todos los gastos"
      onBack={() => navigate('/')}
      backLabel="Regresar al inicio"
      right={<a className="btn-quiet" href={`/api/expenses/export?from=${p.range[0]}&to=${p.range[1]}`}>Exportar CSV</a>}
    >
      <div className="wrap">
        <p className="lede">Cada gasto registrado en esta sucursal en el periodo.</p>
        {error && <p className="err">{error}</p>}
        <PeriodBar p={p} />

        <p style={{ fontSize: 'var(--text-h2)', fontFamily: 'var(--font-display)', margin: '0 0 var(--space-11)' }}>
          Gastado: <span className="mono">{money(total)}</span>
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>Fecha</th><th>Categoría</th><th>Monto</th><th>Proveedor</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td className="mono">{dateMX(r.spent_at)}</td>
                  <td className="model">{r.category}</td>
                  <td className="mono">{money(r.amount_cents)}</td>
                  <td>{r.vendor ?? '—'}</td>
                  <td>{r.note ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>Ningún gasto en este periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Screen>
  )
}
