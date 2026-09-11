import { useEffect, useState } from 'react'
import { get } from '../lib/api'
import { Screen } from '../components/Screen'
import { dateMX } from '../lib/format'
// En papel va la versión en tinta sobre transparente: sin el recuadro negro
// del documento, que además se comería el tóner.
import logo from '../assets/brand/logo-ink.png'
import diagrama from '../assets/medidas-diagrama.jpg'
import type { ContractPrint } from './printTypes'

/**
 * Hoja de medidas: el formato real de la tienda
 * (docs/medidas_soy_unica_mty.docx), reproducido tal cual.
 *
 * De ese documento salen, en este orden: el membrete con el logo y la
 * dirección, el bloque de campos, el diagrama de medidas, el párrafo de
 * conformidad y los tres bloques de firma: medidas, ajustes y entrega. La
 * misma hoja física se firma tres veces a lo largo de la vida del vestido.
 *
 * El bloque de campos va UNA vez. En el XML del .docx parece venir dos veces,
 * pero son las dos ramas de un mc:AlternateContent —mc:Choice con el dibujo
 * moderno y mc:Fallback con el mismo cuadro de texto en VML—; un extractor que
 * recorre el árbol completo cuenta las dos y ve un duplicado que no existe.
 *
 * Los datos de la novia y el folio salen impresos. Las trece medidas salen en
 * blanco, para llenarse a mano: no existe ni un campo numérico de medidas en
 * el sistema, y la evidencia es la foto de la hoja firmada.
 *
 * Se imprimen dos copias; el contrato va al reverso de estas mismas dos hojas.
 */

/** Las trece medidas del formato, en el orden exacto del documento. */
const MEDIDAS = [
  'Busto', 'Cintura', 'Caderas', 'Altura', 'Hueco de Piso', 'Tacones',
  'Ancho del brazo', 'Ancho del hombro', 'Hombro a hombro', 'Largo de brazo',
  'Altura de axila', 'cintura a piso', 'Bíceps',
]

export function PrintMedidas({ folio, onBack }: { folio: string; onBack?: () => void }) {
  const [data, setData] = useState<ContractPrint | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    get<ContractPrint>(`/contracts/${encodeURIComponent(folio)}/print`)
      .then(({ data: d }) => setData(d))
      .catch((err: Error) => setError(err.message))
  }, [folio])

  useEffect(() => {
    if (data) document.title = `Medidas ${data.contract.folio}`
  }, [data])

  const back = onBack ?? (() => window.history.back())

  if (error) {
    return <Screen title="Hoja de medidas" onBack={back} backLabel="Regresar a la sesión"><div className="wrap"><p className="err">{error}</p></div></Screen>
  }
  if (!data) return <Screen title="Hoja de medidas" onBack={back} backLabel="Regresar a la sesión" center><span className="spinner" aria-hidden="true" /></Screen>

  const fields = {
    'Nombre de novia': data.customer?.name ?? '',
    'Apellido de novia': data.customer?.apellido ?? '',
    'Fecha de evento': data.customer?.wedding_date ? dateMX(data.customer.wedding_date) : '',
    'Numero de celular': data.customer?.phone ?? '',
    Modelo: [data.item?.name, data.item?.code && `(${data.item.code})`].filter(Boolean).join(' '),
    Color: data.item?.color ?? '',
  }

  return (
    <Screen title="Hoja de medidas" onBack={back} backLabel="Regresar a la sesión">
      <div className="print-toolbar">
        <button type="button" className="btn-main" onClick={() => window.print()}>Imprimir</button>
        <p className="muted">2 copias · Carta vertical</p>
      </div>

      {[1, 2].map((copy) => (
        <section key={copy} className={`print-sheet ${copy === 1 ? 'print-page-break' : ''}`}>
          <header className="print-letterhead">
            <img src={logo} alt="Soy Única Novias" />
            <div>
              <div className="print-folio">{data.contract.folio}</div>
              <address>{data.store?.address}</address>
            </div>
          </header>
          <hr className="print-rule" />

          <figure className="print-diagram">
            <img src={diagrama} alt="Diagrama con busto, cintura, caderas, altura y hueco de piso" />
          </figure>

          <div className="print-fields print-block">
            {Object.entries(fields).map(([label, value]) => (
              <span className="print-field" key={label}>
                <span className="print-field__label">{label}</span>
                <span className="print-field__rule print-field__rule--filled print-field__rule--wide">{value}</span>
              </span>
            ))}
            {MEDIDAS.map((label) => (
              <span className="print-field" key={label}>
                <span className="print-field__label">{label}</span>
                <span className="print-field__rule" />
              </span>
            ))}
          </div>

          <div style={{ clear: 'both' }} />

          {/* ── Bloque 1: medidas ── */}
          <div className="print-block">
            <p className="print-para">
              Las medidas están expresadas en cm y Yo <span className="print-field__rule" style={{ display: 'inline-block', minWidth: '60mm' }} />,
              confirmo que fueron tomadas y escritas en mi presencia para la confirmación de fabricación
              del vestido. Soy Única se hace responsable del primer ajuste para que el vestido ajuste
              perfecto, tomando en consideración que los diseños se hace tomando la referencia de las
              medidas estándar. La altura de piso a vestido esta considerada de 1,5 a 2 cm de acuerdo al
              estándar.
            </p>
            <div className="print-sign">
              <div className="print-sign__rule">Firma de la Novia</div>
            </div>
          </div>

          {/* ── Bloque 2: ajustes ── */}
          <div className="print-block">
            <p className="print-para">
              Y o <span className="print-field__rule" style={{ display: 'inline-block', minWidth: '60mm' }} /> confirmo
              que se se realicen los siguientes ajustes en mi vestido modelo{' '}
              <span className="print-field__rule" style={{ display: 'inline-block', minWidth: '30mm' }} />
            </p>
            <ol className="print-list">
              {[1, 2, 3].map((n) => (
                <li key={n}>
                  <span>{n}.</span>
                  <span className="print-field__rule" style={{ flex: 1 }} />
                </li>
              ))}
            </ol>
            <p className="print-para print-sign__inline">
              <span>Firma y fecha</span>
              <span className="print-field__rule" />
            </p>
          </div>

          {/* ── Bloque 3: entrega ── */}
          <div className="print-block">
            <p className="print-para">
              Firmo de conformidad que mi vestido fue entregado en tiempo y forma por soy unica
            </p>
            <p className="print-para print-sign__inline">
              <span>firma y fecha .</span>
              <span className="print-field__rule" />
            </p>
            <p className="print-para">se entregó vaporizado</p>
          </div>
        </section>
      ))}
    </Screen>
  )
}
