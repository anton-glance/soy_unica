import { useEffect, useState } from 'react'
import { get } from '../lib/api'
import { dateMX } from '../lib/format'
import type { ContractPrint } from './printTypes'

/**
 * Hoja de medidas. Se imprimen dos copias; el contrato va al reverso de estas
 * mismas dos hojas.
 *
 * Los datos de la novia y el folio salen impresos; TODOS los campos de medida
 * salen en blanco, para llenarse a mano. No existe ni un campo numérico de
 * medidas en el sistema: la evidencia es la foto de la hoja firmada.
 *
 * ⚠ La lista de campos y el orden son provisionales hasta que esté
 * docs/medidas_soy_unica_mty.docx en el repositorio: ese formato se reproduce
 * tal cual, sin rediseñar. Los tres bloques de firma —medidas, ajustes y
 * entrega— ya están, porque la misma hoja física se firma tres veces a lo
 * largo de la vida del vestido.
 */
const MEDIDAS = [
  'Busto', 'Bajo busto', 'Cintura', 'Cadera', 'Cadera alta',
  'Alto de busto', 'Separación de busto', 'Talle delantero', 'Talle espalda', 'Hombro a hombro',
  'Ancho de espalda', 'Sisa', 'Contorno de brazo', 'Largo de manga', 'Puño',
  'Largo total delantero', 'Largo total espalda', 'Largo de cola', 'Altura con zapato', 'Cintura a rodilla',
]

const AJUSTES = ['Bastilla', 'Mangas', 'Hombros', 'Cinto', 'Crinolina', 'Otro']

export function PrintMedidas({ folio }: { folio: string }) {
  const [data, setData] = useState<ContractPrint | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    get<ContractPrint>(`/contracts/${encodeURIComponent(folio)}/print`)
      .then(({ data: d }) => setData(d))
      .catch((err: Error) => setError(err.message))
  }, [folio])

  if (error) return <div className="page"><p className="notice notice--error">{error}</p></div>
  if (!data) return <div className="page"><span className="spinner" aria-hidden="true" /></div>

  const bride = `${data.customer?.name ?? ''} ${data.customer?.apellido ?? ''}`.trim()

  return (
    <>
      <div className="print-toolbar">
        <button type="button" className="btn" onClick={() => window.history.back()}>Regresar</button>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>Imprimir</button>
      </div>

      {[1, 2].map((copy) => (
        <section key={copy} className={`print-sheet ${copy === 1 ? 'print-page-break' : ''}`}>
          <header className="print-head">
            <span className="print-folio">{data.contract.folio}</span>
            <h1 className="print-title">Hoja de medidas</h1>
            <div className="print-sub">
              {data.store?.name} · {data.store?.address}
            </div>
            <div className="print-sub">Copia {copy} de 2 · Fecha: {dateMX(new Date().toISOString().slice(0, 10))}</div>
          </header>

          <div className="print-section">
            <div className="print-section__title">Datos de la clienta</div>
            <div className="print-grid print-grid--2">
              <Filled label="Nombre" value={bride} />
              <Filled label="Teléfono" value={data.customer?.phone ?? ''} />
              <Filled label="Fecha del evento" value={dateMX(data.customer?.wedding_date)} />
              <Filled label="Modelo / código" value={`${data.item?.name ?? ''} ${data.item?.code ? `(${data.item.code})` : ''}`} />
            </div>
          </div>

          <div className="print-section">
            <div className="print-section__title">Medidas (en centímetros)</div>
            <div className="print-grid print-grid--3">
              {MEDIDAS.map((label) => <Blank key={label} label={label} />)}
            </div>
          </div>

          <div className="print-section">
            <div className="print-section__title">Ajustes acordados</div>
            <div className="print-grid print-grid--3">
              {AJUSTES.map((label) => <Blank key={label} label={label} />)}
            </div>
            <div className="print-grid print-grid--1" style={{ marginTop: '3mm' }}>
              <Blank label="Notas" />
            </div>
          </div>

          <div className="print-section">
            <div className="print-section__title">Entrega</div>
            <div className="print-grid print-grid--3">
              <Blank label="Fecha de entrega" />
              <Blank label="Recibió" />
              <Blank label="Identificación" />
            </div>
          </div>

          <div className="print-signatures">
            <Signature caption="Firma de la clienta — medidas tomadas" />
            <Signature caption="Firma de la clienta — ajustes conformes" />
          </div>
          <div className="print-signatures">
            <Signature caption="Firma de la clienta — vestido recibido" />
            <Signature caption={`Por ${data.store?.name ?? 'la tienda'}`} />
          </div>

          <p className="print-note">
            Esta hoja forma parte del contrato {data.contract.folio}. Las medidas se toman una sola
            vez y se firman en el momento; los ajustes y la entrega se firman en esta misma hoja.
          </p>
        </section>
      ))}
    </>
  )
}

function Blank({ label }: { label: string }) {
  return (
    <div className="print-line">
      <span className="print-line__label">{label}</span>
      <span className="print-line__rule" />
    </div>
  )
}

function Filled({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-line">
      <span className="print-line__label">{label}</span>
      <span className="print-line__value">{value}</span>
    </div>
  )
}

function Signature({ caption }: { caption: string }) {
  return (
    <div className="print-signature">
      <div className="print-signature__rule">{caption}</div>
    </div>
  )
}
