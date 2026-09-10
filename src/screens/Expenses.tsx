import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Field } from '../components/Field'

interface Expense {
  id: number; spent_at: string; category: string; amount_cents: number
  vendor: string | null; note: string | null; file_id: string | null
}

export function Expenses() {
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [today, setToday] = useState<{ expenses: Expense[]; total_cents: number; date: string } | null>(null)
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
      get<{ expenses: Expense[]; total_cents: number; date: string }>('/expenses'),
    ])
    setCategories(cats.data.categories)
    setToday(list.data)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <>
      <div className="wrap">
        <h2>Registrar gasto</h2>
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
              setToast('Gasto guardado. Aparecerá en el reporte de hoy.')
              window.setTimeout(() => setToast(null), 4000)
            }}
          >
            Guardar gasto
          </ActionButton>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>
            Gastos de hoy · <span className="mono">{money(today?.total_cents ?? 0)}</span>
          </h3>
          <div className="hist">
            {today?.expenses.length === 0 && <div><span>Todavía no hay gastos registrados hoy.</span></div>}
            {today?.expenses.map((e) => (
              <div key={e.id}>
                <span>
                  {e.category}{e.vendor && ` · ${e.vendor}`}{e.note && ` · ${e.note}`}
                  {e.file_id && (
                    <> <a className="muted" href={`/api/files/${e.file_id}`} target="_blank" rel="noopener noreferrer">ver comprobante</a></>
                  )}
                  <br /><span className="muted">{dateMX(e.spent_at)}</span>
                </span>
                <span className="mono">{money(e.amount_cents)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
