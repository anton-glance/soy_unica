import { useId, useState } from 'react'
import { ImageTooLargeError, prepareImage } from '../lib/image'
import { ApiError, OfflineError, upload } from '../lib/api'

export interface Shot { file_id: string; url: string }

/**
 * Hasta cinco fotos del artículo, una marcada como principal. Usa el mismo
 * redimensionado en la tableta que el resto: la foto se comprime antes de
 * subirse, nunca viaja el original de la cámara.
 */
export function PhotoSet({ photos, primary, onChange, max = 5 }: {
  photos: Shot[]
  primary: string | null
  onChange: (photos: Shot[], primary: string | null) => void
  max?: number
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = photos.length >= max

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    const added: Shot[] = []
    try {
      for (const file of files.slice(0, max - photos.length)) {
        const prepared = await prepareImage(file, 'item_photo')
        const { id: fileId } = await upload(prepared.blob, 'item_photo', { width: prepared.width, height: prepared.height })
        added.push({ file_id: fileId, url: URL.createObjectURL(prepared.blob) })
      }
      const next = [...photos, ...added]
      onChange(next, primary ?? next[0]?.file_id ?? null)
    } catch (err) {
      setError(
        err instanceof ImageTooLargeError || err instanceof ApiError || err instanceof OfflineError
          ? err.message
          : 'No se pudo subir la foto. Vuelve a tomarla.',
      )
    } finally {
      setBusy(false)
    }
  }

  function remove(fileId: string) {
    const next = photos.filter((p) => p.file_id !== fileId)
    onChange(next, primary === fileId ? (next[0]?.file_id ?? null) : primary)
  }

  return (
    <>
      <div className="shots">
        {photos.map((p) => (
          <figure key={p.file_id} className={`shots__one${primary === p.file_id ? ' is-primary' : ''}`}>
            <img src={p.url} alt="" />
            <figcaption>
              <button
                type="button"
                className="chip chip--sm"
                aria-pressed={primary === p.file_id}
                onClick={() => onChange(photos, p.file_id)}
              >
                {primary === p.file_id ? 'Principal' : 'Hacer principal'}
              </button>
              <button type="button" className="btn-quiet" onClick={() => remove(p.file_id)}>Quitar</button>
            </figcaption>
          </figure>
        ))}

        {!full && (
          <>
            <label htmlFor={id} className="shots__add">
              {busy && <span className="spinner" aria-hidden="true" />}
              <span>{busy ? 'Subiendo…' : 'Agregar foto'}</span>
              <em>{photos.length} de {max}</em>
            </label>
            <input
              id={id}
              type="file"
              accept="image/*"
              multiple
              onChange={onPick}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
          </>
        )}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </>
  )
}
