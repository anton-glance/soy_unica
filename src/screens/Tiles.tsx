import { useNavigate } from '../lib/router'
import { useSession } from '../lib/session'
import { Brandmark } from '../components/Brandmark'
import { Screen } from '../components/Screen'

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
    // La única pantalla con (X): aquí sí significa salir del sistema.
    <Screen title={<Brandmark />} onClose={() => void logout()} closeLabel="Salir" center>
      <p className="lede">{place} · {who}</p>

      <div className="tiles">
        {TILES.map((tile) => (
          <button key={tile.to} type="button" className="btn-main" onClick={() => navigate(tile.to)}>
            {tile.label}
          </button>
        ))}
      </div>

      {me?.role === 'owner' && (
        <button type="button" className="btn-quiet" onClick={() => navigate('/ajustes')}>⚙ Ajustes</button>
      )}
    </Screen>
  )
}
