import { centsToMXN } from './money'
import { formatDateMX } from './dates'
import type { ScheduleRow } from './plans'

/**
 * Rellena la plantilla del contrato de la tienda. Los marcadores son los que
 * la dueña ve en Ajustes; cualquiera que no se conozca se deja en blanco para
 * que no salga `{{algo}}` impreso en un documento legal.
 */
export interface TemplateData {
  bride_name: string
  apellido: string
  phone: string
  wedding_date: string | null
  dress: string
  code: string
  color: string
  total_cents: number
  anticipo_cents: number
  plan_name: string
  schedule: ScheduleRow[]
  accessories: { description: string; price_cents: number }[]
  store: string
  address: string
  folio: string
  date: string
}

export function scheduleAsText(schedule: ScheduleRow[]): string {
  return schedule
    .map((r) => {
      const when = r.due_type === 'on_pickup' ? 'Al recoger el vestido' : formatDateMX(r.due_date as string)
      return `${r.seq}. ${when} — ${centsToMXN(r.amount_cents)}`
    })
    .join('\n')
}

export function accessoriesAsText(rows: { description: string; price_cents: number }[]): string {
  if (rows.length === 0) return 'Ninguno'
  return rows.map((a, i) => `${i + 1}. ${a.description} — ${centsToMXN(a.price_cents)}`).join('\n')
}

export function renderTemplate(template: string, data: TemplateData): string {
  const values: Record<string, string> = {
    bride_name: data.bride_name,
    apellido: data.apellido,
    phone: data.phone,
    wedding_date: data.wedding_date ? formatDateMX(data.wedding_date) : 'Sin fecha',
    dress: data.dress,
    code: data.code,
    color: data.color,
    total: centsToMXN(data.total_cents),
    anticipo: centsToMXN(data.anticipo_cents),
    plan_name: data.plan_name,
    schedule_table: scheduleAsText(data.schedule),
    accessories: accessoriesAsText(data.accessories),
    store: data.store,
    address: data.address,
    folio: data.folio,
    date: formatDateMX(data.date),
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? '')
}
