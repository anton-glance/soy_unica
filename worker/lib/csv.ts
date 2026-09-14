/**
 * CSV, no XLSX: no es una hoja con fórmulas ni varias pestañas, sólo el
 * volcado completo de una tabla — CSV es lo simple que basta y lo abre
 * cualquier hoja de cálculo sin librerías nuevas en el Worker.
 */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns: readonly string[], rows: readonly object[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) {
    const asRecord = row as Record<string, unknown>
    lines.push(columns.map((col) => escapeCsv(asRecord[col])).join(','))
  }
  // BOM: Excel abre UTF-8 sin acentos rotos sólo si lo ve.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
