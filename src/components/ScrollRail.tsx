import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * La fila de favoritos se desliza, pero nada lo decía: quedaba una fila
 * cortada a la mitad sin ninguna pista de que hay más para el lado. Aquí se le
 * ponen flechas circulares, una a cada lado, que sólo aparecen cuando de
 * verdad hay algo que desplazar y se apagan en su propio extremo —la de la
 * izquierda al llegar al principio, la de la derecha al llegar al final—.
 */
export function ScrollRail({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setOverflowing(el.scrollWidth > el.clientWidth + 1)
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    // El número de tarjetas puede cambiar (se quita un favorito): revisa de nuevo.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [update, children])

  function step(dir: 1 | -1) {
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="rail">
      <div className={className ? `fav-rail ${className}` : 'fav-rail'} ref={ref}>
        {children}
      </div>
      {overflowing && !atStart && (
        <button type="button" className="icon-btn rail__arrow rail__arrow--prev" aria-label="Ver anteriores" onClick={() => step(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
      )}
      {overflowing && !atEnd && (
        <button type="button" className="icon-btn rail__arrow rail__arrow--next" aria-label="Ver siguientes" onClick={() => step(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}
