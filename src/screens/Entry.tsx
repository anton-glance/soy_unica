import { useState } from 'react'
import { ApiError, OfflineError, post } from '../lib/api'
import { useSession } from '../lib/session'
import { Brandmark } from '../components/Brandmark'
import { PinPad } from '../components/PinPad'
import { Screen } from '../components/Screen'

type Store = 'mty' | 'cdmx'
type Role = 'owner' | 'seller'

const STORE_LABEL: Record<Store, string> = { mty: 'Monterrey', cdmx: 'CDMX' }
const STORE_SUB: Record<Store, string> = { mty: 'San Nicolás', cdmx: 'Ciudad de México' }
const ROLE_LABEL: Record<Role, string> = { owner: 'Dueña', seller: 'Vendedora' }

/**
 * La entrada: sucursal, rol y NIP. Después del NIP se cae directo en los
 * cuatro cuadros, sin ninguna pantalla intermedia.
 */
export function Entry() {
  const { refresh } = useSession()
  const [store, setStore] = useState<Store | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!store) {
    return (
      // La primera pantalla: no hay a dónde regresar.
      <Screen title="Selecciona la sucursal" center>
        <Brandmark size="lg" />
        <div className="entry__choices">
          {(['mty', 'cdmx'] as Store[]).map((id) => (
            <button key={id} type="button" className="btn-main" onClick={() => setStore(id)}>
              {STORE_LABEL[id]}
            </button>
          ))}
        </div>
      </Screen>
    )
  }

  if (!role) {
    return (
      <Screen title="Selecciona tu rol" onBack={() => setStore(null)} backLabel="Regresar a la sucursal" center>
        <Brandmark size="lg" />
        <p className="lede">{STORE_LABEL[store]} · {STORE_SUB[store]}</p>
        <div className="entry__choices">
          {(['owner', 'seller'] as Role[]).map((id) => (
            <button key={id} type="button" className="btn-main" onClick={() => setRole(id)}>
              {ROLE_LABEL[id]}
            </button>
          ))}
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={ROLE_LABEL[role]} onBack={() => { setRole(null); setError(null) }} backLabel="Regresar al rol">
      <PinPad
        hint={`${STORE_LABEL[store]} · marca tu NIP`}
        error={error}
        busy={busy}
        onSubmit={async (pin) => {
          setBusy(true)
          setError(null)
          try {
            await post('/auth/pin', { store, role, pin })
            await refresh()
          } catch (err) {
            // Un solo mensaje: nunca se dice qué parte falló.
            setError(err instanceof ApiError || err instanceof OfflineError ? err.message : 'No se pudo entrar. Vuelve a intentar.')
          } finally {
            setBusy(false)
          }
        }}
      />
    </Screen>
  )
}
