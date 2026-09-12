import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

/**
 * El marco de TODAS las pantallas. Ninguna pantalla dibuja su propia cabecera.
 *
 * La barra es fija, siempre de la misma altura, y sus tres huecos existen
 * siempre aunque estén vacíos: así nada se mueve de lugar al cambiar de
 * pantalla y la vendedora encuentra el regreso sin mirar.
 *
 *   · izquierda — regresar, sólo si la pantalla tiene una pantalla padre
 *   · centro    — el título de la pantalla, uno y sólo uno
 *   · derecha   — la (X) de salir, únicamente en la pantalla de los cuadros
 *
 * Los diálogos no usan esto: llevan su propia (X) en su esquina y no tienen
 * regreso.
 */
export function Screen({
  title, onBack, backLabel = 'Regresar', onClose, closeLabel = 'Salir', right, center, children, footer,
}: {
  title: ReactNode
  onBack?: () => void
  backLabel?: string
  onClose?: () => void
  closeLabel?: string
  /**
   * Reemplaza la (X) del hueco derecho por lo que haga falta ahí — el kiosco
   * pone «Sesión abierta» y «Cerrar sesión», que son del kiosco y no una
   * salida del sistema. Sólo una pantalla necesita las dos cosas a la vez, así
   * que nunca hay que combinarlas.
   */
  right?: ReactNode
  /** Centra el contenido en el alto disponible (entrada, NIP, avisos). */
  center?: boolean
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <>
      <header className="topbar">
        <div className="topbar__slot">
          {onBack && <IconButton kind="back" label={backLabel} onClick={onBack} />}
        </div>
        <h1 className="topbar__title">{title}</h1>
        <div className="topbar__slot topbar__slot--end">
          {right ?? (onClose && <IconButton kind="close" label={closeLabel} onClick={onClose} />)}
        </div>
      </header>

      <main className={center ? 'screen screen--center' : 'screen'}>{children}</main>
      {footer && <div className="screen__footer">{footer}</div>}
    </>
  )
}
