import { useEffect, useState } from 'react'
import { get } from '../lib/api'
import logo from '../assets/logo-soy-unica.jpg'
import type { ContractPrint } from './printTypes'

/**
 * Contrato. Va impreso al reverso de las mismas dos hojas de medidas, así que
 * la pantalla recuerda cómo volver a meterlas a la bandeja.
 *
 * El cuerpo es `stores.contract_template` —el contrato real de la tienda,
 * palabra por palabra— con sus marcadores ya resueltos en el servidor. La
 * dueña lo edita en Ajustes sin tocar código.
 */
export function PrintContrato({ folio }: { folio: string }) {
  const [data, setData] = useState<ContractPrint | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    get<ContractPrint>(`/contracts/${encodeURIComponent(folio)}/print`)
      .then(({ data: d }) => setData(d))
      .catch((err: Error) => setError(err.message))
  }, [folio])

  useEffect(() => {
    if (data) document.title = `Contrato ${data.contract.folio}`
  }, [data])

  if (error) return <div className="wrap"><p className="err">{error}</p></div>
  if (!data) return <div className="wrap"><span className="spinner" aria-hidden="true" /></div>

  return (
    <>
      <div className="print-toolbar">
        <button type="button" className="btn-quiet" onClick={() => window.history.back()}>Regresar</button>
        <button type="button" className="btn-main" onClick={() => window.print()}>Imprimir</button>
        <p className="pill pill--brass">Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo.</p>
      </div>

      {[1, 2].map((copy) => (
        <section key={copy} className={`print-sheet print-sheet--contract ${copy === 1 ? 'print-page-break' : ''}`}>
          <header className="print-letterhead">
            <img src={logo} alt="Soy Única Novias" />
            <div>
              <div className="print-folio">{data.contract.folio}</div>
              <address>{data.store?.address}</address>
            </div>
          </header>
          <hr className="print-rule" />
          <div className="print-body">
            {/*
              El texto de la plantilla se corta en párrafos por los renglones
              en blanco. Así el contrato completo cabe en una página —el
              reverso de la hoja de medidas— sin encoger más la letra: un
              renglón vacío costaría una línea entera.
            */}
            {data.contract_body.split(/\n\s*\n/).map((block, i) => (
              <p key={i}>
                {block.split('\n').map((line, j, all) => (
                  <span key={j}>{line}{j < all.length - 1 && <br />}</span>
                ))}
              </p>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
