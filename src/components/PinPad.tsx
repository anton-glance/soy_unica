import { useState, type ReactNode } from 'react'

/**
 * El teclado del NIP. Es el mismo en los tres lugares donde se pide: al entrar,
 * al cerrar la sesión de venta y al pasar la tableta de la novia a la
 * vendedora.
 *
 * Queda centrado con la tecla 5 en el centro exacto de la pantalla, y los
 * puntos muestran cuántos dígitos se llevan escritos —no seis círculos fijos
 * que no dicen nada.
 */
export function PinPad({
  hint, error, busy, onSubmit,
}: {
  hint?: ReactNode
  error?: string | null
  busy?: boolean
  onSubmit: (pin: string) => void | Promise<void>
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
    <div className="pin-stage">
      <div className="pin-anchor">
        <div className="pindots" aria-hidden="true">
          {Array.from({ length: pin.length }, (_, i) => <span key={i} className="on" />)}
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

        {hint && <p className="pin-anchor__hint">{hint}</p>}
      </div>
    </div>
  )
}
