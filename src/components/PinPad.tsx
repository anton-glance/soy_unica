import { useState } from 'react'
import { IconButton } from './IconButton'

/**
 * El teclado del NIP. Es el mismo en los tres lugares donde se pide: al entrar,
 * al cerrar la sesión de venta y al pasar la tableta de la novia a la
 * vendedora. Los puntos son llenos y con contraste para verlos de lejos, y la
 * tecla de confirmar va llena porque es la acción.
 */
export function PinPad({
  title, hint, error, busy, onSubmit, onBack, backLabel = 'Regresar', footer,
}: {
  title: string
  hint?: string
  error?: string | null
  busy?: boolean
  onSubmit: (pin: string) => void | Promise<void>
  onBack?: () => void
  backLabel?: string
  footer?: React.ReactNode
}) {
  const [pin, setPin] = useState('')
  const [local, setLocal] = useState<string | null>(null)

  const press = (digit: string) => {
    setLocal(null)
    setPin((current) => (current.length >= 6 ? current : current + digit))
  }

  function confirm() {
    if (pin.length < 4) {
      setLocal('Escribe tu NIP de 4 a 6 dígitos.')
      return
    }
    const value = pin
    setPin('')
    void onSubmit(value)
  }

  return (
    <>
      {onBack && (
        <div className="screen-nav">
          <div className="screen-nav__slot"><IconButton kind="back" label={backLabel} onClick={onBack} /></div>
          <div />
          <div className="screen-nav__slot screen-nav__slot--end" />
        </div>
      )}

      <div className="entry">
        <h1>{title}</h1>
        {hint && <p className="lede">{hint}</p>}

        <div className="entry__pin">
          <div className="pindots" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
          </div>
          <p className="err" role="alert">{local ?? error ?? ''}</p>

          <div className="pinpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button key={digit} type="button" onClick={() => press(digit)}>{digit}</button>
            ))}
            <button type="button" className="is-quiet" onClick={() => setPin((p) => p.slice(0, -1))}>borrar</button>
            <button type="button" onClick={() => press('0')}>0</button>
            <button type="button" className="is-confirm" onClick={confirm} disabled={busy} aria-label="Confirmar">
              {busy ? <span className="spinner" aria-hidden="true" /> : '✓'}
            </button>
          </div>

          {footer}
        </div>
      </div>
    </>
  )
}
