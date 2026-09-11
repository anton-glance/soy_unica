/**
 * Los dos controles que se repiten en toda la aplicación: regresar, arriba a
 * la izquierda, y cerrar, arriba a la derecha. Siempre en la misma esquina,
 * siempre del mismo tamaño y con el mismo trazo, para que la vendedora los
 * encuentre sin leer.
 */
export function IconButton({
  kind, label, onClick, size = 'md', tone = 'light',
}: {
  kind: 'back' | 'close'
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
        {kind === 'back'
          ? <><path d="M15 5 8 12l7 7" /></>
          : <><path d="M6 6l12 12M18 6L6 18" /></>}
      </svg>
    </button>
  )
}
