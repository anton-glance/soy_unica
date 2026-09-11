import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

/**
 * Diálogo del prototipo: velo a pantalla completa con una hoja al centro.
 *
 * Lleva el mismo tratamiento de título que <Screen>: centrado, en la letra de
 * display, con la cruz arriba a la derecha y su hueco reservado a la izquierda
 * para que el título quede al centro de verdad. Un diálogo no tiene regreso:
 * se cierra con la cruz.
 */
export function Dialog({
  title, children, onCancel, closeLabel = 'Cerrar', actions, narrow, full, big,
}: {
  title: string
  children?: ReactNode
  onCancel: () => void
  closeLabel?: string
  actions?: ReactNode
  narrow?: boolean
  full?: boolean
  big?: boolean
}) {
  return (
    <div
      className={`veil${full ? ' full' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className={`sheet${narrow ? ' sheet-narrow' : ''}`}>
        <div className="sheet-head">
          <div className="sheet-head__slot" />
          <h2>{title}</h2>
          <div className="sheet-head__slot sheet-head__slot--end">
            <IconButton kind="close" label={closeLabel} onClick={onCancel} size={big ? 'lg' : 'md'} />
          </div>
        </div>
        {children}
        {actions && <div className="row" style={{ marginTop: 'var(--space-11)' }}>{actions}</div>}
      </div>
    </div>
  )
}
