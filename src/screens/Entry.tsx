import { useState } from 'react'
import { ApiError, OfflineError, post } from '../lib/api'
import { useSession } from '../lib/session'

type Store = 'mty' | 'cdmx'
type Role = 'owner' | 'seller'

const STORE_LABEL: Record<Store, string> = { mty: 'Monterrey', cdmx: 'CDMX' }
const STORE_SUB: Record<Store, string> = { mty: 'San Nicolás', cdmx: 'Ciudad de México' }
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
      <div className="entry">
        <h1>Selecciona la sucursal</h1>
        <div className="entry__choices">
          {(['mty', 'cdmx'] as Store[]).map((id) => (
            <button key={id} type="button" className="btn-main" onClick={() => setStore(id)}>
              {STORE_LABEL[id]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!role) {
    return (
      <div className="entry">
        <h1>Selecciona tu rol</h1>
        <p className="lede">{STORE_LABEL[store]} · {STORE_SUB[store]}</p>
        <div className="entry__choices">
          {(['owner', 'seller'] as Role[]).map((id) => (
            <button key={id} type="button" className="btn-main" onClick={() => setRole(id)}>
              {ROLE_LABEL[id]}
            </button>
          ))}
        </div>
        <button type="button" className="btn-quiet" onClick={() => setStore(null)}>Regresar</button>
      </div>
    )
  }

  return <PinPad store={store} role={role} onBack={() => setRole(null)} onSuccess={refresh} />
}

/** El teclado del prototipo: tres columnas, teclas de 72 px, puntos arriba. */
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
      setError('Escribe tu NIP de 4 a 6 dígitos.')
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
    <div className="entry">
      <h1>{ROLE_LABEL[role]}</h1>
      <p className="lede">{STORE_LABEL[store]} · marca tu NIP</p>

      <div className="entry__pin">
        <div className="pindots" aria-hidden="true">{'•'.repeat(pin.length)}</div>
        <p className="err" role="alert">{error ?? ''}</p>
        <div className="pinpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button key={digit} type="button" onClick={() => press(digit)}>{digit}</button>
          ))}
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))}>borrar</button>
          <button type="button" onClick={() => press('0')}>0</button>
          <button type="button" onClick={submit} disabled={busy} aria-label="Entrar">
            {busy ? <span className="spinner" aria-hidden="true" /> : '✓'}
          </button>
        </div>
        <button type="button" className="btn-quiet" style={{ width: '100%' }} onClick={onBack}>Regresar</button>
      </div>
    </div>
  )
}
