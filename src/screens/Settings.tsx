import { useCallback, useEffect, useState } from 'react'
import { get, patch, post } from '../lib/api'
import { bytes, money, parseMoney } from '../lib/format'
import { ActionButton } from '../components/ActionButton'
import { Field, Select, TextArea, TextInput } from '../components/Field'

interface Store {
  id: string; name: string; address: string; phone: string; report_email: string | null
  kiosk_show_prices: number; min_days_before_wedding: number; contract_template: string
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
  const [data, setData] = useState<SettingsData | null>(null)
  const [storage, setStorage] = useState<Storage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [settings, store] = await Promise.all([get<SettingsData>('/settings'), get<Storage>('/storage')])
      setData(settings.data)
      setStorage(store.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los ajustes.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (error) return <div className="page"><p className="notice notice--error">{error}</p></div>
  if (!data) return <div className="page"><span className="spinner" aria-hidden="true" /></div>

  return (
    <div className="page stack">
      <h1>Ajustes</h1>
      <StorageCard storage={storage} />
      <Pins users={data.users} />
      <StoreRules store={data.store} onSaved={load} />
      <Retention store={data.store} floors={data.retention_floors} onSaved={load} />
      <Template store={data.store} onSaved={load} />
      <Catalogs data={data} onSaved={load} />
    </div>
  )
}

function StorageCard({ storage }: { storage: Storage | null }) {
  if (!storage) return null
  const pct = Math.min(100, (storage.used_bytes / storage.quota_bytes) * 100)
  return (
    <section className="card stack">
      <h2>Almacenamiento</h2>
      <p style={{ fontSize: 'var(--text-lg)' }}>
        <strong className="numeric">{bytes(storage.used_bytes)}</strong> de {bytes(storage.quota_bytes)}
        {storage.full_on !== null && <> · a este ritmo se llena en {storage.full_on}</>}
        {storage.full_on === null && <> · todavía no hay suficiente historia para estimar cuándo se llena</>}
      </p>
      <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-sunken)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-pill)', background: 'var(--color-accent)' }} />
      </div>
      <div className="row row--wrap">
        {storage.by_kind.map((k) => (
          <span key={k.kind} className="chip">{k.kind}: {bytes(k.bytes)} ({k.files})</span>
        ))}
      </div>
    </section>
  )
}

/** El nombre sembrado puede coincidir con el rol; no se repite. */
function roleLabel(user: { name: string; role: string }): string {
  const role = user.role === 'owner' ? 'Dueña' : 'Vendedora'
  return user.name === role ? role : `${user.name} · ${role}`
}

function Pins({ users }: { users: SettingsData['users'] }) {
  const [pins, setPins] = useState<Record<number, string>>({})
  return (
    <section className="card stack">
      <h2>NIP</h2>
      <p className="muted">De 4 a 6 dígitos. El NIP nunca se guarda ni se registra en claro.</p>
      {users.map((user) => (
        <div key={user.id} className="row row--wrap">
          <span style={{ minWidth: 160 }}>{roleLabel(user)}</span>
          <TextInput
            type="password"
            inputMode="numeric"
            placeholder="Nuevo NIP"
            value={pins[user.id] ?? ''}
            onChange={(e) => setPins((p) => ({ ...p, [user.id]: e.target.value }))}
            style={{ maxWidth: 200 }}
          />
          <ActionButton
            disabled={!/^\d{4,6}$/.test(pins[user.id] ?? '')}
            onAction={async () => {
              await patch(`/settings/users/${user.id}/pin`, { pin: pins[user.id] })
              setPins((p) => ({ ...p, [user.id]: '' }))
            }}
            done="NIP cambiado"
          >
            Cambiar
          </ActionButton>
        </div>
      ))}
    </section>
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
    kiosk_show_prices: store.kiosk_show_prices === 1,
  })

  return (
    <section className="card stack">
      <h2>Reglas de la tienda</h2>
      <Field label="Nombre"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Dirección"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="Correo para reportes"><TextInput value={form.report_email} onChange={(e) => setForm({ ...form, report_email: e.target.value })} /></Field>
      <Field label="Días mínimos entre la última parcialidad y la boda">
        <TextInput inputMode="numeric" value={form.min_days_before_wedding} onChange={(e) => setForm({ ...form, min_days_before_wedding: e.target.value })} />
      </Field>
      <Field label="Hotel de vestido por día">
        <TextInput inputMode="decimal" value={form.hotel_daily} onChange={(e) => setForm({ ...form, hotel_daily: e.target.value })} />
      </Field>
      <Field label="Días libres antes de cobrar hotel">
        <TextInput inputMode="numeric" value={form.hotel_free_days} onChange={(e) => setForm({ ...form, hotel_free_days: e.target.value })} />
      </Field>
      <Field label="Recargo por atraso (% mensual)" hint="Se sugiere; nunca se aplica solo.">
        <TextInput inputMode="decimal" value={form.late_fee_pct} onChange={(e) => setForm({ ...form, late_fee_pct: e.target.value })} />
      </Field>
      <label className="row">
        <input type="checkbox" checked={form.kiosk_show_prices} onChange={(e) => setForm({ ...form, kiosk_show_prices: e.target.checked })} />
        <span>Mostrar precios en el kiosko</span>
      </label>

      <ActionButton
        onAction={async () => {
          await patch('/settings/store', {
            name: form.name, address: form.address, report_email: form.report_email,
            min_days_before_wedding: Number(form.min_days_before_wedding),
            hotel_daily_cents: parseMoney(form.hotel_daily) ?? 0,
            hotel_free_days: Number(form.hotel_free_days),
            late_fee_pct: Number(form.late_fee_pct),
            kiosk_show_prices: form.kiosk_show_prices,
          })
          await onSaved()
        }}
      >
        Guardar
      </ActionButton>
    </section>
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
    <section className="card stack">
      <h2>Retención de fotos</h2>
      <p className="notice notice--warn">
        Estas fotos son la única prueba de la tienda si una clienta reclama. Antes de acortar
        cualquiera de estos periodos, piensa en cuánto tiempo después de la entrega puede llegar
        una aclaración.
      </p>

      <Field label={`Fotos de vestidos vendidos (meses, mínimo ${floors.retention_sold_photos_months})`}>
        <TextInput inputMode="numeric" value={form.sold} onChange={(e) => setForm({ ...form, sold: e.target.value })} />
      </Field>
      <Field label={`Documentos de clientas (meses, mínimo ${floors.retention_client_docs_months})`}>
        <TextInput inputMode="numeric" value={form.docs} onChange={(e) => setForm({ ...form, docs: e.target.value })} />
      </Field>
      <Field label={`Comprobantes de gasto (meses, mínimo ${floors.retention_expense_photos_months})`}>
        <TextInput inputMode="numeric" value={form.expense} onChange={(e) => setForm({ ...form, expense: e.target.value })} />
      </Field>

      <Field label="Destino de archivo">
        <Select value={form.archive_target} onChange={(e) => setForm({ ...form, archive_target: e.target.value as 'none' | 'gdrive' })}>
          <option value="none">Ninguno</option>
          <option value="gdrive">Google Drive</option>
        </Select>
      </Field>
      <label className="row">
        <input type="checkbox" checked={form.archive_before_delete} onChange={(e) => setForm({ ...form, archive_before_delete: e.target.checked })} />
        <span>Archivar antes de borrar</span>
      </label>
      {form.archive_before_delete && form.archive_target === 'gdrive' && (
        <p className="notice notice--warn">
          El archivador de Google Drive todavía no existe: mientras no exista, el borrado por
          retención se va a negar y va a decir por qué. Nada se pierde.
        </p>
      )}

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
        className="btn"
        onAction={async () => {
          const { data } = await get<NonNullable<typeof dry>>('/maintenance/retention?dry_run=1')
          setDry(data)
        }}
        done="Revisado"
      >
        Revisar qué se borraría
      </ActionButton>

      {dry && (
        <div className="stack">
          <p>
            Se borrarían <strong>{dry.deletable.length}</strong> archivos ({bytes(dry.deletable_bytes)}).
            Quedan retenidos <strong>{dry.held.length}</strong>.
          </p>
          {dry.held.slice(0, 10).map((f) => (
            <p key={f.id} className="muted">{f.kind}: {f.reason}</p>
          ))}
        </div>
      )}
    </section>
  )
}

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
    <section className="card stack">
      <h2>Plantilla del contrato</h2>
      <p className="muted">
        Marcadores disponibles: {'{{bride_name}} {{apellido}} {{phone}} {{wedding_date}} {{dress}} {{code}} {{color}} {{total}} {{anticipo}} {{plan_name}} {{schedule_table}} {{accessories}} {{store}} {{address}} {{folio}} {{date}}'}
      </p>
      <TextArea value={template} onChange={(e) => setTemplate(e.target.value)} style={{ minHeight: 320, fontFamily: 'ui-monospace, monospace' }} />
      <ActionButton onAction={async () => { await patch('/settings/store', { contract_template: template }); await onSaved() }}>
        Guardar la plantilla
      </ActionButton>
      <h3>Vista previa</h3>
      <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--color-surface-sunken)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
        {preview}
      </pre>
    </section>
  )
}

function Catalogs({ data, onSaved }: { data: SettingsData; onSaved: () => Promise<void> }) {
  return (
    <>
      <section className="card stack">
        <h2>Planes de pago</h2>
        <p className="muted">Son un conjunto fijo. No hay planes a la medida: son imposibles de seguir.</p>
        {data.plans.map((plan) => (
          <div key={plan.id} className="row row--between row--wrap">
            <span>
              <strong>{plan.name}</strong> · {plan.splits} · {plan.max_months === 0 ? 'liquida al recoger' : `${plan.max_months} meses`}
              {plan.discount_pct > 0 && <> · {plan.discount_pct}% de descuento</>}
              {plan.min_price_cents > 0 && <> · desde {money(plan.min_price_cents)}</>}
            </span>
            <ActionButton
              className="btn btn--ghost"
              onAction={async () => { await patch(`/settings/plans/${plan.id}`, { active: plan.active ? 0 : 1 }); await onSaved() }}
            >
              {plan.active ? 'Desactivar' : 'Activar'}
            </ActionButton>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Cargos</h2>
        {data.surcharges.map((s) => (
          <div key={s.id} className="row row--between row--wrap" style={{ opacity: s.active ? 1 : 0.5 }}>
            <span>{s.name} · {s.pct > 0 ? `${s.pct}%` : money(s.amount_cents)}</span>
            <ActionButton
              className="btn btn--ghost"
              onAction={async () => { await patch(`/settings/surcharges/${s.id}`, { active: s.active ? 0 : 1 }); await onSaved() }}
            >
              {s.active ? 'Desactivar' : 'Activar'}
            </ActionButton>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Comisiones</h2>
        {data.commissions.map((c) => (
          <div key={c.id} className="row row--between row--wrap" style={{ opacity: c.active ? 1 : 0.5 }}>
            <span>Prioridad {c.priority} · {c.rate_pct}% sobre {c.basis} · {c.period === 'weekly' ? 'semanal' : 'mensual'}</span>
            <ActionButton
              className="btn btn--ghost"
              onAction={async () => { await patch(`/settings/commission_rules/${c.id}`, { active: c.active ? 0 : 1 }); await onSaved() }}
            >
              {c.active ? 'Desactivar' : 'Activar'}
            </ActionButton>
          </div>
        ))}
      </section>
    </>
  )
}
