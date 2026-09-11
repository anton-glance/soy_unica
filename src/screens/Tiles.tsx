import { useNavigate } from '../lib/router'
import { useSession } from '../lib/session'
import { IconButton } from '../components/IconButton'
import { Brandmark } from '../components/Brandmark'

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
    <>
      <div className="screen-nav">
        {/* Aquí empieza todo: no hay a dónde regresar, sólo salir. */}
        <div className="screen-nav__slot" />
        <div />
        <div className="screen-nav__slot screen-nav__slot--end">
          <IconButton kind="close" label="Salir" onClick={() => void logout()} />
        </div>
      </div>

      <div className="entry">
        <Brandmark size="lg" />
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
      </div>
    </>
  )
}
