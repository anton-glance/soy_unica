import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney, weekdayMX } from '../lib/format'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'

interface Expense {
  id: number; spent_at: string; category: string; amount_cents: number
  vendor: string | null; note: string | null; file_id: string | null
}

interface Day { date: string; expenses: Expense[]; total_cents: number }
interface Week { from: string; to: string; days: Day[]; total_cents: number }

export function Expenses() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [week, setWeek] = useState<Week | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [fileId, setFileId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState<string | null>(null)
  const [vendor, setVendor] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [cats, list] = await Promise.all([
      get<{ categories: { id: number; name: string }[] }>('/expenses/categories'),
      get<Week>('/expenses'),
    ])
    setCategories(cats.data.categories)
    setWeek(list.data)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <Screen title="Registrar gasto" onBack={() => navigate('/')} backLabel="Regresar al inicio">
      <div className="wrap">
        <p className="lede">Primero la foto del comprobante, luego el monto y el motivo. Tres toques y listo.</p>

        <div className="panel">
          {/* La foto va primero: es la evidencia y evita el gasto sin comprobante. */}
          <div className="field">
            <label>Comprobante</label>
            <PhotoCapture kind="expense" label="Tomar foto" onUploaded={setFileId} />
          </div>

          <div className="two">
            <Field label="Monto">{(id) => <input id={id} type="text" inputMode="decimal" className="money" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />}</Field>
            <Field label="Fecha">{(id) => <input id={id} type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />}</Field>
          </div>

          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend>Categoría</legend>
            <div className="row">
              {categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="two">
            <Field label="Pagado a">{(id) => <input id={id} type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Arrendador, Telcel, costurera..." />}</Field>
            <Field label="Nota">{(id) => <input id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Renta de octubre" />}</Field>
          </div>

          <ActionButton
            disabled={!category || (parseMoney(amount) ?? 0) <= 0}
            done="Gasto guardado"
            onAction={async () => {
              await post('/expenses', {
                amount_cents: parseMoney(amount) ?? 0,
                spent_at: spentAt, category, vendor: vendor || undefined, note: note || undefined,
                file_id: fileId ?? undefined,
              })
              setAmount(''); setVendor(''); setNote(''); setCategory(null); setFileId(null)
              await load()
              setToast('Gasto guardado. Aparecerá en el reporte de la semana.')
              window.setTimeout(() => setToast(null), 4000)
            }}
          >
            Guardar gasto
          </ActionButton>
        </div>

        {/*
          La semana corriente, de lunes a domingo. Cada día trae su subtotal y
          arriba va el total de la semana: así se ve de un vistazo en qué día se
          fue el dinero, sin sumar a mano.
        */}
        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-3)' }}>
            Gastos de la semana · <span className="mono">{money(week?.total_cents ?? 0)}</span>
          </h3>
          {week && (
            <p className="muted" style={{ margin: '0 0 var(--space-9)' }}>
              Del {dateMX(week.from)} al {dateMX(week.to)}
            </p>
          )}

          {week?.total_cents === 0 && <p className="muted">Todavía no hay gastos registrados esta semana.</p>}

          {week?.days.filter((d) => d.expenses.length > 0).map((d) => (
            <section key={d.date} style={{ marginBottom: 'var(--space-11)' }}>
              <div className="day-head">
                <span>{weekdayMX(d.date)}</span>
                <span className="mono">{money(d.total_cents)}</span>
              </div>
              <div className="hist">
                {d.expenses.map((e) => (
                  <div key={e.id}>
                    <span>
                      {e.category}{e.vendor && ` · ${e.vendor}`}{e.note && ` · ${e.note}`}
                      {e.file_id && (
                        <> <a className="muted" href={`/api/files/${e.file_id}`} target="_blank" rel="noopener noreferrer">ver comprobante</a></>
                      )}
                    </span>
                    <span className="mono">{money(e.amount_cents)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Screen>
  )
}
