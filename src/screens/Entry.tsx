import { useState } from 'react'
import { ApiError, OfflineError, post } from '../lib/api'
import { useSession } from '../lib/session'

type Store = 'mty' | 'cdmx'
type Role = 'owner' | 'seller'

const STORE_LABEL: Record<Store, string> = { mty: 'Monterrey', cdmx: 'CDMX' }
const ROLE_LABEL: Record<Role, string> = { owner: 'Dueña', seller: 'Vendedora' }

/**
 * La entrada es exactamente esta secuencia, cada paso a pantalla completa con
 * un título centrado y botones grandes. Nada más.
 */
export function Entry() {
  const { refresh } = useSession()
  const [store, setStore] = useState<Store | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  if (!store) {
    return (
      <div className="fullscreen">
        <h1>Selecciona la sucursal</h1>
        <div className="fullscreen__choices">
          {(['mty', 'cdmx'] as Store[]).map((id) => (
            <button key={id} type="button" className="btn btn--primary" onClick={() => setStore(id)}>
              {STORE_LABEL[id]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!role) {
    return (
      <div className="fullscreen">
        <h1>Selecciona tu rol</h1>
        <div className="fullscreen__choices">
          {(['owner', 'seller'] as Role[]).map((id) => (
            <button key={id} type="button" className="btn btn--primary" onClick={() => setRole(id)}>
              {ROLE_LABEL[id]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setStore(null)}>Regresar</button>
      </div>
    )
  }

  return <PinPad store={store} role={role} onBack={() => setRole(null)} onSuccess={refresh} />
}

function PinPad({ store, role, onBack, onSuccess }: { store: Store; role: Role; onBack: () => void; onSuccess: () => Promise<void> }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const press = (digit: string) => {
    setError(null)
    setPin((current) => (current.length >= 6 ? current : current + digit))
  }

  async function submit() {
    if (pin.length < 4) {
      setError('El NIP son de 4 a 6 dígitos.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await post('/auth/pin', { store, role, pin })
      await onSuccess()
    } catch (err) {
      setPin('')
      // Un solo mensaje: nunca se dice qué parte falló.
      setError(err instanceof ApiError || err instanceof OfflineError ? err.message : 'No se pudo entrar. Vuelve a intentar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fullscreen">
      <h1>{ROLE_LABEL[role]} · {STORE_LABEL[store]}</h1>
      <p className="muted">Marca tu NIP</p>

      <div className="row" aria-hidden="true" style={{ gap: 'var(--space-3)' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              border: '2px solid var(--color-line-strong)',
              background: i < pin.length ? 'var(--color-accent)' : 'transparent',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, var(--tap-bride))', gap: 'var(--space-4)' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button key={digit} type="button" className="btn btn--bride" onClick={() => press(digit)}>{digit}</button>
        ))}
        <button type="button" className="btn btn--bride" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Borrar">←</button>
        <button type="button" className="btn btn--bride" onClick={() => press('0')}>0</button>
        <button type="button" className="btn btn--bride btn--primary" onClick={submit} disabled={busy} aria-label="Entrar">
          {busy ? <span className="spinner" aria-hidden="true" /> : '→'}
        </button>
      </div>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <button type="button" className="btn btn--ghost" onClick={onBack}>Regresar</button>
    </div>
  )
}
