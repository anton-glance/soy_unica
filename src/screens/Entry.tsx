import { useState } from 'react'
import { ApiError, OfflineError, post } from '../lib/api'
import { useSession } from '../lib/session'
import { IconButton } from '../components/IconButton'
import { Brandmark } from '../components/Brandmark'
import { PinPad } from '../components/PinPad'

type Store = 'mty' | 'cdmx'
type Role = 'owner' | 'seller'

const STORE_LABEL: Record<Store, string> = { mty: 'Monterrey', cdmx: 'CDMX' }
const STORE_SUB: Record<Store, string> = { mty: 'San Nicolás', cdmx: 'Ciudad de México' }
const ROLE_LABEL: Record<Role, string> = { owner: 'Dueña', seller: 'Vendedora' }

/**
 * La entrada es exactamente esta secuencia, cada paso a pantalla completa: la
 * sucursal, el rol y el NIP. Después del NIP se cae directo en los cuatro
 * cuadros, sin ninguna pantalla intermedia.
 */
export function Entry() {
  const { refresh } = useSession()
  const [store, setStore] = useState<Store | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!store) {
    return (
      <div className="entry">
        <Brandmark size="lg" />
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
      <>
        <div className="screen-nav">
          <div className="screen-nav__slot"><IconButton kind="back" label="Regresar a la sucursal" onClick={() => setStore(null)} /></div>
          <div />
          <div className="screen-nav__slot screen-nav__slot--end" />
        </div>
        <div className="entry">
          <Brandmark size="lg" />
          <h1>Selecciona tu rol</h1>
          <p className="lede">{STORE_LABEL[store]} · {STORE_SUB[store]}</p>
          <div className="entry__choices">
            {(['owner', 'seller'] as Role[]).map((id) => (
              <button key={id} type="button" className="btn-main" onClick={() => setRole(id)}>
                {ROLE_LABEL[id]}
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <PinPad
      title={ROLE_LABEL[role]}
      hint={`${STORE_LABEL[store]} · marca tu NIP`}
      error={error}
      busy={busy}
      backLabel="Regresar al rol"
      onBack={() => { setRole(null); setError(null) }}
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
  )
}
