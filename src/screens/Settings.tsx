import { useCallback, useEffect, useState } from 'react'
import { get, patch, post } from '../lib/api'
import { bytes, money, parseMoney } from '../lib/format'
import { useNavigate } from '../lib/router'
import { ActionButton } from '../components/ActionButton'
import { Field } from '../components/Field'
import { Screen } from '../components/Screen'

interface Store {
  id: string; name: string; address: string; phone: string; report_email: string | null
  kiosk_show_prices: number; min_days_before_wedding: number; contract_template: string
  session_timeout_hours: number
  hotel_daily_cents: number; hotel_free_days: number; late_fee_pct: number
  retention_sold_photos_months: number; retention_client_docs_months: number; retention_expense_photos_months: number
  archive_target: 'none' | 'gdrive'; archive_before_delete: number
}

interface SettingsData {
  store: Store
  users: { id: number; name: string; role: string; active: number }[]
  plans: { id: number; name: string; splits: string; max_months: number; discount_pct: number; min_price_cents: number; active: number }[]
  surcharges: { id: number; name: string; kind: string; amount_cents: number; pct: number; active: number }[]
  commissions: { id: number; priority: number; rate_pct: number; basis: string; period: string; active: number }[]
  retention_floors: Record<string, number>
}

interface Storage {
  used_bytes: number; quota_bytes: number; files: number
  by_kind: { kind: string; bytes: number; files: number }[]
  months_to_full: number | null; full_on: number | null
}

export function Settings() {
  const navigate = useNavigate()
  const [data, setData] = useState<SettingsData | null>(null)
  const [storage, setStorage] = useState<Storage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [settings, store] = await Promise.all([get<SettingsData>('/settings'), get<Storage>('/storage')])
      setData(settings.data)
      setStorage(store.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los ajustes.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const back = () => navigate('/')

  if (error) {
    return <Screen title="Ajustes" onBack={back} backLabel="Regresar al inicio"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!data) {
    return <Screen title="Ajustes" onBack={back} backLabel="Regresar al inicio" center><span className="spinner" aria-hidden="true" /></Screen>
  }

  return (
    <Screen title="Ajustes" onBack={back} backLabel="Regresar al inicio">
      <div className="wrap">
        <p className="lede">Todo lo que se cambia aquí queda registrado en la bitácora: quién, qué y cuándo.</p>

        <StorageCard storage={storage} />
        <Pins users={data.users} />
        <StoreRules store={data.store} onSaved={load} />
        <Retention store={data.store} floors={data.retention_floors} onSaved={load} />
        <Template store={data.store} onSaved={load} />
        <Catalogs data={data} onSaved={load} />
      </div>
    </Screen>
  )
}

/** Los tipos de archivo, en español, como se llaman en la tienda. */
const KIND_ES: Record<string, string> = {
  item_photo: 'Fotos de vestidos', receipt: 'Comprobantes de pago', expense: 'Comprobantes de gasto',
  measurement_sheet: 'Hojas de medidas', contract: 'Contratos', adjustments: 'Ajustes', delivery: 'Entregas',
}

function StorageCard({ storage }: { storage: Storage | null }) {
  if (!storage) return null
  const pct = Math.min(100, (storage.used_bytes / storage.quota_bytes) * 100)
  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-6)' }}>Almacenamiento</h3>
      <p style={{ fontSize: 'var(--text-lg)' }}>
        <b className="mono" style={{ fontWeight: 'var(--weight-medium)' }}>{bytes(storage.used_bytes)}</b> de {bytes(storage.quota_bytes)}
        {storage.full_on !== null
          ? <> · a este ritmo se llena en {storage.full_on}</>
          : <> · todavía no hay suficiente historia para estimar cuándo se llena</>}
      </p>
      <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: 'var(--linen)', margin: 'var(--space-6) 0' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-pill)', background: 'var(--brass)' }} />
      </div>
      <div className="row">
        {storage.by_kind.map((k) => (
          <span key={k.kind} className="bdg mute">{KIND_ES[k.kind] ?? k.kind}: {bytes(k.bytes)} · {k.files}</span>
        ))}
        {storage.by_kind.length === 0 && <span className="muted">Todavía no hay fotos guardadas.</span>}
      </div>
    </div>
  )
}

function Pins({ users }: { users: SettingsData['users'] }) {
  const [pins, setPins] = useState<Record<number, string>>({})
  const roleLabel = (u: { name: string; role: string }) => {
    const role = u.role === 'owner' ? 'Dueña' : 'Vendedora'
    return u.name === role ? role : `${u.name} · ${role}`
  }
  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-6)' }}>NIP</h3>
      <p className="lede">De 4 a 6 dígitos. El NIP nunca se guarda ni se registra en claro.</p>
      {users.map((user) => (
        <div key={user.id} className="inv-bar" style={{ alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <div style={{ minWidth: 190 }}>{roleLabel(user)}</div>
          <div className="field" style={{ minWidth: 200 }}>
            <input
              type="password"
              inputMode="numeric"
              placeholder="Nuevo NIP"
              value={pins[user.id] ?? ''}
              onChange={(e) => setPins((p) => ({ ...p, [user.id]: e.target.value }))}
              aria-label={`Nuevo NIP de ${user.name}`}
            />
          </div>
          <ActionButton
            className="btn-quiet"
            disabled={!/^\d{4,6}$/.test(pins[user.id] ?? '')}
            done="NIP cambiado"
            onAction={async () => {
              await patch(`/settings/users/${user.id}/pin`, { pin: pins[user.id] })
              setPins((p) => ({ ...p, [user.id]: '' }))
            }}
          >
            Cambiar
          </ActionButton>
        </div>
      ))}
    </div>
  )
}

function StoreRules({ store, onSaved }: { store: Store; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: store.name,
    address: store.address,
    report_email: store.report_email ?? '',
    min_days_before_wedding: String(store.min_days_before_wedding),
    hotel_daily: String(store.hotel_daily_cents / 100),
    hotel_free_days: String(store.hotel_free_days),
    late_fee_pct: String(store.late_fee_pct),
    session_timeout_hours: String(store.session_timeout_hours),
    kiosk_show_prices: store.kiosk_show_prices === 1,
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-6)' }}>Reglas de la tienda</h3>
      <div className="two">
        <Field label="Nombre">{(id) => <input id={id} type="text" value={form.name} onChange={set('name')} />}</Field>
        <Field label="Correo para reportes">{(id) => <input id={id} type="text" value={form.report_email} onChange={set('report_email')} />}</Field>
      </div>
      <Field label="Dirección">{(id) => <input id={id} type="text" value={form.address} onChange={set('address')} />}</Field>
      <div className="f3">
        <Field label="Días mínimos entre la última parcialidad y la boda">
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.min_days_before_wedding} onChange={set('min_days_before_wedding')} />}
        </Field>
        <Field label="Hotel de vestido por día">
          {(id) => <input id={id} type="text" inputMode="decimal" value={form.hotel_daily} onChange={set('hotel_daily')} />}
        </Field>
        <Field label="Días libres antes de cobrar hotel">
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.hotel_free_days} onChange={set('hotel_free_days')} />}
        </Field>
      </div>
      <div className="two">
        <Field label="Recargo por atraso (% mensual)" hint="Se sugiere; nunca se aplica solo.">
          {(id) => <input id={id} type="text" inputMode="decimal" value={form.late_fee_pct} onChange={set('late_fee_pct')} />}
        </Field>
        <Field
          label="Horas sin actividad para dar una sesión por abandonada"
          hint="Se cierra sola y suelta los vestidos que había apartado. Conserva lo que la clienta marcó."
        >
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.session_timeout_hours} onChange={set('session_timeout_hours')} />}
        </Field>
      </div>
      <label className="shot" style={{ marginBottom: 'var(--space-9)' }}>
        <input type="checkbox" checked={form.kiosk_show_prices} onChange={(e) => setForm({ ...form, kiosk_show_prices: e.target.checked })} style={{ width: 24, height: 24, minHeight: 0 }} />
        <b>Mostrar precios en el kiosco</b>
      </label>

      <ActionButton
        onAction={async () => {
          await patch('/settings/store', {
            name: form.name, address: form.address, report_email: form.report_email,
            min_days_before_wedding: Number(form.min_days_before_wedding),
            hotel_daily_cents: parseMoney(form.hotel_daily) ?? 0,
            hotel_free_days: Number(form.hotel_free_days),
            late_fee_pct: Number(form.late_fee_pct),
            session_timeout_hours: Number(form.session_timeout_hours),
            kiosk_show_prices: form.kiosk_show_prices,
          })
          await onSaved()
        }}
      >
        Guardar
      </ActionButton>
    </div>
  )
}

function Retention({ store, floors, onSaved }: { store: Store; floors: Record<string, number>; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    sold: String(store.retention_sold_photos_months),
    docs: String(store.retention_client_docs_months),
    expense: String(store.retention_expense_photos_months),
    archive_target: store.archive_target,
    archive_before_delete: store.archive_before_delete === 1,
  })
  const [dry, setDry] = useState<{ deletable: { id: string; kind: string; bytes: number }[]; held: { id: string; kind: string; reason: string }[]; deletable_bytes: number } | null>(null)

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-6)' }}>Retención de fotos</h3>
      <p className="lede">
        Estas fotos son la única prueba de la tienda si una clienta reclama. Antes de acortar
        cualquiera de estos periodos, piensa en cuánto tiempo después de la entrega puede llegar
        una aclaración.
      </p>

      <div className="f3">
        <Field label={`Fotos de vestidos vendidos (meses, mínimo ${floors.retention_sold_photos_months})`}>
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.sold} onChange={(e) => setForm({ ...form, sold: e.target.value })} />}
        </Field>
        <Field label={`Documentos de clientas (meses, mínimo ${floors.retention_client_docs_months})`}>
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.docs} onChange={(e) => setForm({ ...form, docs: e.target.value })} />}
        </Field>
        <Field label={`Comprobantes de gasto (meses, mínimo ${floors.retention_expense_photos_months})`}>
          {(id) => <input id={id} type="text" inputMode="numeric" value={form.expense} onChange={(e) => setForm({ ...form, expense: e.target.value })} />}
        </Field>
      </div>

      <Field label="Destino de archivo">
        {(id) => (
          <select id={id} value={form.archive_target} onChange={(e) => setForm({ ...form, archive_target: e.target.value as 'none' | 'gdrive' })}>
            <option value="none">Ninguno</option>
            <option value="gdrive">Google Drive</option>
          </select>
        )}
      </Field>
      <label className="shot" style={{ marginBottom: 'var(--space-9)' }}>
        <input type="checkbox" checked={form.archive_before_delete} onChange={(e) => setForm({ ...form, archive_before_delete: e.target.checked })} style={{ width: 24, height: 24, minHeight: 0 }} />
        <b>Archivar antes de borrar</b>
      </label>
      {form.archive_before_delete && form.archive_target === 'gdrive' && (
        <p className="state late" style={{ marginBottom: 'var(--space-9)' }}>
          El archivador de Google Drive todavía no existe: mientras no exista, el borrado por
          retención se va a negar y va a decir por qué. Nada se pierde.
        </p>
      )}

      <div className="row">
        <ActionButton
          onAction={async () => {
            await patch('/settings/store', {
              retention_sold_photos_months: Number(form.sold),
              retention_client_docs_months: Number(form.docs),
              retention_expense_photos_months: Number(form.expense),
              archive_target: form.archive_target,
              archive_before_delete: form.archive_before_delete,
            })
            await onSaved()
          }}
        >
          Guardar
        </ActionButton>
        <ActionButton
          className="btn-quiet"
          done="Revisado"
          onAction={async () => {
            const { data } = await get<NonNullable<typeof dry>>('/maintenance/retention?dry_run=1')
            setDry(data)
          }}
        >
          Revisar qué se borraría
        </ActionButton>
      </div>

      {dry && (
        <div className="hist" style={{ marginTop: 'var(--space-9)' }}>
          <div>
            <span>Se borrarían {dry.deletable.length} archivos · quedan retenidos {dry.held.length}</span>
            <span className="mono">{bytes(dry.deletable_bytes)}</span>
          </div>
          {dry.held.slice(0, 10).map((f) => (
            <div key={f.id}><span>{f.kind}</span><span className="muted">{f.reason}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

const PLACEHOLDERS = '{{bride_name}} {{apellido}} {{phone}} {{wedding_date}} {{dress}} {{code}} {{color}} {{total}} {{anticipo}} {{plan_name}} {{schedule_table}} {{accessories}} {{store}} {{address}} {{folio}} {{date}}'

function Template({ store, onSaved }: { store: Store; onSaved: () => Promise<void> }) {
  const [template, setTemplate] = useState(store.contract_template)
  const [preview, setPreview] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void post<{ preview: string }>('/settings/template/preview', { template })
        .then((r) => setPreview(r.preview))
        .catch(() => setPreview(''))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [template])

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 'var(--space-6)' }}>Plantilla del contrato</h3>
      <p className="lede">
        Es el contrato de la tienda, palabra por palabra. Marcadores disponibles: {PLACEHOLDERS}
      </p>
      <Field label="Texto del contrato">
        {(id) => (
          <textarea
            id={id}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            style={{ minHeight: 340, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-md)' }}
          />
        )}
      </Field>
      <ActionButton onAction={async () => { await patch('/settings/store', { contract_template: template }); await onSaved() }}>
        Guardar la plantilla
      </ActionButton>

      <h3 style={{ margin: 'var(--space-11) 0 var(--space-6)' }}>Vista previa</h3>
      <pre style={{
        whiteSpace: 'pre-wrap', background: 'var(--ivory)', border: '1px solid var(--tape)',
        padding: 'var(--space-9)', borderRadius: 'var(--radius-md)', font: 'inherit', fontSize: 'var(--text-label)',
        margin: 0, maxHeight: 420, overflow: 'auto',
      }}>
        {preview}
      </pre>
    </div>
  )
}

function Catalogs({ data, onSaved }: { data: SettingsData; onSaved: () => Promise<void> }) {
  return (
    <>
      <div className="panel">
        <h3 style={{ marginBottom: 'var(--space-6)' }}>Planes de pago</h3>
        <p className="lede">Son un conjunto fijo. No hay planes a la medida: son imposibles de seguir.</p>
        <div className="hist">
          {data.plans.map((plan) => (
            <div key={plan.id} style={{ opacity: plan.active ? 1 : .5 }}>
              <span>
                <b style={{ fontWeight: 'var(--weight-regular)' }}>{plan.name}</b> · {plan.splits} ·{' '}
                {plan.max_months === 0 ? 'liquida al recoger' : `${plan.max_months} meses`}
                {plan.discount_pct > 0 && ` · ${plan.discount_pct}% de descuento`}
                {plan.min_price_cents > 0 && ` · desde ${money(plan.min_price_cents)}`}
              </span>
              <ActionButton
                className="btn-quiet"
                onAction={async () => { await patch(`/settings/plans/${plan.id}`, { active: plan.active ? 0 : 1 }); await onSaved() }}
              >
                {plan.active ? 'Desactivar' : 'Activar'}
              </ActionButton>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 'var(--space-6)' }}>Cargos</h3>
        <div className="hist">
          {data.surcharges.map((s) => (
            <div key={s.id} style={{ opacity: s.active ? 1 : .5 }}>
              <span>{s.name}</span>
              <span className="row" style={{ alignItems: 'center' }}>
                <span className="mono">{s.pct > 0 ? `${s.pct}%` : money(s.amount_cents)}</span>
                <ActionButton
                  className="btn-quiet"
                  onAction={async () => { await patch(`/settings/surcharges/${s.id}`, { active: s.active ? 0 : 1 }); await onSaved() }}
                >
                  {s.active ? 'Desactivar' : 'Activar'}
                </ActionButton>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 'var(--space-6)' }}>Comisiones</h3>
        <div className="hist">
          {data.commissions.map((c) => (
            <div key={c.id} style={{ opacity: c.active ? 1 : .5 }}>
              <span>Prioridad {c.priority} · {c.rate_pct}% sobre {c.basis} · {c.period === 'weekly' ? 'semanal' : 'mensual'}</span>
              <ActionButton
                className="btn-quiet"
                onAction={async () => { await patch(`/settings/commission_rules/${c.id}`, { active: c.active ? 0 : 1 }); await onSaved() }}
              >
                {c.active ? 'Desactivar' : 'Activar'}
              </ActionButton>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
