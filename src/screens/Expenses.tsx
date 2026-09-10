import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { ActionButton } from '../components/ActionButton'
import { PhotoCapture } from '../components/PhotoCapture'
import { Field, TextArea, TextInput } from '../components/Field'

interface Expense {
  id: number; spent_at: string; category: string; amount_cents: number
  vendor: string | null; note: string | null; file_id: string | null
}

export function Expenses() {
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [today, setToday] = useState<{ expenses: Expense[]; total_cents: number; date: string } | null>(null)

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
    <div className="page stack">
      <h1>Registrar gasto</h1>

      <section className="card stack">
        {/* Primero la foto: es la evidencia y evita que el gasto se quede sin comprobante. */}
        <h2>1. El comprobante</h2>
        <PhotoCapture kind="expense" label="Tomar la foto del ticket" onUploaded={setFileId} />

        <h2>2. El gasto</h2>
        <Field label="Monto"><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Fecha"><TextInput type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} /></Field>

        <fieldset style={{ border: 0, padding: 0, margin: '0 0 var(--space-4)' }}>
          <legend className="field__label">Categoría</legend>
          <div className="row row--wrap">
            {categories.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Se le pagó a"><TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
        <Field label="Nota"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        <ActionButton
          disabled={!category || (parseMoney(amount) ?? 0) <= 0}
          onAction={async () => {
            await post('/expenses', {
              amount_cents: parseMoney(amount) ?? 0,
              spent_at: spentAt, category, vendor: vendor || undefined, note: note || undefined,
              file_id: fileId ?? undefined,
            })
            setAmount(''); setVendor(''); setNote(''); setCategory(null); setFileId(null)
            await load()
          }}
          done="Gasto registrado"
        >
          Guardar el gasto
        </ActionButton>
      </section>

      <section className="card stack">
        <div className="row row--between">
          <h2>Gastos de hoy</h2>
          <strong className="numeric" style={{ fontSize: 'var(--text-xl)' }}>{money(today?.total_cents ?? 0)}</strong>
        </div>
        {today?.expenses.length === 0 && <p className="muted">Todavía no hay gastos hoy.</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {today?.expenses.map((e) => (
              <tr key={e.id}>
                <td style={{ padding: 'var(--space-2) 0' }}>
                  <strong>{e.category}</strong>
                  {e.vendor && <> · {e.vendor}</>}
                  {e.note && <><br /><span className="muted">{e.note}</span></>}
                  <br /><span className="muted">{dateMX(e.spent_at)}</span>
                </td>
                <td className="numeric" style={{ textAlign: 'right' }}>
                  {money(e.amount_cents)}
                  {e.file_id && <><br /><a className="muted" href={`/api/files/${e.file_id}`} target="_blank" rel="noopener noreferrer">ver ticket</a></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
