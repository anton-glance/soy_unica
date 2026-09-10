import type { ReactNode } from 'react'

/** Diálogo del prototipo: velo a pantalla completa con una hoja al centro. */
export function Dialog({
  title, children, onCancel, cancelLabel = 'Regresar', actions, narrow, full,
}: {
  title: string
  children?: ReactNode
  onCancel: () => void
  cancelLabel?: string
  actions?: ReactNode
  narrow?: boolean
  full?: boolean
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
        <div className="inv-head">
          <h2>{title}</h2>
          <button type="button" className="btn-quiet" onClick={onCancel}>{cancelLabel}</button>
        </div>
        {children}
        {actions && <div className="row" style={{ marginTop: 'var(--space-11)' }}>{actions}</div>}
      </div>
    </div>
  )
}
