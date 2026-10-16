import { useCallback, useEffect, useState } from 'react'
import { ApiError, del, get, patch, post, put } from '../lib/api'
import { dateMX, money, parseMoney } from '../lib/format'
import { useSession } from '../lib/session'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'
import { Dialog } from '../components/Dialog'
import { PhotoSet, type Shot } from '../components/PhotoSet'
import { PhotoGallery } from '../components/PhotoGallery'

type ItemKind = 'dress' | 'mantilla' | 'tiara' | 'cinto' | 'otros'

interface Item {
  id: number; code: string; name: string; brand: string | null; size: string | null
  cut: string | null; color: string | null; kind: ItemKind
  acquisition: 'unidad' | 'pedido'; condition: string; status: string
  cost_cents?: number; price_cents: number; quantity: number | null; location: string | null; notes: string | null
  intake_date: string | null; contract_id: number | null
  tailoring_done_at: string | null; ready_notified_at: string | null; delivered_at: string | null
  needs_review: number; review_fields: string | null; photos: string[]; available: boolean
}

/** What the record sheet calls each field the importer left empty. */
const FALTA: Record<string, string> = {
  price: 'precio', code: 'código', name: 'modelo', brand: 'marca', photo: 'foto',
}

/** Vestido, o cuál de los cuatro tipos que no son vestido. */
const KIND_LABEL: Record<ItemKind, string> = {
  dress: 'Vestido', mantilla: 'Mantilla', tiara: 'Tiara', cinto: 'Cinto', otros: 'Otro',
}

function missingOf(item: Item): Set<string> {
  return new Set((item.review_fields ?? '').split(',').filter(Boolean))
}

/** These have a column of their own in the table, marked there instead. */
const HAS_COLUMN = new Set(['price', 'brand', 'photo'])

/** Etiqueta y color de cada estado, como en el prototipo. */
const ST: Record<string, [string, string]> = {
  available: ['Disponible', 'ok'], watching: ['Viendo ahora', 'warn'], reserved: ['Reservado', 'warn'],
  tailoring: ['En costura', 'clay'], tailored: ['Costura lista', 'clay'], ready: ['Listo para entrega', 'ok'],
  sold: ['Vendido', 'mute'], retired: ['Retirado', 'mute'],
}

const COLS = [
  ['photo', 'Fotos'], ['code', 'Código'], ['name', 'Modelo'], ['kind', 'Tipo'], ['brand', 'Marca'],
  ['size', 'Talla'], ['price', 'Precio'], ['quantity', 'Cant.'], ['status', 'Estado'], ['intake', 'Ingreso'],
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
  const [unavailable, setUnavailable] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [unavailableCount, setUnavailableCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [stale, setStale] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q, status, kind, sort, dir })
    if (review) params.set('review', '1')
    if (unavailable) params.set('unavailable', '1')
    try {
      const { data, stale: fromCache } = await get<{
        items: Item[]; counts: { status: string; n: number }[]; review_count: number; unavailable_count: number; total: number
      }>(`/items?${params}`)
      setItems(data.items)
      setCounts(data.counts)
      setReviewCount(data.review_count ?? 0)
      setUnavailableCount(data.unavailable_count ?? 0)
      setTotal(data.total ?? 0)
      setStale(fromCache)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.')
    }
  }, [q, status, kind, sort, dir, review, unavailable])

  useEffect(() => { void load() }, [load])

  function say(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4000)
  }

  return (
    // El título vive en la barra de arriba y en ningún otro lado. «Agregar al
    // inventario» va en el hueco derecho de la barra: antes competía por
    // espacio con la búsqueda y el filtro de tipo en la misma fila.
    <Screen
      title="Inventario"
      onBack={() => navigate('/')}
      backLabel="Regresar al inicio"
      right={<button type="button" className="btn-main" onClick={() => setAdding(true)}>Agregar al inventario</button>}
    >
      <div className="wrap">
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
              <option value="">Todos los tipos</option>
              <option value="dress">Vestidos</option>
              <option value="mantilla">Mantillas</option>
              <option value="tiara">Tiaras</option>
              <option value="cinto">Cintos</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <a className="btn-quiet" href="/api/items/export">Exportar CSV</a>
        </div>

        <div className="row" style={{ marginBottom: 'var(--space-9)' }}>
          {reviewCount > 0 && (
            <button type="button" className="chip chip--sm chip--danger" aria-pressed={review} onClick={() => setReview(!review)}>
              {`Por verificar (${reviewCount})`}
            </button>
          )}
          <button type="button" className="chip chip--sm" aria-pressed={status === '' && !review && !unavailable} onClick={() => { setStatus(''); setReview(false); setUnavailable(false) }}>
            {`Todos (${total})`}
          </button>
          <button type="button" className="chip chip--sm" aria-pressed={unavailable} onClick={() => { setUnavailable(!unavailable); setStatus('') }}>
            {`No disponible (${unavailableCount})`}
          </button>
          {counts.map((c) => (
            <button key={c.status} type="button" className="chip chip--sm" aria-pressed={status === c.status} onClick={() => { setStatus(c.status); setUnavailable(false) }}>
              {`${ST[c.status]?.[0] ?? c.status} (${c.n})`}
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
          {`${items.length} de ${total} artículos`}{isOwner ? '' : ' · los vendidos solo los ve la dueña'}
        </p>

        <div>
          <table className="tbl tbl--sticky">
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
                <tr key={item.id} onClick={() => setOpen(item)}>
                  <td style={{ textAlign: 'center' }}>
                    {item.photos[0]
                      ? <img src={`/api/files/${item.photos[0]}`} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 'var(--radius-sm, 4px)' }} />
                      : <span aria-label="Sin foto" style={{ color: 'var(--clay)', fontSize: '20px', fontWeight: 'var(--weight-medium)' }}>✗</span>}
                  </td>
                  <td className="mono">{item.code}</td>
                  <td className="model">
                    {item.name}
                    {[...missing].some((f) => !HAS_COLUMN.has(f)) && (
                      <span className="falta" style={{ display: 'block' }}>
                        falta {[...missing].filter((f) => !HAS_COLUMN.has(f)).map((f) => FALTA[f] ?? f).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`bdg ${item.kind === 'dress' ? 'ok' : 'clay'}`}>
                      {KIND_LABEL[item.kind]}
                    </span>
                  </td>
                  {/* Lo que no es obligatorio y está vacío no se pinta: ni guion ni «falta». */}
                  <td>{missing.has('brand') ? <span className="falta">falta</span> : (item.brand ?? '')}</td>
                  <td>{item.size ?? ''}</td>
                  <td className="mono">{missing.has('price') ? <span className="falta">falta</span> : money(item.price_cents)}</td>
                  <td className="mono">{item.quantity === null ? '' : item.quantity}</td>
                  <td>
                    {!item.available
                      ? <span className="bdg mute">No disponible</span>
                      : <span className={`bdg ${ST[item.status]?.[1] ?? 'mute'}`}>{ST[item.status]?.[0] ?? item.status}</span>}
                  </td>
                  <td className="mono">{item.intake_date ? dateMX(item.intake_date) : ''}</td>
                  {isOwner && (
                    <td className="mono">{item.cost_cents ? money(item.cost_cents) : ''}</td>
                  )}
                </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 11 : 10} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>
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

  // Cualquier artículo lleva cantidad, vestido o no. Vacía quiere decir que
  // todavía no se cuenta (así entra lo importado del sitio).

  // La dueña edita la ficha completa; la vendedora sólo la lee.
  const [form, setForm] = useState({
    code: item.code,
    name: item.name, brand: item.brand ?? '', size: item.size ?? '', cut: item.cut ?? '',
    color: item.color ?? '', notes: item.notes ?? '',
    kind: item.kind, price: String(item.price_cents / 100), cost: String((item.cost_cents ?? 0) / 100),
    quantity: item.quantity === null ? '' : String(item.quantity),
    intake_date: item.intake_date ?? '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })
  const [confirming, setConfirming] = useState(false)
  // Lo que traía la ficha al abrirse: si algo cambió, la (X) guarda antes de cerrar.
  const [initialForm] = useState(form)
  const dirty = isOwner && JSON.stringify(form) !== JSON.stringify(initialForm)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Guarda todo lo de la ficha. Lo comparten «Guardar cambios» y la (X).
  async function save(): Promise<string> {
    // Vacía: sin contar.
    const newQuantity = form.quantity.trim() === ''
      ? null
      : Math.max(0, Math.trunc(Number(form.quantity) || 0))
    await patch(`/items/${item.id}`, {
      code: form.code,
      name: form.name, brand: form.brand, size: form.size, cut: form.cut,
      color: form.color, notes: form.notes,
      kind: form.kind, intake_date: form.intake_date || undefined,
      price_cents: parseMoney(form.price) ?? 0,
      cost_cents: parseMoney(form.cost) ?? 0,
      quantity: newQuantity,
    })
    const label = newQuantity === 0 ? 'no disponible' : (ST[item.status]?.[0] ?? item.status).toLowerCase()
    return `${form.name} guardado como ${label}.`
  }

  // La (X) guarda lo que se cambió; si no se pudo guardar, la ficha se queda
  // abierta con el motivo en vez de tirar el cambio sin avisar.
  async function closeSheet() {
    if (!dirty) { onClose(); return }
    try {
      await onChanged(await save())
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'No se pudo guardar. Vuelve a intentar.')
    }
  }

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
    <Dialog title={item.name} onCancel={() => void closeSheet()} closeLabel={dirty ? 'Guardar y cerrar la ficha' : 'Cerrar la ficha'} full big>
      <p className="muted" style={{ textAlign: 'center', margin: '0 0 var(--space-8)' }}>
        código {item.code} · {KIND_LABEL[item.kind].toLowerCase()} · {item.quantity === null ? 'sin contar' : `${item.quantity} en existencia`}
      </p>

      {item.needs_review === 1 && (
        <p className="pill pill--brass" style={{ display: 'block', textAlign: 'center', margin: '0 0 var(--space-10)' }}>
          Por verificar: falta {[...missing].map((f) => FALTA[f] ?? f).join(', ')}.
          {missing.has('price') && ' Sin precio no se puede elegir en una sesión.'}
        </p>
      )}

      {closeError && <p className="err" role="alert" style={{ textAlign: 'center' }}>{closeError}</p>}

      {!item.available && (
        <p className="pill pill--brass" style={{ display: 'block', textAlign: 'center', margin: '0 0 var(--space-10)' }}>
          No disponible: ya no quedan existencias. No se puede agregar a un contrato hasta que se reponga.
        </p>
      )}

      <div className="inv-grid">
          <div>
            <PhotoGallery
              photos={primary ? [primary, ...photos.map((p) => p.file_id).filter((id) => id !== primary)] : photos.map((p) => p.file_id)}
              itemId={item.id}
              alt={item.name}
            />
            {isOwner ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                <label>Fotos</label>
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
                  <Field label="Modelo" marked={missing.has('name')}>{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} />}</Field>
                  <Field label="Marca" marked={missing.has('brand')}>{(id) => <input id={id} type="text" value={form.brand} onChange={set('brand')} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Talla">{(id) => <input id={id} type="text" value={form.size} onChange={set('size')} />}</Field>
                  <Field label="Corte">{(id) => <input id={id} type="text" value={form.cut} onChange={set('cut')} />}</Field>
                  <Field label="Color">{(id) => <input id={id} type="text" value={form.color} onChange={set('color')} />}</Field>
                </div>
                <div className="f3">
                  <Field label="Precio de venta" marked={missing.has('price')}>{(id) => <input id={id} type="text" inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
                  <Field label="Costo">{(id) => <input id={id} type="text" inputMode="decimal" value={form.cost} onChange={set('cost')} />}</Field>
                  <Field label="Cantidad" hint="Cuántos hay. Cada venta firmada descuenta uno; en cero deja de poder venderse. Vacío = todavía no se cuenta.">
                    {(id) => <input id={id} type="number" inputMode="numeric" min={0} step={1} placeholder="sin contar" value={form.quantity} onChange={set('quantity')} />}
                  </Field>
                </div>
                <div className="f3">
                  <Field label="Tipo">{(id) => (
                    <select id={id} value={form.kind} onChange={set('kind')}>
                      {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  )}</Field>
                  <Field label="Fecha de ingreso">{(id) => <input id={id} type="date" value={form.intake_date} onChange={set('intake_date')} />}</Field>
                </div>
                <Field label="Notas">
                  {(id) => <textarea id={id} value={form.notes} onChange={set('notes')} placeholder="Con quién está, pruebas pendientes, detalles de la tela" />}
                </Field>
              </>
            ) : (
              <div className="f3">
                <Info label="Estado" value={!item.available ? 'No disponible' : (ST[item.status]?.[0] ?? item.status)} />
                <Info label="Marca" value={item.brand ?? '—'} />
                <Info label="Corte" value={item.cut ?? '—'} />
                <Info label="Talla" value={item.size ?? '—'} />
                <Info label="Color" value={item.color ?? '—'} />
                <Info label="Tipo" value={KIND_LABEL[item.kind]} />
                <Info label="Precio de venta" value={missing.has('price') ? 'falta' : money(item.price_cents)} />
                <Info label="Cantidad" value={item.quantity === null ? 'Sin contar' : String(item.quantity)} />
                <Info label="Fecha de ingreso" value={dateMX(item.intake_date)} />
              </div>
            )}

            {!isOwner && item.notes && <p className="lede">{item.notes}</p>}

            {/* El estado y su transición son cosa de la vendedora, que trae el
                vestido en las manos; la dueña no necesita tocarlo aquí. */}
            {!isOwner && item.acquisition !== 'pedido' && (
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
                  onAction={async () => { await onChanged(await save()) }}
                >
                  Guardar cambios
                </ActionButton>
                {/*
                  Se toca dos veces para confirmar. El primer toque NO es una
                  acción terminada —antes pasaba por el botón de acciones y
                  mostraba «Listo», como si ya se hubiera borrado—: sólo
                  cambia el botón; el borrado va en el segundo.
                */}
                {confirming ? (
                  <ActionButton
                    className="danger"
                    done="Eliminado"
                    onAction={async () => {
                      await del(`/items/${item.id}`)
                      await onChanged(`${item.name} eliminado. Queda registrado quién lo borró y cuándo.`)
                    }}
                  >
                    Sí, eliminar del inventario
                  </ActionButton>
                ) : (
                  <button type="button" className="danger" onClick={() => setConfirming(true)}>
                    Eliminar del inventario
                  </button>
                )}
                {confirming && (
                  <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
                    No eliminar
                  </button>
                )}
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
    code: '', name: '', brand: '', size: '', cut: '', color: '', notes: '',
    kind: 'dress', price: '', cost: '', quantity: '1',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const [photos, setPhotos] = useState<Shot[]>([])
  const [primary, setPrimary] = useState<string | null>(null)
  // Se enciende en el primer intento de guardar con algo obligatorio vacío;
  // antes de tocar «Agregar» nada se ve en rojo todavía.
  const [attempted, setAttempted] = useState(false)

  const missingName = attempted && !form.name.trim()
  const missingCode = attempted && !form.code.trim()
  // La marca sólo es obligatoria en un vestido.
  const missingBrand = attempted && form.kind === 'dress' && !form.brand.trim()
  const missingPrice = attempted && (parseMoney(form.price) ?? 0) <= 0
  const missingPhoto = attempted && photos.length === 0

  return (
    <Dialog title="Nuevo artículo" onCancel={onClose} closeLabel="Cerrar sin guardar" full big>
      <div className="f3">
        <Field label="Modelo" invalid={missingName}>{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} placeholder="Madelyn" />}</Field>
        <Field label="Marca" invalid={missingBrand}>{(id) => <input id={id} type="text" value={form.brand} onChange={set('brand')} placeholder="Lanesta" />}</Field>
        <Field label="Tipo">{(id) => (
          <select id={id} value={form.kind} onChange={set('kind')}>
            <option value="dress">Vestido</option>
            <option value="mantilla">Mantilla</option>
            <option value="tiara">Tiara</option>
            <option value="cinto">Cinto</option>
            <option value="otros">Otro</option>
          </select>
        )}</Field>
      </div>
      <div className="f3">
        <Field label="Talla">{(id) => <input id={id} type="text" value={form.size} onChange={set('size')} placeholder="M" />}</Field>
        <Field label="Corte">{(id) => <input id={id} type="text" value={form.cut} onChange={set('cut')} placeholder="Princesa" />}</Field>
        <Field label="Color">{(id) => <input id={id} type="text" value={form.color} onChange={set('color')} placeholder="Marfil" />}</Field>
      </div>
      <div className="f3">
        <Field label="Código" hint="Tu nomenclatura: p139, s14, A12, mantilla 039" invalid={missingCode}>
          {(id) => <input id={id} type="text" value={form.code} onChange={set('code')} placeholder="p139" />}
        </Field>
        <Field label="Precio de venta" invalid={missingPrice}>{(id) => <input id={id} type="text" inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
        {isOwner
          ? <Field label="Costo">{(id) => <input id={id} type="text" inputMode="decimal" value={form.cost} onChange={set('cost')} />}</Field>
          : <Field label="Costo">{(id) => <input id={id} type="text" value="Solo la dueña" disabled style={{ opacity: .5 }} />}</Field>}
      </div>
      <div className="f3">
        <Field label="Cantidad" hint="Cuántos entran al inventario ahora mismo">
          {(id) => <input id={id} type="number" inputMode="numeric" min={0} step={1} value={form.quantity} onChange={set('quantity')} />}
        </Field>
      </div>

      {/*
        Las fotos: hasta cinco, una principal. Se comprimen en la tableta con el
        mismo camino que las demás fotos del sistema y se amarran al artículo
        en cuanto queda dado de alta. Sin foto no se guarda: es lo único que la
        novia ve en el kiosco.
      */}
      <div className={`field${missingPhoto ? ' field--invalid' : ''}`}>
        <label>Fotos <span className="muted">· la principal es la que se ve en el kiosco</span>{missingPhoto && <span className="falta falta--invalid">obligatorio</span>}</label>
        <PhotoSet photos={photos} primary={primary} onChange={(next, mark) => { setPhotos(next); setPrimary(mark) }} />
      </div>

      <Field label="Notas">{(id) => <textarea id={id} value={form.notes} onChange={set('notes')} placeholder="Con quién está, pruebas pendientes, detalles de la tela" />}</Field>

      <div className="row" style={{ marginTop: 'var(--space-2)' }}>
        <ActionButton
          onAction={async () => {
            if (!form.name.trim() || !form.code.trim() || (form.kind === 'dress' && !form.brand.trim()) || (parseMoney(form.price) ?? 0) <= 0 || photos.length === 0) {
              setAttempted(true)
              throw new ApiError('Completa lo marcado en rojo antes de guardar.', 400, 'incomplete')
            }
            const { id } = await post<{ id: number }>('/items', {
              ...form,
              // Aquí ya no se preguntan: lo que entra por este formulario
              // es nuevo y se cuenta por cantidad (campo `acquisition`
              // interno, no visible), y dónde vive es cosa de la dueña, no
              // un campo que llenar cada vez.
              acquisition: 'unidad', condition: 'nuevo',
              price_cents: parseMoney(form.price) ?? 0,
              cost_cents: isOwner ? (parseMoney(form.cost) ?? 0) : undefined,
            })
            await put(`/items/${id}/photos`, {
              photos: photos.map((p) => ({ file_id: p.file_id, is_primary: p.file_id === primary })),
            })
            await onAdded(form.name)
          }}
        >
          Agregar al inventario
        </ActionButton>
      </div>
    </Dialog>
  )
}
