import { useEffect, useState } from 'react'
import { get } from '../lib/api'
import type { ContractPrint } from './printTypes'

/**
 * Contrato. Va impreso al reverso de las mismas dos hojas de medidas, así que
 * la pantalla recuerda cómo volver a meterlas a la bandeja.
 *
 * El cuerpo es `stores.contract_template` con sus marcadores ya resueltos en
 * el servidor: la dueña lo edita en Ajustes sin tocar código.
 */
export function PrintContrato({ folio }: { folio: string }) {
  const [data, setData] = useState<ContractPrint | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    get<ContractPrint>(`/contracts/${encodeURIComponent(folio)}/print`)
      .then(({ data: d }) => setData(d))
      .catch((err: Error) => setError(err.message))
  }, [folio])

  if (error) return <div className="page"><p className="notice notice--error">{error}</p></div>
  if (!data) return <div className="page"><span className="spinner" aria-hidden="true" /></div>

  return (
    <>
      <div className="print-toolbar">
        <button type="button" className="btn" onClick={() => window.history.back()}>Regresar</button>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>Imprimir</button>
      </div>
      <p className="notice notice--warn print-toolbar" style={{ textAlign: 'center' }}>
        Vuelve a poner las 2 hojas en la bandeja, cara impresa hacia abajo.
      </p>

      {[1, 2].map((copy) => (
        <section key={copy} className={`print-sheet ${copy === 1 ? 'print-page-break' : ''}`}>
          <header className="print-head">
            <span className="print-folio">{data.contract.folio}</span>
            <h1 className="print-title">Contrato</h1>
            <div className="print-sub">Copia {copy} de 2 — reverso de la hoja de medidas</div>
          </header>
          <div className="print-body">{data.contract_body}</div>
        </section>
      ))}
    </>
  )
}
