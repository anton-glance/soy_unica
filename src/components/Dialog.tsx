import type { ReactNode } from 'react'

/** Diálogo de confirmación: siempre con salida, siempre en español. */
export function Dialog({
  title, children, onCancel, cancelLabel = 'Regresar', actions,
}: {
  title: string
  children?: ReactNode
  onCancel: () => void
  cancelLabel?: string
  actions: ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(43,35,32,0.45)',
        display: 'grid', placeItems: 'center', padding: 'var(--space-5)', zIndex: 50,
      }}
    >
      <div className="card stack" style={{ maxWidth: 560, width: '100%', boxShadow: 'var(--shadow-2)' }}>
        <h2>{title}</h2>
        {children}
        <div className="row row--wrap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
          {actions}
        </div>
      </div>
    </div>
  )
}
