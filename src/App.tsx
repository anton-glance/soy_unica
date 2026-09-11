import { matchPath, useNavigate, usePath } from './lib/router'
import { Screen } from './components/Screen'
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
  const { me, loading } = useSession()

  // Las hojas se imprimen sin nada de la aplicación alrededor.
  const medidas = matchPath('/print/:folio/medidas', path)
  if (medidas) return <PrintMedidas folio={medidas.folio as string} />
  const contrato = matchPath('/print/:folio/contrato', path)
  if (contrato) return <PrintContrato folio={contrato.folio as string} />

  if (loading) {
    return <Screen title="Soy Única" center><span className="spinner" aria-hidden="true" /><p className="lede">Abriendo…</p></Screen>
  }
  if (!me) return <Entry />
  if (path === '/' || path === '') return <Tiles />

  // Ninguna pantalla dibuja aquí su cabecera: cada una monta su propio
  // <Screen>, que es el mismo marco para todas.
  return <Routes path={path} />
}

function Routes({ path }: { path: string }) {
  const navigate = useNavigate()
  if (path.startsWith('/sesion')) return <SalesSession />
  if (path.startsWith('/pagos')) return <PaymentsModule />
  if (path.startsWith('/inventario')) return <Inventory />
  if (path.startsWith('/gastos')) return <Expenses />
  if (path.startsWith('/ajustes')) return <Settings />
  return (
    <Screen title="Esa pantalla no existe" onBack={() => navigate('/')} backLabel="Regresar al inicio" center>
      <p className="lede">Regresa al inicio y vuelve a entrar por los cuadros.</p>
    </Screen>
  )
}
