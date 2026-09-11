import { useEffect, useState } from 'react'
import { get } from '../lib/api'
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
  // Las sesiones que siguen abiertas en la sucursal. La consulta barre primero
  // las abandonadas, así que esto es lo que de verdad está vivo —y si dice 2 y
  // la vendedora sabe que sólo hay una tableta en uso, ahí está el aviso.
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    void get<{ count: number }>('/sessions/open')
      .then(({ data }) => setOpen(data.count))
      .catch(() => setOpen(null))
  }, [])

  // El nombre de la sucursal ya trae la marca, y el nombre sembrado puede
  // coincidir con el rol: ninguno de los dos se repite.
  const place = me?.store_name.split('·').pop()?.trim()
  const role = me?.role === 'owner' ? 'Dueña' : 'Vendedora'
  const who = me?.name === role ? role : `${me?.name} · ${role}`

  return (
    // La única pantalla con (X): aquí sí significa salir del sistema.
    <Screen title={<Brandmark />} onClose={() => void logout()} closeLabel="Salir" center>
      <p className="lede">
        {place} · {who}
        {open !== null && open > 0 && (
          <> · <span className="pill pill--brass">{open === 1 ? '1 sesión abierta' : `${open} sesiones abiertas`}</span></>
        )}
      </p>

      <div className="tiles">
        {TILES.map((tile) => (
          <button key={tile.to} type="button" className="btn-main" onClick={() => navigate(tile.to)}>
            {tile.label}
          </button>
        ))}
      </div>

      {/* Las dos pantallas de la dueña. No son cuadros: los cuadros son el
          trabajo del día y esto se abre una vez por semana. */}
      {me?.role === 'owner' && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn-quiet" onClick={() => navigate('/reporte')}>Reporte de la semana</button>
          <button type="button" className="btn-quiet" onClick={() => navigate('/ajustes')}>⚙ Ajustes</button>
        </div>
      )}
    </Screen>
  )
}
