import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

/**
 * Diálogo del prototipo: velo a pantalla completa con una hoja al centro. Se
 * cierra con la cruz de arriba a la derecha, en la misma posición que en el
 * resto de la aplicación.
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
          <h2>{title}</h2>
          <IconButton kind="close" label={closeLabel} onClick={onCancel} size={big ? 'lg' : 'md'} />
        </div>
        {children}
        {actions && <div className="row" style={{ marginTop: 'var(--space-11)' }}>{actions}</div>}
      </div>
    </div>
  )
}
