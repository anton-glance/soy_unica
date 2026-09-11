import { useCallback, useEffect, useState } from 'react'
import { get } from '../lib/api'
import { dateMX, money } from '../lib/format'
import { useNavigate } from '../lib/router'
import { Screen } from '../components/Screen'

interface Pick { code: string; name: string }

interface Venta {
  session_id: number; folio: string | null; bride: string; phone: string | null
  wedding_date: string | null; dress: Pick | null; accessories: Pick[]
  total_cents: number; plan_name: string | null; deposit_cents: number
  seller: string | null; signed_at: string | null
}

interface SinVenta {
  session_id: number; stage: string; reason: string | null; note: string | null
  bride: string; phone: string | null; wedding_date: string | null
  dress: Pick | null; favorites: Pick[]; seller: string | null
  opened_at: string; closed_at: string | null
}

interface Week {
  from: string; to: string
  conversion: { opened: number; reached_fitting: number; sold: number }
  ventas: Venta[]
  sin_venta: SinVenta[]
  anonimas: { count: number; reasons: { reason: string; n: number }[] }
}

/** Las etapas como se llaman en la tienda, no como se llaman en la base. */
const STAGE_ES: Record<string, string> = {
  browsing: 'Viendo el catálogo',
  fitting: 'En el probador',
  selected: 'Vestido escogido',
  bride_data: 'Dio sus datos',
  sheet_printed: 'Hoja de medidas impresa',
  sheet_signed: 'Hoja firmada',
  terms: 'Plan escogido',
  contract_printed: 'Contrato impreso',
  signed: 'Contrato firmado',
  payment: 'Primer abono',
  closed: 'Cerrada',
}

export function WeeklyReport() {
  const navigate = useNavigate()
  const [week, setWeek] = useState<Week | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cualquier día dentro de la semana que se quiere ver.
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    try {
      const { data } = await get<Week>(`/reports/weekly?date=${day}`)
      setWeek(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.')
    }
  }, [day])

  useEffect(() => { void load() }, [load])

  const back = () => navigate('/')
  if (error) {
    return <Screen title="Reporte semanal" onBack={back} backLabel="Regresar al inicio"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!week) {
    return <Screen title="Reporte semanal" onBack={back} backLabel="Regresar al inicio" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  const { opened, reached_fitting, sold } = week.conversion
  const pct = (n: number) => (opened === 0 ? '—' : `${Math.round((n / opened) * 100)}%`)

  return (
    <Screen title="Reporte semanal" onBack={back} backLabel="Regresar al inicio">
      <div className="wrap">
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--space-11)' }}>
          <div className="field" style={{ margin: 0, minWidth: 220 }}>
            <label htmlFor="rep-day">Semana de</label>
            <input id="rep-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <p className="muted">Del {dateMX(week.from)} al {dateMX(week.to)}</p>
        </div>

        {/* El embudo va arriba: cuántas entraron, cuántas se probaron algo y
            cuántas compraron. Todo lo demás es el detalle de esos tres. */}
        <div className="funnel">
          <div><b>{opened}</b><span>sesiones abiertas</span></div>
          <div><b>{reached_fitting}</b><span>llegaron al probador · {pct(reached_fitting)}</span></div>
          <div><b>{sold}</b><span>terminaron en venta · {pct(sold)}</span></div>
        </div>

        <h3 className="report-head">Ventas <span className="muted">· {week.ventas.length}</span></h3>
        {week.ventas.length === 0 && <p className="muted">Ninguna venta esta semana.</p>}
        {week.ventas.map((v) => (
          <div className="panel" key={v.session_id}>
            <div className="report-row">
              <div>
                <b style={{ fontWeight: 'var(--weight-medium)' }}>{v.bride || 'Sin nombre'}</b>
                <p className="muted">
                  {[v.phone, v.wedding_date && `boda ${dateMX(v.wedding_date)}`, v.folio, v.seller && `vendió ${v.seller}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="mono money">{money(v.total_cents)}</span>
                <p className="muted">{v.plan_name} · anticipo {money(v.deposit_cents)}</p>
              </div>
            </div>
            <p style={{ marginTop: 'var(--space-6)' }}>
              {v.dress ? <>{v.dress.name} <span className="muted mono">{v.dress.code}</span></> : <span className="muted">sin vestido en el registro</span>}
              {v.accessories.length > 0 && (
                <> · {v.accessories.map((a) => `${a.name} (${a.code})`).join(', ')}</>
              )}
            </p>
          </div>
        ))}

        <h3 className="report-head">Sesiones sin venta <span className="muted">· {week.sin_venta.length} con clienta identificada</span></h3>
        {/* Éstas son la lista de llamadas: hay nombre, teléfono y el vestido
            que quería. */}
        {week.sin_venta.length === 0 && <p className="muted">Ninguna clienta identificada se fue sin comprar esta semana.</p>}
        {week.sin_venta.map((r) => (
          <div className="panel" key={r.session_id}>
            <div className="report-row">
              <div>
                <b style={{ fontWeight: 'var(--weight-medium)' }}>{r.bride || 'Sin nombre'}</b>
                <p className="muted">
                  {[r.phone, r.wedding_date && `boda ${dateMX(r.wedding_date)}`, r.seller && `atendió ${r.seller}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="bdg warn">{STAGE_ES[r.stage] ?? r.stage}</span>
            </div>
            <p style={{ marginTop: 'var(--space-6)' }}>
              {r.dress
                ? <>Quería {r.dress.name} <span className="muted mono">{r.dress.code}</span></>
                : <span className="muted">No marcó ningún vestido.</span>}
              {r.favorites.length > 1 && (
                <span className="muted"> · también vio {r.favorites.filter((f) => f.code !== r.dress?.code).map((f) => f.code).join(', ')}</span>
              )}
            </p>
            {(r.reason || r.note) && (
              <p className="state late" style={{ marginTop: 'var(--space-6)' }}>
                {[r.reason, r.note].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        ))}

        {/* Las que se fueron antes de dar sus datos salen como cuenta: no hay
            nada personal guardado de ellas, que es exactamente lo correcto. */}
        <h3 className="report-head">Se fueron antes de dar sus datos <span className="muted">· {week.anonimas.count}</span></h3>
        {week.anonimas.count === 0 && <p className="muted">Ninguna.</p>}
        {week.anonimas.count > 0 && (
          <div className="panel">
            <div className="hist">
              {week.anonimas.reasons.map((r) => (
                <div key={r.reason}><span>{r.reason}</span><span className="mono">{r.n}</span></div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-label)' }}>
              De estas sesiones no se guarda ningún dato personal: nunca se capturó ninguno.
            </p>
          </div>
        )}
      </div>
    </Screen>
  )
}
