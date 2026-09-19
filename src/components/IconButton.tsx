/**
 * Los dos controles que se repiten en toda la aplicación: regresar, arriba a
 * la izquierda, y cerrar, arriba a la derecha. Siempre en la misma esquina,
 * siempre del mismo tamaño y con el mismo trazo, para que la vendedora los
 * encuentre sin leer.
 */
export function IconButton({
  kind, label, onClick, size = 'md', tone = 'light',
}: {
  kind: 'back' | 'close' | 'settings'
  label: string
  onClick: () => void
  size?: 'md' | 'lg'
  tone?: 'light' | 'dark'
}) {
  return (
    <button
      type="button"
      className={`icon-btn${size === 'lg' ? ' icon-btn--lg' : ''}${tone === 'dark' ? ' icon-btn--onDark' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'back' && <path d="M15 5 8 12l7 7" />}
        {kind === 'close' && <path d="M6 6l12 12M18 6L6 18" />}
        {kind === 'settings' && (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </>
        )}
      </svg>
    </button>
  )
}
