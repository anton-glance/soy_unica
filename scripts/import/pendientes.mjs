/**
 * La hoja que se imprime y se llena a mano.
 *
 * Los cinco renglones rechazados no entran a la importación porque les falta un
 * dato que **no se puede adivinar**: un total que no está, un anticipo que no
 * está, un monto que es imposible. Inventarlos sería peor que dejarlos fuera,
 * así que salen en papel con todas sus celdas tal como están en el libro y con
 * los huecos en blanco para que la dueña los complete de su puño.
 *
 * Después se capturan a mano en el sistema, como cualquier contrato.
 */

const money = (c) => `$${(c / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Qué le falta a cada renglón, deducido de lo que trae y de por qué se rechazó.
 * Nunca se propone un valor: sólo se nombra el hueco.
 */
function blanks(row) {
  const out = []
  const numbers = Object.entries(row.raw).filter(([, v]) => typeof v === 'number')
  const why = row.problems.join(' ')

  if (why.includes('no trae ni anticipo ni total')) {
    out.push({ label: 'Anticipo', hint: 'el que se cobró al firmar' })
    out.push({ label: 'Total del contrato', hint: 'precio pactado' })
  } else if (why.includes('sólo trae un número')) {
    const only = numbers[0]
    out.push({ label: `¿Los ${money(Number(only[1]) * 100)} son anticipo o total?`, hint: 'marque uno: ☐ anticipo   ☐ total' })
    out.push({ label: 'El otro importe', hint: 'el que falta de los dos' })
  } else if (why.includes('es mayor que el total')) {
    out.push({ label: 'Monto correcto de ese abono', hint: 'el escrito es imposible contra el total' })
  } else if (why.includes('números sueltos')) {
    out.push({ label: 'Total del contrato', hint: 'cuál de los importes del renglón es el bueno' })
  }
  if (row.gift_note && why.includes('números sueltos')) {
    out.push({ label: 'Regalo para accesorios', hint: 'el renglón trae dos notas distintas' })
  }
  return out
}

export function pendientesHtml(rejected, { source = 'docs/pagos.xlsx' } = {}) {
  const blocks = rejected.map((row) => {
    const cells = Object.entries(row.raw)
      .map(([i, v]) => `<div class="cell"><span class="col">col ${esc(i)}</span><span class="val">${esc(typeof v === 'number' ? v.toLocaleString('es-MX') : v)}</span></div>`)
      .join('')

    const flag = row.flag ? `<p class="flag">${esc(row.flag)}</p>` : ''

    const fields = blanks(row)
      .map((b) => `<div class="field"><span class="lbl">${esc(b.label)}</span><span class="rule"></span><em>${esc(b.hint)}</em></div>`)
      .join('')

    return `<section class="row">
      <header>
        <h2>${esc(row.nombre || '(sin nombre)')}</h2>
        <span class="where">${esc(row.sheet)} · fila ${row.rowNumber}${row.signed_on ? ` · firmó ${esc(row.signed_on)}` : ''}</span>
      </header>
      <p class="why">${esc(row.problems.join(' · '))}</p>
      ${flag}
      <div class="two">
        <div class="cells">${cells}</div>
        <div class="fields">${fields}</div>
      </div>
    </section>`
  }).join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>Renglones por completar a mano — libro de pagos 2026</title>
<style>
  @page { size: letter portrait; margin: 11mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 8pt/1.25 Jost, system-ui, -apple-system, sans-serif; color: #332A2E; }
  h1 { font: 400 14pt/1.05 Prata, Georgia, serif; margin: 0 0 1.4mm; }
  .lede { margin: 0 0 2.4mm; color: #6E6167; font-size: 7.5pt; max-width: 165mm; }
  .row { border: 0.4pt solid #9C8F94; border-radius: 1.6mm; padding: 1.6mm 2.2mm; margin-bottom: 1.8mm; break-inside: avoid; }
  .row header { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
  h2 { font: 400 10.5pt/1.05 Prata, Georgia, serif; margin: 0; }
  .where { font-size: 7pt; color: #6E6167; font-variant-numeric: tabular-nums; }
  .why { margin: 0.6mm 0 1mm; font-size: 7.2pt; color: #9A5B45; }
  .flag { margin: 0 0 1mm; padding: 0.9mm 1.6mm; border-left: 1.2pt solid #7B3B4A; background: #F3E3DC; font-size: 7.2pt; }
  .two { display: flex; gap: 3.5mm; align-items: flex-start; }
  .cells { flex: 0 0 92mm; font-size: 6.8pt; column-count: 2; column-gap: 3mm; }
  .cell { display: flex; gap: 1.2mm; border-bottom: 0.3pt solid #E3D8C9; padding: 0.3mm 0; break-inside: avoid; }
  .col { color: #9C8F94; white-space: nowrap; flex: 0 0 9mm; }
  .val { font-variant-numeric: tabular-nums; word-break: break-word; }
  .fields { flex: 1; }
  .field { display: flex; align-items: baseline; gap: 1.8mm; margin-bottom: 2.4mm; }
  .lbl { font-size: 7.4pt; white-space: nowrap; }
  .rule { flex: 1; border-bottom: 0.6pt solid #332A2E; min-width: 20mm; height: 3.4mm; }
  .field em { font-style: normal; font-size: 6.6pt; color: #9C8F94; white-space: nowrap; }
  .sign { display: flex; gap: 8mm; margin-top: 2.5mm; }
  .sign .field { flex: 1; margin: 0; }
  footer { margin-top: 2mm; font-size: 6.8pt; color: #6E6167; border-top: 0.4pt solid #E3D8C9; padding-top: 1.2mm; }
</style>
<h1>Renglones por completar a mano</h1>
<p class="lede">
  Libro de pagos 2026 (<code>${esc(source)}</code>). Estos ${rejected.length} contratos <b>no</b> entraron a la
  importación: les falta un dato que no se puede deducir del libro, y adivinarlo sería peor que
  dejarlos fuera. Abajo va cada renglón con <b>todas</b> sus celdas tal como están escritas, y los
  huecos en blanco. Una vez completados se capturan a mano en el sistema, como cualquier contrato.
</p>
${blocks}
<div class="sign">
  <div class="field"><span class="lbl">Completó</span><span class="rule"></span></div>
  <div class="field"><span class="lbl">Fecha</span><span class="rule"></span></div>
</div>
<footer>
  Generado por <code>scripts/import/pagos.mjs</code> desde <code>${esc(source)}</code>. Ningún importe de
  esta hoja fue calculado ni supuesto por el sistema.
</footer>
`
}
