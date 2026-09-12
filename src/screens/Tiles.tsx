import { useEffect, useRef, useState } from 'react'
import { get } from '../lib/api'
import { dateTimeMX } from '../lib/format'
import { useNavigate } from '../lib/router'
import { useSession } from '../lib/session'
import { Brandmark } from '../components/Brandmark'
import { Dialog } from '../components/Dialog'
import { Screen } from '../components/Screen'
import { CloseControl, SESSION_KEY, type CloseControlHandle } from './SalesSession'

const TILES = [
  { to: '/sesion', label: 'Nueva sesión' },
  { to: '/pagos', label: 'Registrar pago' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/gastos', label: 'Registrar gasto' },
]

interface OpenSession {
  id: number; stage: string; device_label: string; opened_at: string; last_seen: string
  bride_name: string | null; bride_apellido: string | null
}

/** Cómo se nombra cada etapa en el aviso de sesiones abiertas — no es la
 * misma lista que los títulos de pantalla: aquí hacen falta las de ver y
 * probar, que en la pantalla no llevan título propio. */
const STAGE_LABEL: Record<string, string> = {
  browsing: 'Viendo el catálogo', fitting: 'Probándose vestidos', selected: 'Datos de la novia',
  bride_data: 'Hoja de medidas', sheet_printed: 'Foto de la hoja firmada', sheet_signed: 'Plan de pago',
  terms: 'Imprimir el contrato', contract_printed: 'Foto del contrato firmado',
  signed: 'Contrato firmado, cobrando', payment: 'Contrato firmado, cobrando',
}

export function Tiles() {
  const navigate = useNavigate()
  const { me, logout } = useSession()
  const [openSessions, setOpenSessions] = useState<OpenSession[] | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const closeRef = useRef<CloseControlHandle>(null)

  // El `ref` sólo queda montado hasta después de este renglón: abrir su NIP
  // aquí, en cuanto cambia a qué sesión se va a cerrar.
  useEffect(() => { if (closingId !== null) closeRef.current?.open() }, [closingId])

  // El nombre de la sucursal ya trae la marca, y el nombre sembrado puede
  // coincidir con el rol: ninguno de los dos se repite.
  const place = me?.store_name.split('·').pop()?.trim()
  const role = me?.role === 'owner' ? 'Dueña' : 'Vendedora'
  const who = me?.name === role ? role : `${me?.name} · ${role}`

  /*
   * El caso normal, no la excepción: la tableta se apaga a media cita y se
   * vuelve a prender más tarde, o la agarra otra persona. Si esta misma
   * tableta ya sabe de una sesión suya, se sigue como siempre —la resuelve la
   * propia pantalla de venta—. Si no, se pregunta primero: la sucursal puede
   * tener una sesión abierta que nadie está viendo.
   */
  async function startNewSession() {
    if (localStorage.getItem(SESSION_KEY)) { navigate('/sesion'); return }
    try {
      const { data } = await get<{ open: OpenSession[] }>('/sessions/open')
      if (data.open.length === 0) { navigate('/sesion'); return }
      setOpenSessions(data.open)
    } catch {
      // Sin poder preguntar, mejor dejarla trabajar que dejarla varada.
      navigate('/sesion')
    }
  }

  function resume(session: OpenSession) {
    localStorage.setItem(SESSION_KEY, String(session.id))
    navigate('/sesion')
  }

  return (
    // La única pantalla con (X): aquí sí significa salir del sistema.
    <Screen title={<Brandmark />} onClose={() => void logout()} closeLabel="Salir">
      {/*
        Centrado en la pantalla de verdad —arriba/abajo y a los lados—, no
        sólo en el hueco que deja la barra: el mismo anclaje fijo que usa el
        teclado del NIP, para que el bloque completo quede a medio camino
        entre el borde de arriba y el de abajo sin importar la barra.
      */}
      <div className="tiles-stage">
        <div className="tiles-anchor">
          <p className="lede" style={{ margin: 0 }}>{place} · {who}</p>

          <div className="tiles">
            {TILES.map((tile) => (
              <button
                key={tile.to}
                type="button"
                className="btn-main"
                onClick={() => (tile.to === '/sesion' ? void startNewSession() : navigate(tile.to))}
              >
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
        </div>
      </div>

      {openSessions && (
        <Dialog
          title={openSessions.length === 1 ? 'Ya hay una sesión abierta' : `Ya hay ${openSessions.length} sesiones abiertas`}
          onCancel={() => setOpenSessions(null)}
          closeLabel="Cancelar"
          big
        >
          <p className="lede">
            Antes de abrir una nueva, dile qué hacer con {openSessions.length === 1 ? 'ésta' : 'cada una'}.
            «Continuar» la retoma tal como se quedó —etapa, favoritos y selección—; «Cerrarla» pide el
            resultado, como al cerrar cualquier sesión, y luego abre la nueva.
          </p>
          <div className="stack">
            {openSessions.map((session) => {
              const bride = [session.bride_name, session.bride_apellido].filter(Boolean).join(' ')
              return (
                <div key={session.id} className="panel">
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', margin: 0 }}>
                    {bride || 'Sin nombre de novia todavía'}
                  </p>
                  <p className="muted" style={{ margin: 'var(--space-2) 0 var(--space-7)' }}>
                    {STAGE_LABEL[session.stage] ?? session.stage} · abierta desde {dateTimeMX(session.opened_at)}
                  </p>
                  <div className="row">
                    <button type="button" className="btn-main" onClick={() => resume(session)}>Continuar</button>
                    <button type="button" className="btn-quiet" onClick={() => setClosingId(session.id)}>Cerrarla</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Dialog>
      )}

      {/*
        El mismo NIP + motivo de siempre, sin botón propio (trigger nulo):
        aquí lo dispara el «Cerrarla» de arriba. La lista de sesiones sigue
        montada debajo — si la vendedora cancela a media pregunta, vuelve a
        verse tal como la dejó, sin quedar varada en una pantalla en blanco.
      */}
      {closingId !== null && (
        <CloseControl
          key={closingId}
          ref={closeRef}
          sessionId={closingId}
          trigger={() => null}
          onClosed={() => { setClosingId(null); setOpenSessions(null); navigate('/sesion') }}
        />
      )}
    </Screen>
  )
}
