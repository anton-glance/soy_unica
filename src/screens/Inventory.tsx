import { useCallback, useEffect, useState } from 'react'
import { del, get, patch, post, put } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { GownArt } from '../components/GownArt'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { Dialog } from '../components/Dialog'
import { PhotoSet, type Shot } from '../components/PhotoSet'

interface Item {
  id: number; code: string; name: string; brand: string | null; size: string | null
  cut: string | null; color: string | null; kind: 'dress' | 'accessory'
  acquisition: 'unidad' | 'pedido'; condition: string; status: string
  cost_cents?: number; price_cents: number; location: string | null; notes: string | null
  intake_date: string | null; contract_id: number | null
  tailoring_done_at: string | null; ready_notified_at: string | null; delivered_at: string | null
  needs_review: number; review_fields: string | null
}

/** What the record sheet calls each field the importer left empty. */
const FALTA: Record<string, string> = {
  price: 'precio', code: 'código', size: 'talla', cost: 'costo', condition: 'condición',
}

function missingOf(item: Item): Set<string> {
  return new Set((item.review_fields ?? '').split(',').filter(Boolean))
}

/** These have a column of their own in the table, marked there instead. */
const HAS_COLUMN = new Set(['size', 'price', 'cost'])

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
  const navigate = useNavigate()
  const isOwner = me?.role === 'owner'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [sort, setSort] = useState<string>('code')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [review, setReview] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [stale, setStale] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q, status, kind, sort, dir })
    if (review) params.set('review', '1')
    try {
      const { data, stale: fromCache } = await get<{
        items: Item[]; counts: { status: string; n: number }[]; review_count: number
      }>(`/items?${params}`)
      setItems(data.items)
      setCounts(data.counts)
      setReviewCount(data.review_count ?? 0)
      setStale(fromCache)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.')
    }
  }, [q, status, kind, sort, dir, review])

  useEffect(() => { void load() }, [load])

  const total = counts.reduce((a, c) => a + c.n, 0)

  function say(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4000)
  }

  return (
    // El título vive en la barra de arriba y en ningún otro lado.
    <Screen title="Inventario" onBack={() => navigate('/')} backLabel="Regresar al inicio">
      <div className="wrap">
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
          {reviewCount > 0 && (
            <button type="button" className="chip chip--sm" aria-pressed={review} onClick={() => setReview(!review)}>
              Por verificar ({reviewCount})
            </button>
          )}
          <button type="button" className="chip chip--sm" aria-pressed={status === '' && !review} onClick={() => { setStatus(''); setReview(false) }}>
            Todos ({total})
          </button>
          {counts.map((c) => (
            <button key={c.status} type="button" className="chip chip--sm" aria-pressed={status === c.status} onClick={() => setStatus(c.status)}>
              {ST[c.status]?.[0] ?? c.status} ({c.n})
            </button>
          ))}
        </div>

        {review && (
          <p className="lede">
            Estos entraron del catálogo sin algún dato. Ábrelos y completa lo que traen marcado como «falta».
            Un vestido sin precio no se puede elegir en una sesión.
          </p>
        )}

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
              {items.map((item) => {
                const missing = missingOf(item)
                return (
                <tr key={item.id} className={item.needs_review ? 'rev' : undefined} onClick={() => setOpen(item)}>
                  <td className="mono">{item.code}</td>
                  <td className="model">
                    {item.name}
                    {item.kind === 'accessory' && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}> accesorio</span>
                    )}
                    {[...missing].some((f) => !HAS_COLUMN.has(f)) && (
                      <span className="falta" style={{ display: 'block' }}>
                        falta {[...missing].filter((f) => !HAS_COLUMN.has(f)).map((f) => FALTA[f] ?? f).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>{item.brand ?? '—'}</td>
                  <td>{missing.has('size') ? <span className="falta">falta</span> : (item.size ?? '—')}</td>
                  <td className="mono">{missing.has('price') ? <span className="falta">falta</span> : money(item.price_cents)}</td>
                  <td><span className={`bdg ${ST[item.status]?.[1] ?? 'mute'}`}>{ST[item.status]?.[0] ?? item.status}</span></td>
                  <td className="mono">{dateMX(item.intake_date)}</td>
                  {isOwner && (
                    <td className="mono">{missing.has('cost') ? <span className="falta">falta</span> : money(item.cost_cents ?? 0)}</td>
                  )}
                </tr>
                )
              })}
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
    </Screen>
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

  const missing = missingOf(item)

  // La dueña edita la ficha completa; la vendedora sólo la lee.
  const [form, setForm] = useState({
    code: item.code,
    name: item.name, brand: item.brand ?? '', size: item.size ?? '', cut: item.cut ?? '',
    color: item.color ?? '', location: item.location ?? '', notes: item.notes ?? '',
    condition: item.condition, price: String(item.price_cents / 100), cost: String((item.cost_cents ?? 0) / 100),
    intake_date: item.intake_date ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })
  const [confirming, setConfirming] = useState(false)

  // Las fotos del artículo, si ya tiene. La dueña las cambia aquí mismo.
  const [photos, setPhotos] = useState<Shot[]>([])
  const [primary, setPrimary] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      const { data } = await get<{ photos: { id: string; is_primary: number }[] }>(`/items/${item.id}`)
      setPhotos(data.photos.map((p) => ({ file_id: p.id, url: `/api/files/${p.id}` })))
      setPrimary(data.photos.find((p) => p.is_primary)?.id ?? data.photos[0]?.id ?? null)
    })()
  }, [item.id])

  return (
    <Dialog title={item.name} onCancel={onClose} closeLabel="Cerrar la ficha" full big>
      <p className="muted" style={{ textAlign: 'center', margin: '0 0 var(--space-8)' }}>
        código {item.code} · {item.kind === 'dress' ? 'vestido' : 'accesorio'} · {item.acquisition === 'pedido' ? 'por pedido' : 'de unidad'}
      </p>

      {item.needs_review === 1 && (
        <p className="pill pill--brass" style={{ display: 'block', textAlign: 'center', margin: '0 0 var(--space-10)' }}>
          Por verificar: falta {[...missing].map((f) => FALTA[f] ?? f).join(', ')}.
          {missing.has('price') && ' Sin precio no se puede elegir en una sesión.'}
        </p>
      )}

      <div className="inv-grid">
          <div>
            {primary
              ? <img src={`/api/files/${primary}`} alt="" className="art" />
              : <GownArt seed={item.id} className="art" />}
            {isOwner ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                <label>Fotos <span className="muted">· hasta 5</span></label>
                <PhotoSet
                  photos={photos}
                  primary={primary}
                  onChange={async (next, mark) => {
                    setPhotos(next); setPrimary(mark)
                    await put(`/items/${item.id}/photos`, {
                      photos: next.map((p) => ({ file_id: p.file_id, is_primary: p.file_id === mark })),
                    })
                  }}
                />
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 'var(--text-label)', margin: 'var(--space-6) 0 0' }}>
                Así la reconoce en el rack.
              </p>
            )}
          </div>
          <div>
            {isOwner ? (
              <>
                <div className="f3">
                  <Field label="Código" marked={missing.has('code')} hint={missing.has('code') ? 'El catálogo no traía código. Pon el tuyo: p139, A12, s14.' : undefined}>
                    {(id) => <input id={id} type="text" value={form.code} onChange={set('code')} />}
                  </Field>
                  <Field label="Modelo">{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} />}</Field>
                  <Field label="Marca">{(id) => <input id={id} type="text" value={form.brand} onChange={set('brand')} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Talla" marked={missing.has('size')}>{(id) => <input id={id} type="text" value={form.size} onChange={set('size')} />}</Field>
                  <Field label="Corte">{(id) => <input id={id} type="text" value={form.cut} onChange={set('cut')} />}</Field>
                  <Field label="Color">{(id) => <input id={id} type="text" value={form.color} onChange={set('color')} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Precio de venta" marked={missing.has('price')}>{(id) => <input id={id} type="text" inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
                  <Field label="Costo" marked={missing.has('cost')}>{(id) => <input id={id} type="text" inputMode="decimal" value={form.cost} onChange={set('cost')} />}</Field>
                  <Field label="Estado">{(id) => <input id={id} type="text" value={ST[item.status]?.[0] ?? item.status} disabled style={{ opacity: .6 }} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Condición" marked={missing.has('condition')}>{(id) => (
                    <select id={id} value={form.condition} onChange={set('condition')}>
                      <option value="nuevo">Nuevo</option>
                      <option value="muestra">Muestra</option>
                      <option value="exhibicion">Exhibición</option>
                      <option value="liquidacion">Liquidación</option>
                    </select>
                  )}</Field>
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
                <Info label="Talla" value={missing.has('size') ? 'falta' : (item.size ?? '—')} />
                <Info label="Color" value={item.color ?? '—'} />
                <Info label="Condición" value={item.condition} />
                <Info label="Precio de venta" value={missing.has('price') ? 'falta' : money(item.price_cents)} />
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
                      code: form.code,
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
    </Dialog>
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
  const [photos, setPhotos] = useState<Shot[]>([])
  const [primary, setPrimary] = useState<string | null>(null)

  return (
    <Dialog title="Nuevo artículo" onCancel={onClose} closeLabel="Cerrar sin guardar" full big>
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

      {/*
        Las fotos: hasta cinco, una principal. Se comprimen en la tableta con el
        mismo camino que las demás fotos del sistema y se amarran al artículo
        en cuanto queda dado de alta.
      */}
      <div className="field">
        <label>Fotos <span className="muted">· hasta 5, la principal es la que se ve en el kiosco</span></label>
        <PhotoSet photos={photos} primary={primary} onChange={(next, mark) => { setPhotos(next); setPrimary(mark) }} />
      </div>

      <Field label="Notas">{(id) => <textarea id={id} value={form.notes} onChange={set('notes')} placeholder="Con quién está, pruebas pendientes, detalles de la tela" />}</Field>

      <div className="row" style={{ marginTop: 'var(--space-2)' }}>
        <ActionButton
          onAction={async () => {
            const { id } = await post<{ id: number }>('/items', {
              ...form,
              price_cents: parseMoney(form.price) ?? 0,
              cost_cents: isOwner ? (parseMoney(form.cost) ?? 0) : undefined,
            })
            if (photos.length > 0) {
              await put(`/items/${id}/photos`, {
                photos: photos.map((p) => ({ file_id: p.file_id, is_primary: p.file_id === primary })),
              })
            }
            await onAdded(form.name)
          }}
        >
          Agregar al inventario
        </ActionButton>
      </div>
    </Dialog>
  )
}
