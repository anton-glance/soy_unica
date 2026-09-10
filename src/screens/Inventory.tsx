import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { ActionButton } from '../components/ActionButton'
import { Dialog } from '../components/Dialog'
import { Field, Select, TextArea, TextInput } from '../components/Field'

interface Item {
  id: number; code: string; name: string; brand: string | null; size: string | null
  cut: string | null; color: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; condition: string; status: string
  cost_cents?: number; price_cents: number; location: string | null; notes: string | null
  intake_date: string | null; contract_id: number | null
  tailoring_done_at: string | null; ready_notified_at: string | null; delivered_at: string | null
}

const STATUS_ES: Record<string, string> = {
  available: 'Disponible', watching: 'En prueba', reserved: 'Apartado', tailoring: 'En costura',
  tailored: 'Costura lista', ready: 'Listo para entrega', sold: 'Entregado', retired: 'Retirado',
}

const COLUMNS = [
  { key: 'code', label: 'Código' },
  { key: 'name', label: 'Modelo' },
  { key: 'brand', label: 'Marca' },
  { key: 'size', label: 'Talla' },
  { key: 'price', label: 'Precio' },
  { key: 'status', label: 'Estado' },
] as const

export function Inventory() {
  const { me } = useSession()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [acquisition, setAcquisition] = useState('')
  const [condition, setCondition] = useState('')
  const [sort, setSort] = useState<string>('code')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([])
  const [stale, setStale] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q, status, kind, acquisition, condition, sort, dir })
    try {
      const { data, stale: fromCache } = await get<{ items: Item[]; counts: { status: string; n: number }[] }>(`/items?${params}`)
      setItems(data.items)
      setCounts(data.counts)
      setStale(fromCache)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.')
    }
  }, [q, status, kind, acquisition, condition, sort, dir])

  useEffect(() => { void load() }, [load])

  return (
    <div className="page stack">
      <div className="row row--between row--wrap">
        <h1>Inventario</h1>
        <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>Agregar artículo</button>
      </div>

      {stale && <p className="notice notice--warn">Sin conexión: esto es lo último que se alcanzó a guardar en la tableta.</p>}
      {error && <p className="notice notice--error">{error}</p>}

      <TextInput
        placeholder="Busca por código, modelo, marca o corte"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar en el inventario"
      />

      <div className="row row--wrap">
        <button type="button" className="chip" aria-pressed={status === ''} onClick={() => setStatus('')}>
          Todos ({counts.reduce((a, c) => a + c.n, 0)})
        </button>
        {counts.map((c) => (
          <button key={c.status} type="button" className="chip" aria-pressed={status === c.status} onClick={() => setStatus(c.status)}>
            {STATUS_ES[c.status] ?? c.status} ({c.n})
          </button>
        ))}
      </div>

      <div className="row row--wrap">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo" style={{ width: 'auto' }}>
          <option value="">Vestidos y accesorios</option>
          <option value="dress">Sólo vestidos</option>
          <option value="accessory">Sólo accesorios</option>
        </Select>
        <Select value={acquisition} onChange={(e) => setAcquisition(e.target.value)} aria-label="Adquisición" style={{ width: 'auto' }}>
          <option value="">Toda adquisición</option>
          <option value="unidad">De unidad</option>
          <option value="pedido">Por pedido</option>
        </Select>
        <Select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Condición" style={{ width: 'auto' }}>
          <option value="">Toda condición</option>
          <option value="nuevo">Nuevo</option>
          <option value="muestra">Muestra</option>
          <option value="exhibicion">Exhibición</option>
          <option value="liquidacion">Liquidación</option>
        </Select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} style={{ textAlign: 'left', padding: 'var(--space-3)', borderBottom: '1px solid var(--color-line)' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ minHeight: 'auto', padding: 0 }}
                    onClick={() => {
                      if (sort === col.key) setDir(dir === 'asc' ? 'desc' : 'asc')
                      else { setSort(col.key); setDir('asc') }
                    }}
                  >
                    {col.label}{sort === col.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} onClick={() => setOpen(item)} style={{ cursor: 'pointer' }}>
                <td style={cell} className="numeric">{item.code}</td>
                <td style={cell}>{item.name}</td>
                <td style={cell}>{item.brand ?? '—'}</td>
                <td style={cell}>{item.size ?? '—'}</td>
                <td style={cell} className="numeric">{money(item.price_cents)}</td>
                <td style={cell}>{STATUS_ES[item.status] ?? item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted" style={{ padding: 'var(--space-5)' }}>No hay artículos con esos filtros.</p>}
      </div>

      {open && <RecordSheet item={open} isOwner={me?.role === 'owner'} onClose={() => setOpen(null)} onChanged={async () => { await load(); setOpen(null) }} />}
      {adding && <AddItem isOwner={me?.role === 'owner'} onClose={() => setAdding(false)} onAdded={async () => { await load(); setAdding(false) }} />}
    </div>
  )
}

const cell: React.CSSProperties = { padding: 'var(--space-3)', borderBottom: '1px solid var(--color-line)' }

function RecordSheet({ item, isOwner, onClose, onChanged }: { item: Item; isOwner: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const transitions: { action: string; label: string }[] = [
    { action: 'tailoring/start', label: 'Entró a costura' },
    { action: 'tailoring/done', label: 'Terminó la costura' },
    { action: 'notify-ready', label: 'Se le avisó a la novia' },
    { action: 'deliver', label: 'Se entregó' },
  ]

  return (
    <Dialog title={`${item.name} · ${item.code}`} onCancel={onClose} cancelLabel="Cerrar" actions={null}>
      <div className="stack">
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-2) var(--space-4)', margin: 0 }}>
          <dt className="muted">Estado</dt><dd style={{ margin: 0 }}>{STATUS_ES[item.status] ?? item.status}</dd>
          <dt className="muted">Marca</dt><dd style={{ margin: 0 }}>{item.brand ?? '—'}</dd>
          <dt className="muted">Corte</dt><dd style={{ margin: 0 }}>{item.cut ?? '—'}</dd>
          <dt className="muted">Talla</dt><dd style={{ margin: 0 }}>{item.size ?? '—'}</dd>
          <dt className="muted">Color</dt><dd style={{ margin: 0 }}>{item.color ?? '—'}</dd>
          <dt className="muted">Adquisición</dt><dd style={{ margin: 0 }}>{item.acquisition === 'pedido' ? 'Por pedido' : 'De unidad'}</dd>
          <dt className="muted">Condición</dt><dd style={{ margin: 0 }}>{item.condition}</dd>
          <dt className="muted">Precio</dt><dd style={{ margin: 0 }} className="numeric">{money(item.price_cents)}</dd>
          {isOwner && item.cost_cents !== undefined && (
            <><dt className="muted">Costo</dt><dd style={{ margin: 0 }} className="numeric">{money(item.cost_cents)}</dd></>
          )}
          <dt className="muted">Ubicación</dt><dd style={{ margin: 0 }}>{item.location ?? '—'}</dd>
          <dt className="muted">Ingresó</dt><dd style={{ margin: 0 }}>{dateMX(item.intake_date)}</dd>
        </dl>
        {item.notes && <p className="muted">{item.notes}</p>}

        {item.acquisition === 'pedido' ? (
          <p className="notice notice--ok">Los modelos por pedido no cambian de estado: se mandan a hacer.</p>
        ) : (
          <div className="row row--wrap">
            {transitions.map((t) => (
              <ActionButton
                key={t.action}
                className="btn"
                onAction={async () => { await post(`/items/${item.id}/${t.action}`); await onChanged() }}
              >
                {t.label}
              </ActionButton>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function AddItem({ isOwner, onClose, onAdded }: { isOwner: boolean; onClose: () => void; onAdded: () => Promise<void> }) {
  const [form, setForm] = useState({
    code: '', name: '', brand: '', size: '', cut: '', color: '', location: '', notes: '',
    kind: 'dress', acquisition: 'unidad', condition: 'nuevo', price: '', cost: '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Dialog
      title="Agregar artículo"
      onCancel={onClose}
      actions={
        <ActionButton
          onAction={async () => {
            await post('/items', {
              ...form,
              price_cents: parseMoney(form.price) ?? 0,
              cost_cents: isOwner ? (parseMoney(form.cost) ?? 0) : undefined,
            })
            await onAdded()
          }}
        >
          Guardar
        </ActionButton>
      }
    >
      <div className="stack">
        <Field label="Código" hint="Tu nomenclatura: p139, s14, A12, madelyn, mantilla 039">
          <TextInput value={form.code} onChange={set('code')} />
        </Field>
        <Field label="Modelo"><TextInput value={form.name} onChange={set('name')} /></Field>
        <Field label="Marca"><TextInput value={form.brand} onChange={set('brand')} /></Field>
        <div className="row row--wrap">
          <Field label="Talla"><TextInput value={form.size} onChange={set('size')} /></Field>
          <Field label="Corte"><TextInput value={form.cut} onChange={set('cut')} /></Field>
          <Field label="Color"><TextInput value={form.color} onChange={set('color')} /></Field>
        </div>
        <Field label="Tipo">
          <Select value={form.kind} onChange={set('kind')}>
            <option value="dress">Vestido</option>
            <option value="accessory">Accesorio</option>
          </Select>
        </Field>
        <Field label="Adquisición" hint="Por pedido = se manda a hacer, nunca se aparta">
          <Select value={form.acquisition} onChange={set('acquisition')}>
            <option value="unidad">De unidad</option>
            <option value="pedido">Por pedido</option>
          </Select>
        </Field>
        <Field label="Condición">
          <Select value={form.condition} onChange={set('condition')}>
            <option value="nuevo">Nuevo</option>
            <option value="muestra">Muestra</option>
            <option value="exhibicion">Exhibición</option>
            <option value="liquidacion">Liquidación</option>
          </Select>
        </Field>
        <Field label="Precio"><TextInput value={form.price} onChange={set('price')} inputMode="decimal" /></Field>
        {isOwner && <Field label="Costo"><TextInput value={form.cost} onChange={set('cost')} inputMode="decimal" /></Field>}
        <Field label="Ubicación"><TextInput value={form.location} onChange={set('location')} /></Field>
        <Field label="Notas"><TextArea value={form.notes} onChange={set('notes')} /></Field>
      </div>
    </Dialog>
  )
}
