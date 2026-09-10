import { useId, type ReactNode } from 'react'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="err" style={{ color: 'var(--ink-faint)' }}>{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  )
}

/** Chips del prototipo: una fila que envuelve, con aria-pressed. */
export function Chips<T extends string>({
  options, value, onChange, label, small,
}: {
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  label: string
  small?: boolean
}) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 var(--space-9)' }}>
      <legend>{label}</legend>
      <div className="row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={small ? 'chip chip--sm' : 'chip'}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
