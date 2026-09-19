import { useState } from 'react'
import { GownArt } from './GownArt'
import { IconButton } from './IconButton'

/**
 * Una foto grande y, si hay más de una, una tira de miniaturas debajo para
 * cambiar cuál se ve. Tocar la foto grande la abre a pantalla completa, con
 * sólo una (X) grande para cerrar. Sin fotos, cae al dibujo genérico.
 *
 * Vive aparte de `.card`/`.pick-card`: esas clases sólo dan estilo a `.art`
 * dentro de su propio contenedor. Antes esta vista usaba `.art` suelto, sin
 * ningún contenedor que lo recortara — la foto se pintaba a su tamaño
 * natural y se encimaba con el texto de al lado.
 */
export function PhotoGallery({ photos, itemId, alt = '' }: { photos: string[]; itemId: number; alt?: string }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const current = photos[Math.min(active, photos.length - 1)]

  return (
    <div className="gallery">
      <button
        type="button"
        className="gallery__main"
        onClick={() => { if (current) setOpen(true) }}
        aria-label={current ? 'Ver la foto en pantalla completa' : undefined}
      >
        {current ? <img src={`/api/files/${current}`} alt={alt} /> : <GownArt seed={itemId} className="art" />}
      </button>

      {photos.length > 1 && (
        <div className="gallery__thumbs">
          {photos.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`gallery__thumb${i === active ? ' is-active' : ''}`}
              aria-pressed={i === active}
              aria-label={`Foto ${i + 1} de ${photos.length}`}
              onClick={() => setActive(i)}
            >
              <img src={`/api/files/${id}`} alt="" />
            </button>
          ))}
        </div>
      )}

      {open && current && (
        <div className="lightbox" onClick={() => setOpen(false)}>
          {/* La misma (X) redonda de siempre — sólo con un fondo desenfocado
              propio, porque aquí atrás puede haber cualquier color. */}
          <div className="lightbox__close">
            <IconButton kind="close" label="Cerrar" onClick={() => setOpen(false)} tone="dark" size="lg" />
          </div>
          <img src={`/api/files/${current}`} alt={alt} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
