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
  const { me } = useSession()

  return (
    <div className="fullscreen">
      <h1>{me?.store_name}</h1>
      <p className="muted">{me?.name}</p>
      <div className="fullscreen__choices">
        {TILES.map((tile) => (
          <button key={tile.to} type="button" className="btn btn--primary" onClick={() => navigate(tile.to)}>
            {tile.label}
          </button>
        ))}
      </div>
      {me?.role === 'owner' && (
        <button type="button" className="btn" onClick={() => navigate('/ajustes')}>
          ⚙ Ajustes
        </button>
      )}
    </div>
  )
}
