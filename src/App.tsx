import { Suspense } from 'react'
import { matchPath, useNavigate, usePath } from './lib/router'
import { useSession } from './lib/session'
import { Entry } from './screens/Entry'
import { Tiles } from './screens/Tiles'
import { Inventory } from './screens/Inventory'
import { PaymentsModule } from './screens/Payments'
import { Expenses } from './screens/Expenses'
import { Settings } from './screens/Settings'
import { SalesSession } from './screens/SalesSession'
import { PrintMedidas } from './screens/PrintMedidas'
import { PrintContrato } from './screens/PrintContrato'

export function App() {
  const path = usePath()
  const { me, loading, logout } = useSession()
  const navigate = useNavigate()

  // Las hojas se imprimen sin nada de la aplicación alrededor.
  const medidas = matchPath('/print/:folio/medidas', path)
  if (medidas) return <PrintMedidas folio={medidas.folio as string} />
  const contrato = matchPath('/print/:folio/contrato', path)
  if (contrato) return <PrintContrato folio={contrato.folio as string} />

  if (loading) {
    return <div className="entry"><span className="spinner" aria-hidden="true" /><p className="lede">Abriendo…</p></div>
  }
  if (!me) return <Entry />
  if (path === '/' || path === '') return <Tiles />

  const title =
    path.startsWith('/sesion') ? 'Sesión de venta'
      : path.startsWith('/pagos') ? 'Registrar pago'
      : path.startsWith('/inventario') ? 'Inventario'
      : path.startsWith('/gastos') ? 'Registrar gasto'
      : path.startsWith('/ajustes') ? 'Ajustes'
      : ''

  // El kiosco es la pantalla que ve la novia: va a sangre, con su propia
  // cabecera, igual que en el prototipo. Sin barra ni botón de salir arriba.
  if (path.startsWith('/sesion')) return <SalesSession />

  return (
    <>
      <header className="appbar">
        <button type="button" className="btn-quiet" onClick={() => navigate('/')}>← Inicio</button>
        <strong>{title}</strong>
        <button type="button" className="btn-quiet" onClick={() => void logout()}>Salir</button>
      </header>
      <Suspense fallback={<div className="wrap"><span className="spinner" aria-hidden="true" /></div>}>
        <Routes path={path} />
      </Suspense>
    </>
  )
}

function Routes({ path }: { path: string }) {
  if (path.startsWith('/sesion')) return <SalesSession />
  if (path.startsWith('/pagos')) return <PaymentsModule />
  if (path.startsWith('/inventario')) return <Inventory />
  if (path.startsWith('/gastos')) return <Expenses />
  if (path.startsWith('/ajustes')) return <Settings />
  return (
    <div className="wrap">
      <h2>Esa pantalla no existe</h2>
      <p className="lede">Regresa al inicio y vuelve a entrar por los cuadros.</p>
    </div>
  )
}
