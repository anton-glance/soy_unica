import { useId, useState } from 'react'
import { ImageTooLargeError, prepareImage, type PhotoKind } from '../lib/image'
import { ApiError, OfflineError, upload } from '../lib/api'
import { bytes } from '../lib/format'

/**
 * Toma la foto con la cámara trasera, la comprime en la tableta y la sube.
 * Es la única forma de que una foto entre al sistema.
 */
export function PhotoCapture({
  kind, contractId, label, onUploaded,
}: {
  kind: PhotoKind
  contractId?: number
  label: string
  onUploaded: (fileId: string) => void | Promise<void>
}) {
  const id = useId()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setState('busy')
    setError(null)
    try {
      const prepared = await prepareImage(file, kind)
      const { id: fileId } = await upload(prepared.blob, kind, {
        contract_id: contractId, width: prepared.width, height: prepared.height,
      })
      setSize(prepared.blob.size)
      await onUploaded(fileId)
      setState('done')
    } catch (err) {
      setState('idle')
      setError(
        err instanceof ImageTooLargeError || err instanceof ApiError || err instanceof OfflineError
          ? err.message
          : 'No se pudo subir la foto. Vuelve a tomarla.',
      )
    }
  }

  return (
    <div className="stack">
      <label htmlFor={id} className="btn btn--primary" style={{ cursor: 'pointer' }}>
        {state === 'busy' && <span className="spinner" aria-hidden="true" />}
        {state === 'busy' ? 'Subiendo la foto…' : state === 'done' ? 'Foto guardada' : label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      {state === 'done' && size !== null && (
        <span className="notice notice--ok">Se guardó la foto ({bytes(size)}).</span>
      )}
      {error && <span className="notice notice--error" role="alert">{error}</span>}
    </div>
  )
}
