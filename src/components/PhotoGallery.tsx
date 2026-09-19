import { useRef, useState } from 'react'
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
/** Un dedo se movió al menos esto en horizontal, y más en horizontal que en
 * vertical, para contar como deslizar y no como un toque o un scroll. */
const SWIPE_THRESHOLD_PX = 40

export function PhotoGallery({ photos, itemId, alt = '' }: { photos: string[]; itemId: number; alt?: string }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const current = photos[Math.min(active, photos.length - 1)]
  const touch = useRef<{ x: number; y: number } | null>(null)

  function step(dir: 1 | -1) {
    setActive((i) => Math.min(Math.max(i + dir, 0), photos.length - 1))
  }

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
        <div
          className="lightbox"
          onClick={() => setOpen(false)}
          onTouchStart={(e) => {
            const t = e.touches[0]
            if (t) touch.current = { x: t.clientX, y: t.clientY }
          }}
          onTouchEnd={(e) => {
            const start = touch.current
            const end = e.changedTouches[0]
            touch.current = null
            if (!start || !end || photos.length < 2) return
            const dx = end.clientX - start.x
            const dy = end.clientY - start.y
            if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
          }}
        >
          {/* La misma (X) redonda de siempre — sólo con un fondo desenfocado
              propio, porque aquí atrás puede haber cualquier color. */}
          <div className="lightbox__close">
            <IconButton kind="close" label="Cerrar" onClick={() => setOpen(false)} tone="dark" size="lg" />
          </div>
          {photos.length > 1 && (
            <>
              {active > 0 && (
                <button
                  type="button"
                  className="lightbox__nav lightbox__nav--prev"
                  aria-label="Foto anterior"
                  onClick={(e) => { e.stopPropagation(); step(-1) }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 5 8 12l7 7" />
                  </svg>
                </button>
              )}
              {active < photos.length - 1 && (
                <button
                  type="button"
                  className="lightbox__nav lightbox__nav--next"
                  aria-label="Foto siguiente"
                  onClick={(e) => { e.stopPropagation(); step(1) }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <span className="lightbox__count">{active + 1} / {photos.length}</span>
            </>
          )}
          <img src={`/api/files/${current}`} alt={alt} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
