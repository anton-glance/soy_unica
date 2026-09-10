import { useCallback, useEffect, useState } from 'react'
import { del, get, patch, post } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { ActionButton } from '../components/ActionButton'
import { GownArt } from '../components/GownArt'
import { Field } from '../components/Field'

interface Item {
  id: number; code: string; name: string; brand: string | null; size: string | null
  cut: string | null; color: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; condition: string; status: string
  cost_cents?: number; price_cents: number; location: string | null; notes: string | null
  intake_date: string | null; contract_id: number | null
  tailoring_done_at: string | null; ready_notified_at: string | null; delivered_at: string | null
}

/** Etiqueta y color de cada estado, como en el prototipo. */
const ST: Record<string, [string, string]> = {
  available: ['Disponible', 'ok'], watching: ['Viendo ahora', 'warn'], reserved: ['Reservado', 'warn'],
  tailoring: ['En costura', 'clay'], tailored: ['Costura lista', 'clay'], ready: ['Listo para entrega', 'ok'],
  sold: ['Vendido', 'mute'], retired: ['Retirado', 'mute'],
}

const COLS = [
  ['code', 'Código'], ['name', 'Modelo'], ['brand', 'Marca'],
  ['size', 'Talla'], ['price', 'Precio'], ['status', 'Estado'], ['intake', 'Ingreso'],
] as const

export function Inventory() {
  const { me } = useSession()
  const isOwner = me?.role === 'owner'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [sort, setSort] = useState<string>('code')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([])
  const [stale, setStale] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q, status, kind, sort, dir })
    try {
      const { data, stale: fromCache } = await get<{ items: Item[]; counts: { status: string; n: number }[] }>(`/items?${params}`)
      setItems(data.items)
      setCounts(data.counts)
      setStale(fromCache)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.')
    }
  }, [q, status, kind, sort, dir])

  useEffect(() => { void load() }, [load])

  const total = counts.reduce((a, c) => a + c.n, 0)

  function say(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4000)
  }

  return (
    <>
      <div className="wrap">
        <h2>Inventario</h2>
        <p className="lede">
          Vestidos y accesorios de esta sucursal. Se busca por código, modelo, marca o corte.
          Toca cualquier renglón para ver la ficha completa.
        </p>

        {stale && <p className="pill pill--brass" style={{ marginBottom: 'var(--space-8)' }}>Sin conexión: esto es lo último que se alcanzó a guardar en la tableta.</p>}
        {error && <p className="err">{error}</p>}

        <div className="inv-bar">
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="iq">Buscar</label>
            <input id="iq" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="p139, Madelyn, Lanesta, sirena" autoComplete="off" />
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="ikind">Tipo</label>
            <select id="ikind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Vestidos y accesorios</option>
              <option value="dress">Solo vestidos</option>
              <option value="accessory">Solo accesorios</option>
            </select>
          </div>
          <button type="button" className="btn-main" onClick={() => setAdding(true)}>Agregar al inventario</button>
        </div>

        <div className="row" style={{ marginBottom: 'var(--space-9)' }}>
          <button type="button" className="chip chip--sm" aria-pressed={status === ''} onClick={() => setStatus('')}>
            Todos ({total})
          </button>
          {counts.map((c) => (
            <button key={c.status} type="button" className="chip chip--sm" aria-pressed={status === c.status} onClick={() => setStatus(c.status)}>
              {ST[c.status]?.[0] ?? c.status} ({c.n})
            </button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 'var(--text-label)', margin: '0 0 var(--space-5)' }}>
          {items.length} de {total} artículos{isOwner ? '' : ' · los vendidos solo los ve la dueña'}
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {COLS.map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => {
                      if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
                      else { setSort(key); setDir('asc') }
                    }}
                  >
                    {label}{sort === key && <span className="ar"> {dir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
                {isOwner && <th>Costo</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setOpen(item)}>
                  <td className="mono">{item.code}</td>
                  <td className="model">
                    {item.name}
                    {item.kind === 'accessory' && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}> accesorio</span>
                    )}
                  </td>
                  <td>{item.brand ?? '—'}</td>
                  <td>{item.size ?? '—'}</td>
                  <td className="mono">{money(item.price_cents)}</td>
                  <td><span className={`bdg ${ST[item.status]?.[1] ?? 'mute'}`}>{ST[item.status]?.[0] ?? item.status}</span></td>
                  <td className="mono">{dateMX(item.intake_date)}</td>
                  {isOwner && <td className="mono">{money(item.cost_cents ?? 0)}</td>}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 8 : 7} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>
                    Nada coincide con esa búsqueda. Borra el filtro o agrega el artículo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {open && (
        <RecordSheet
          item={open}
          isOwner={isOwner}
          onClose={() => setOpen(null)}
          onChanged={async (message) => { await load(); setOpen(null); say(message) }}
        />
      )}
      {adding && (
        <AddItem
          isOwner={isOwner}
          onClose={() => setAdding(false)}
          onAdded={async (name) => { await load(); setAdding(false); say(`${name} agregado al inventario.`) }}
        />
      )}
    </>
  )
}

function RecordSheet({ item, isOwner, onClose, onChanged }: {
  item: Item; isOwner: boolean; onClose: () => void; onChanged: (message: string) => Promise<void>
}) {
  const transitions = [
    { action: 'tailoring/start', label: 'Entró a costura' },
    { action: 'tailoring/done', label: 'Terminó la costura' },
    { action: 'notify-ready', label: 'Se le avisó a la novia' },
    { action: 'deliver', label: 'Se entregó' },
  ]

  // La dueña edita la ficha completa; la vendedora sólo la lee.
  const [form, setForm] = useState({
    name: item.name, brand: item.brand ?? '', size: item.size ?? '', cut: item.cut ?? '',
    color: item.color ?? '', location: item.location ?? '', notes: item.notes ?? '',
    condition: item.condition, price: String(item.price_cents / 100), cost: String((item.cost_cents ?? 0) / 100),
    intake_date: item.intake_date ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="veil full" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet">
        <div className="inv-head">
          <div>
            <h2>{item.name}</h2>
            <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>
              código {item.code} · {item.kind === 'dress' ? 'vestido' : 'accesorio'} · {item.acquisition === 'pedido' ? 'por pedido' : 'de unidad'}
            </p>
          </div>
          <button type="button" className="btn-quiet" onClick={onClose}>Cerrar</button>
        </div>

        <div className="inv-grid">
          <div>
            <GownArt seed={item.id} className="art" />
            <p className="muted" style={{ fontSize: 'var(--text-label)', margin: 'var(--space-6) 0 0' }}>
              Así la reconoce en el rack.
            </p>
          </div>
          <div>
            {isOwner ? (
              <>
                <div className="f3">
                  <Field label="Modelo">{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} />}</Field>
                  <Field label="Marca">{(id) => <input id={id} type="text" value={form.brand} onChange={set('brand')} />}</Field>
                  <Field label="Estado">{(id) => <input id={id} type="text" value={ST[item.status]?.[0] ?? item.status} disabled style={{ opacity: .6 }} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Talla">{(id) => <input id={id} type="text" value={form.size} onChange={set('size')} />}</Field>
                  <Field label="Corte">{(id) => <input id={id} type="text" value={form.cut} onChange={set('cut')} />}</Field>
                  <Field label="Color">{(id) => <input id={id} type="text" value={form.color} onChange={set('color')} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Precio de venta">{(id) => <input id={id} type="text" inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
                  <Field label="Costo">{(id) => <input id={id} type="text" inputMode="decimal" value={form.cost} onChange={set('cost')} />}</Field>
                  <Field label="Condición">{(id) => (
                    <select id={id} value={form.condition} onChange={set('condition')}>
                      <option value="nuevo">Nuevo</option>
                      <option value="muestra">Muestra</option>
                      <option value="exhibicion">Exhibición</option>
                      <option value="liquidacion">Liquidación</option>
                    </select>
                  )}</Field>
                </div>
                <div className="f3">
                  <Field label="Fecha de ingreso">{(id) => <input id={id} type="date" value={form.intake_date} onChange={set('intake_date')} />}</Field>
                  <Field label="Ubicación">{(id) => <input id={id} type="text" value={form.location} onChange={set('location')} />}</Field>
                </div>
                <Field label="Notas">
                  {(id) => <textarea id={id} value={form.notes} onChange={set('notes')} placeholder="Con quién está, pruebas pendientes, detalles de la tela" />}
                </Field>
              </>
            ) : (
              <div className="f3">
                <Info label="Estado" value={ST[item.status]?.[0] ?? item.status} />
                <Info label="Marca" value={item.brand ?? '—'} />
                <Info label="Corte" value={item.cut ?? '—'} />
                <Info label="Talla" value={item.size ?? '—'} />
                <Info label="Color" value={item.color ?? '—'} />
                <Info label="Condición" value={item.condition} />
                <Info label="Precio de venta" value={money(item.price_cents)} />
                <Info label="Ubicación" value={item.location ?? '—'} />
                <Info label="Fecha de ingreso" value={dateMX(item.intake_date)} />
              </div>
            )}

            {!isOwner && item.notes && <p className="lede">{item.notes}</p>}

            {item.acquisition === 'pedido' ? (
              <p className="state">Los modelos por pedido no cambian de estado: se mandan a hacer.</p>
            ) : (
              <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                {transitions.map((t) => (
                  <ActionButton
                    key={t.action}
                    className="btn-quiet"
                    onAction={async () => {
                      await post(`/items/${item.id}/${t.action}`)
                      await onChanged(`${item.name}: ${t.label.toLowerCase()}.`)
                    }}
                  >
                    {t.label}
                  </ActionButton>
                ))}
              </div>
            )}

            {isOwner ? (
              <div className="row" style={{ marginTop: 'var(--space-11)' }}>
                <ActionButton
                  done="Guardado"
                  onAction={async () => {
                    await patch(`/items/${item.id}`, {
                      name: form.name, brand: form.brand, size: form.size, cut: form.cut,
                      color: form.color, location: form.location, notes: form.notes,
                      condition: form.condition, intake_date: form.intake_date || undefined,
                      price_cents: parseMoney(form.price) ?? 0,
                      cost_cents: parseMoney(form.cost) ?? 0,
                    })
                    await onChanged(`${form.name} guardado como ${(ST[item.status]?.[0] ?? item.status).toLowerCase()}.`)
                  }}
                >
                  Guardar cambios
                </ActionButton>
                {/* Igual que en el prototipo: se toca dos veces para confirmar. */}
                <ActionButton
                  className="danger"
                  onAction={async () => {
                    if (!confirming) { setConfirming(true); return }
                    await del(`/items/${item.id}`)
                    await onChanged(`${item.name} eliminado. Queda registrado quién lo borró y cuándo.`)
                  }}
                >
                  {confirming ? 'Toca otra vez para confirmar' : 'Eliminar del inventario'}
                </ActionButton>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 'var(--text-label)', marginTop: 'var(--space-9)' }}>
                Solo la dueña puede editar o eliminar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Renglón de sólo lectura, para la vendedora. */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <p style={{ fontSize: 'var(--text-lg)' }}>{value}</p>
    </div>
  )
}

function AddItem({ isOwner, onClose, onAdded }: { isOwner: boolean; onClose: () => void; onAdded: (name: string) => Promise<void> }) {
  const [form, setForm] = useState({
    code: '', name: '', brand: '', size: '', cut: '', color: '', location: '', notes: '',
    kind: 'dress', acquisition: 'unidad', condition: 'nuevo', price: '', cost: '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="veil full" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet">
        <div className="inv-head">
          <h2>Nuevo artículo</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>Cerrar</button>
        </div>

        <div className="f3">
          <Field label="Modelo">{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} placeholder="Madelyn" />}</Field>
          <Field label="Marca">{(id) => <input id={id} type="text" value={form.brand} onChange={set('brand')} placeholder="Lanesta" />}</Field>
          <Field label="Tipo">{(id) => (
            <select id={id} value={form.kind} onChange={set('kind')}>
              <option value="dress">Vestido</option>
              <option value="accessory">Accesorio</option>
            </select>
          )}</Field>
        </div>
        <div className="f3">
          <Field label="Talla">{(id) => <input id={id} type="text" value={form.size} onChange={set('size')} placeholder="M" />}</Field>
          <Field label="Corte">{(id) => <input id={id} type="text" value={form.cut} onChange={set('cut')} placeholder="Princesa" />}</Field>
          <Field label="Color">{(id) => <input id={id} type="text" value={form.color} onChange={set('color')} placeholder="Marfil" />}</Field>
        </div>
        <div className="f3">
          <Field label="Código" hint="Tu nomenclatura: p139, s14, A12, mantilla 039">
            {(id) => <input id={id} type="text" value={form.code} onChange={set('code')} placeholder="p139" />}
          </Field>
          <Field label="Precio de venta">{(id) => <input id={id} type="text" inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
          {isOwner
            ? <Field label="Costo">{(id) => <input id={id} type="text" inputMode="decimal" value={form.cost} onChange={set('cost')} />}</Field>
            : <Field label="Costo">{(id) => <input id={id} type="text" value="Solo la dueña" disabled style={{ opacity: .5 }} />}</Field>}
        </div>
        <div className="f3">
          <Field label="Adquisición" hint="Por pedido = se manda a hacer, nunca se aparta">
            {(id) => (
              <select id={id} value={form.acquisition} onChange={set('acquisition')}>
                <option value="unidad">De unidad</option>
                <option value="pedido">Por pedido</option>
              </select>
            )}
          </Field>
          <Field label="Condición">{(id) => (
            <select id={id} value={form.condition} onChange={set('condition')}>
              <option value="nuevo">Nuevo</option>
              <option value="muestra">Muestra</option>
              <option value="exhibicion">Exhibición</option>
              <option value="liquidacion">Liquidación</option>
            </select>
          )}</Field>
          <Field label="Ubicación">{(id) => <input id={id} type="text" value={form.location} onChange={set('location')} placeholder="Pasillo A" />}</Field>
        </div>
        <Field label="Notas">{(id) => <textarea id={id} value={form.notes} onChange={set('notes')} placeholder="Con quién está, pruebas pendientes, detalles de la tela" />}</Field>

        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
          <ActionButton
            onAction={async () => {
              await post('/items', {
                ...form,
                price_cents: parseMoney(form.price) ?? 0,
                cost_cents: isOwner ? (parseMoney(form.cost) ?? 0) : undefined,
              })
              await onAdded(form.name)
            }}
          >
            Agregar al inventario
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
