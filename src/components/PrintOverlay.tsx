import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Las hojas se imprimen encima de la sesión, no en otra pestaña: cuando la
 * vendedora cierra el diálogo de impresión sigue exactamente donde estaba. Va
 * por un portal fuera de #root para que al imprimir baste con esconder #root y
 * quede sólo la hoja.
 */
export function PrintOverlay({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('is-printing')
    return () => document.documentElement.classList.remove('is-printing')
  }, [])

  return createPortal(<div className="print-overlay">{children}</div>, document.body)
}
