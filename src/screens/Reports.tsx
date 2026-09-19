import { useCallback, useEffect, useState } from 'react'
import { get } from '../lib/api'
import { dateMX, money } from '../lib/format'
import { useNavigate } from '../lib/router'
import { Screen } from '../components/Screen'
import { PERIODS, rangeFor, todayLocal, type PeriodKey } from '../lib/period'

interface Pick { code: string; name: string }
interface AddedAfter { description: string; price_cents: number; added_at: string }

interface Venta {
  session_id: number; folio: string | null; bride: string; phone: string | null
  wedding_date: string | null; dress: Pick | null; accessories: Pick[]
  total_cents: number; plan_name: string | null; deposit_cents: number
  seller: string | null; signed_at: string | null; added_after: AddedAfter[]
}

interface SinVenta {
  session_id: number; stage: string; outcome: string | null; reason: string | null; note: string | null
  bride: string; phone: string | null; wedding_date: string | null
  dress: Pick | null; favorites: Pick[]; seller: string | null
  opened_at: string; closed_at: string | null
}

interface Period {
  from: string; to: string
  finance: { received_cents: number; spent_cents: number }
  conversion: { opened: number; reached_fitting: number; sold: number; abandoned: number }
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

export function Reports() {
  const navigate = useNavigate()
  const today = todayLocal()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('week')
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: today, to: today })
  const [range, setRange] = useState<[string, string]>(() => rangeFor('week', today))
  const [data, setData] = useState<Period | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await get<Period>(`/reports/period?from=${range[0]}&to=${range[1]}`)
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.')
    }
  }, [range])

  useEffect(() => { void load() }, [load])

  function pick(key: PeriodKey) {
    setPeriodKey(key)
    if (key !== 'custom') setRange(rangeFor(key, today))
  }

  const customError = custom.from > custom.to ? '«Desde» no puede ser posterior a «hasta».' : custom.to > today ? 'No se puede pedir un periodo en el futuro.' : null

  const back = () => navigate('/')
  if (error) {
    return <Screen title="Reportes" onBack={back} backLabel="Regresar al inicio"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!data) {
    return <Screen title="Reportes" onBack={back} backLabel="Regresar al inicio" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  const { opened, reached_fitting, sold, abandoned } = data.conversion
  const pct = (n: number) => (opened === 0 ? '—' : `${Math.round((n / opened) * 100)}%`)

  return (
    <Screen title="Reportes" onBack={back} backLabel="Regresar al inicio">
      <div className="wrap">
        {/* Item 25: ya no «la semana de tal fecha» — cinco botones de periodo,
            el último a la medida. */}
        <div className="period-bar">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className="chip" aria-pressed={periodKey === p.key} onClick={() => pick(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {periodKey === 'custom' && (
          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--space-9)' }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="rep-from">Desde</label>
              <input id="rep-from" type="date" max={today} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="rep-to">Hasta</label>
              <input id="rep-to" type="date" max={today} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
            <button type="button" className="btn-main" disabled={!!customError} onClick={() => setRange([custom.from, custom.to])}>
              Aplicar
            </button>
          </div>
        )}
        {periodKey === 'custom' && customError && <p className="err">{customError}</p>}
        <p className="muted" style={{ marginBottom: 'var(--space-11)' }}>Del {dateMX(data.from)} al {dateMX(data.to)}</p>

        {/* Item 24: el dinero de verdad, arriba de las tres del embudo. */}
        <h3 className="report-head" style={{ marginTop: 0 }}>Finanzas</h3>
        <div className="funnel funnel--3">
          <div className="funnel__tile--in"><b>{money(data.finance.received_cents)}</b><span>recibido</span></div>
          <div className="funnel__tile--out"><b>{money(data.finance.spent_cents)}</b><span>gastado</span></div>
          <div className="funnel__tile--balance"><b>{money(data.finance.received_cents - data.finance.spent_cents)}</b><span>balance</span></div>
        </div>

        <h3 className="report-head">Ventas</h3>
        <div className="funnel">
          <div><b>{opened}</b><span>sesiones abiertas</span></div>
          <div><b>{reached_fitting}</b><span>llegaron al probador · {pct(reached_fitting)}</span></div>
          <div><b>{sold}</b><span>terminaron en venta · {pct(sold)}</span></div>
        </div>
        {abandoned > 0 && (
          <p className="muted" style={{ margin: '0 0 var(--space-12)' }}>
            {abandoned === 1
              ? '1 sesión se cerró sola por quedarse abierta sin actividad.'
              : `${abandoned} sesiones se cerraron solas por quedarse abiertas sin actividad.`}
            {' '}No cuentan como venta perdida: nadie registró por qué se fue la clienta.
          </p>
        )}

        <h3 className="report-head">Clientas <span className="muted">· {data.ventas.length}</span></h3>
        {data.ventas.length === 0 && <p className="muted">Ninguna venta en este periodo.</p>}
        {/* Item 26: un renglón por clienta — nombre, modelo, total — con una
            flecha que expande el detalle completo. Antes cada venta ocupaba
            un panel entero, siempre abierto, aunque sólo importara el total. */}
        {data.ventas.map((v) => {
          const open = openId === v.session_id
          return (
            <div className="panel" key={v.session_id} style={{ padding: 0 }}>
              <button type="button" className="venta-row" onClick={() => setOpenId(open ? null : v.session_id)} aria-expanded={open}>
                <span className={`venta-row__chevron${open ? ' is-open' : ''}`} aria-hidden="true">▶</span>
                <span className="venta-row__main">
                  <span>
                    <b style={{ fontWeight: 'var(--weight-medium)' }}>{v.bride || 'Sin nombre'}</b>
                    <span className="muted" style={{ display: 'block', fontSize: 'var(--text-label)' }}>
                      {v.dress ? v.dress.name : 'sin vestido en el registro'}
                    </span>
                  </span>
                  <span className="mono money">{money(v.total_cents)}</span>
                </span>
              </button>
              {open && (
                <div style={{ padding: '0 var(--space-10) var(--space-10)' }}>
                  <p className="muted">
                    {[v.phone, v.wedding_date && `boda ${dateMX(v.wedding_date)}`, v.folio, v.seller && `vendió ${v.seller}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                  <p style={{ marginTop: 'var(--space-6)' }}>
                    {v.dress ? <>{v.dress.name} <span className="muted mono">{v.dress.code}</span></> : <span className="muted">sin vestido en el registro</span>}
                    {v.accessories.length > 0 && (
                      <> · {v.accessories.map((a) => `${a.name} (${a.code})`).join(', ')}</>
                    )}
                  </p>
                  <p className="muted" style={{ marginTop: 'var(--space-4)' }}>{v.plan_name} · anticipo {money(v.deposit_cents)}</p>
                  {v.added_after.length > 0 && (
                    <>
                      <p className="muted" style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-label)' }}>Agregado después del contrato:</p>
                      <div className="hist">
                        {v.added_after.map((a, i) => (
                          <div key={i}>
                            <span>{a.description} <span className="muted">· {dateMX(a.added_at.slice(0, 10))}</span></span>
                            <span className="mono">{money(a.price_cents)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <h3 className="report-head">Sesiones sin venta <span className="muted">· {data.sin_venta.length} con clienta identificada</span></h3>
        {data.sin_venta.length === 0 && <p className="muted">Ninguna clienta identificada se fue sin comprar en este periodo.</p>}
        {data.sin_venta.map((r) => (
          <div className="panel" key={r.session_id}>
            <div className="report-row">
              <div>
                <b style={{ fontWeight: 'var(--weight-medium)' }}>{r.bride || 'Sin nombre'}</b>
                <p className="muted">
                  {[r.phone, r.wedding_date && `boda ${dateMX(r.wedding_date)}`, r.seller && `atendió ${r.seller}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={`bdg ${r.outcome === 'abandoned' ? 'mute' : 'warn'}`}>
                {r.outcome === 'abandoned' ? 'Se quedó abierta' : (STAGE_ES[r.stage] ?? r.stage)}
              </span>
            </div>
            <p style={{ marginTop: 'var(--space-6)' }}>
              {r.dress
                ? <>Quería {r.dress.name} <span className="muted mono">{r.dress.code}</span></>
                : <span className="muted">No marcó ningún vestido.</span>}
              {r.favorites.length > 1 && (
                <span className="muted"> · también vio {r.favorites.filter((f) => f.code !== r.dress?.code).map((f) => f.code).join(', ')}</span>
              )}
            </p>
            {r.outcome === 'abandoned' ? (
              <p className="state wait" style={{ marginTop: 'var(--space-6)' }}>
                La tableta se quedó abierta y la sesión se cerró sola · llegó a {(STAGE_ES[r.stage] ?? r.stage).toLowerCase()}
              </p>
            ) : (r.reason || r.note) && (
              <p className="state late" style={{ marginTop: 'var(--space-6)' }}>
                {[r.reason, r.note].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        ))}

        {/*
          Antes decía «Se fueron antes de dar sus datos», pero desde que el
          cierre del kiosco pide nombre y teléfono, ya nadie llega aquí por
          irse a media conversación — lo que queda es casi siempre la tableta
          que se quedó abierta y se cerró sola.
        */}
        <h3 className="report-head">Sin datos de contacto <span className="muted">· {data.anonimas.count}</span></h3>
        {data.anonimas.count === 0 && <p className="muted">Ninguna.</p>}
        {data.anonimas.count > 0 && (
          <div className="panel">
            <div className="hist">
              {data.anonimas.reasons.map((r) => (
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
