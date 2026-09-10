import { useNavigate } from '../lib/router'
import { useSession } from '../lib/session'

const TILES = [
  { to: '/sesion', label: 'Nueva sesión' },
  { to: '/pagos', label: 'Registrar pago' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/gastos', label: 'Registrar gasto' },
]

export function Tiles() {
  const navigate = useNavigate()
  const { me, logout } = useSession()

  // El nombre de la sucursal ya trae la marca, y el nombre sembrado puede
  // coincidir con el rol: ninguno de los dos se repite.
  const place = me?.store_name.split('·').pop()?.trim()
  const role = me?.role === 'owner' ? 'Dueña' : 'Vendedora'
  const who = me?.name === role ? role : `${me?.name} · ${role}`

  return (
    <div className="entry">
      <div className="k-brand" style={{ justifyContent: 'center' }}>
        <h1>Soy Única</h1>
        <em>{place}</em>
      </div>
      <p className="lede">{who}</p>

      <div className="tiles">
        {TILES.map((tile) => (
          <button key={tile.to} type="button" className="btn-main" onClick={() => navigate(tile.to)}>
            {tile.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        {me?.role === 'owner' && (
          <button type="button" className="btn-quiet" onClick={() => navigate('/ajustes')}>⚙ Ajustes</button>
        )}
        <button type="button" className="btn-quiet" onClick={() => void logout()}>Salir</button>
      </div>
    </div>
  )
}
