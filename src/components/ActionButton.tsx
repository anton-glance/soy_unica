import { useState, type ReactNode } from 'react'
import { ApiError, OfflineError } from '../lib/api'

/**
 * Un botón que hace un cambio. Siempre muestra los tres estados: cargando,
 * hecho y error, y el error dice qué hacer, no sólo qué falló.
 */
export function ActionButton({
  children, onAction, className = 'btn-main', done = 'Listo', disabled, confirm,
}: {
  children: ReactNode
  onAction: () => Promise<unknown>
  className?: string
  done?: string
  disabled?: boolean
  confirm?: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function click() {
    if (confirm && !window.confirm(confirm)) return
    setState('busy')
    setError(null)
    try {
      await onAction()
      setState('done')
      window.setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 2000)
    } catch (err) {
      setState('idle')
      setError(
        err instanceof ApiError || err instanceof OfflineError
          ? err.message
          : 'Algo falló. Vuelve a intentar; si sigue igual, avísale a la dueña.',
      )
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={click} disabled={disabled || state === 'busy'}>
        {state === 'busy' && <span className="spinner" aria-hidden="true" />}
        {state === 'busy' ? 'Guardando…' : state === 'done' ? done : children}
      </button>
      {error && <p className="err" role="alert">{error}</p>}
    </>
  )
}
