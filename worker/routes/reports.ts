import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { all } from '../lib/db'
import { badRequest } from '../lib/errors'
import { requireOwner } from '../lib/auth'
import { addDays, isDate, todayISO, weekStart } from '../lib/dates'

const app = new Hono<AppEnv>()

/**
 * El reporte semanal de sesiones. Sólo la mitad de sesiones: el correo y la
 * programación quedan fuera de alcance por ahora.
 *
 * La sesión es el registro de lo que pasó con una clienta que entró, haya
 * comprado o no. Por eso la mitad interesante del reporte no son las ventas
 * sino lo otro: quién se fue, en qué etapa y por qué. Una sesión que llegó a
 * capturar datos deja una persona localizable —nombre, teléfono, el vestido que
 * quería— y eso es una lista de llamadas. Una que se fue antes sale nada más
 * como cuenta y motivo, sin un solo dato personal, porque no hay ninguno que
 * dar.
 */

interface SessionRow {
  id: number
  store_id: string
  opened_at: string
  closed_at: string | null
  stage: string
  closed_at_stage: string | null
  outcome: string | null
  reason: string | null
  note: string | null
  seller: string | null
  customer_id: number | null
  bride: string | null
  apellido: string | null
  phone: string | null
  wedding_date: string | null
  contract_id: number | null
  folio: string | null
  contract_status: string | null
  plan_name: string | null
  total_cents: number | null
  signed_at: string | null
}

/**
 * El orden del embudo. «Hasta dónde llegó» no es la etapa en que murió: una
 * clienta que se probó dos vestidos y volvió al catálogo murió en 'browsing'
 * pero sí llegó al probador, y para el reporte eso es lo que cuenta.
 */
const FUNNEL = [
  'browsing', 'fitting', 'selected', 'bride_data', 'sheet_printed',
  'sheet_signed', 'terms', 'contract_printed', 'signed', 'payment',
] as const

const rank = (stage: string) => {
  const i = FUNNEL.indexOf(stage as (typeof FUNNEL)[number])
  return i === -1 ? -1 : i
}

app.get('/weekly', requireOwner, async (c) => {
  const s = c.get('session')
  const day = c.req.query('date') ?? todayISO()
  if (!isDate(day)) throw badRequest('Esa fecha no es válida.')
  const from = weekStart(day)
  const to = addDays(from, 6)

  const sessions = await all<SessionRow>(
    c.env.DB,
    `SELECT k.id, k.store_id, k.opened_at, k.closed_at, k.stage, k.closed_at_stage,
            k.outcome, k.reason, k.note, k.customer_id, k.contract_id,
            u.name  AS seller,
            cu.name AS bride, cu.apellido, cu.phone, cu.wedding_date,
            co.folio, co.status AS contract_status, co.plan_name, co.total_cents, co.signed_at
       FROM kiosk_sessions k
       LEFT JOIN users     u  ON u.id  = k.opened_by
       LEFT JOIN customers cu ON cu.id = k.customer_id
       LEFT JOIN contracts co ON co.id = k.contract_id
      WHERE k.store_id = ? AND substr(k.opened_at, 1, 10) BETWEEN ? AND ?
      ORDER BY k.opened_at, k.id`,
    s.store, from, to,
  )
  const ids = sessions.map((r) => r.id)
  const inList = ids.length ? ids.map(() => '?').join(',') : 'NULL'

  // La etapa más lejana de cada sesión, de su propia bitácora de eventos.
  const stages = ids.length
    ? await all<{ session_id: number; stage: string }>(
        c.env.DB,
        `SELECT DISTINCT session_id, stage FROM session_events WHERE session_id IN (${inList})`,
        ...ids)
    : []
  const furthest = new Map<number, string>()
  for (const row of stages) {
    const best = furthest.get(row.session_id)
    if (best === undefined || rank(row.stage) > rank(best)) furthest.set(row.session_id, row.stage)
  }
  const reached = (row: SessionRow) => furthest.get(row.id) ?? row.closed_at_stage ?? row.stage

  // Lo que la vendedora escogió vive en la sesión, no sólo en el contrato: un
  // contrato anulado sigue teniendo renglones, pero esto es de la clienta.
  const selections = ids.length
    ? await all<{ session_id: number; line_kind: string; code: string; name: string; price_cents: number }>(
        c.env.DB,
        `SELECT sl.session_id, sl.line_kind, i.code, i.name, i.price_cents
           FROM session_selections sl JOIN items i ON i.id = sl.item_id
          WHERE sl.session_id IN (${inList}) ORDER BY sl.line_kind DESC, sl.at`,
        ...ids)
    : []

  // Los favoritos son la señal de demanda; para la que no compró, son además
  // el único rastro de qué vino a buscar.
  const favorites = ids.length
    ? await all<{ session_id: number; code: string; name: string; added_at: string }>(
        c.env.DB,
        `SELECT f.session_id, i.code, i.name, f.added_at
           FROM session_favorites f JOIN items i ON i.id = f.item_id
          WHERE f.session_id IN (${inList}) ORDER BY f.added_at, f.item_id`,
        ...ids)
    : []

  const deposits = ids.length
    ? await all<{ session_id: number; paid_cents: number }>(
        c.env.DB,
        `SELECT k.id AS session_id, COALESCE(SUM(p.amount_cents), 0) AS paid_cents
           FROM kiosk_sessions k
           JOIN payments p ON p.contract_id = k.contract_id AND p.voided_at IS NULL
          WHERE k.id IN (${inList}) GROUP BY k.id`,
        ...ids)
    : []

  const by = <T extends { session_id: number }>(rows: T[]) => {
    const map = new Map<number, T[]>()
    for (const r of rows) map.set(r.session_id, [...(map.get(r.session_id) ?? []), r])
    return map
  }
  const selectionsBy = by(selections)
  const favoritesBy = by(favorites)
  const depositBy = new Map(deposits.map((d) => [d.session_id, d.paid_cents]))

  const sold = (row: SessionRow) =>
    row.contract_status !== null && !['draft', 'void', 'cancelled'].includes(row.contract_status)

  const ventas = sessions.filter(sold).map((row) => {
    const picked = selectionsBy.get(row.id) ?? []
    const dress = picked.find((p) => p.line_kind === 'dress') ?? null
    return {
      session_id: row.id,
      folio: row.folio,
      bride: [row.bride, row.apellido].filter(Boolean).join(' '),
      phone: row.phone,
      wedding_date: row.wedding_date,
      dress: dress ? { code: dress.code, name: dress.name } : null,
      accessories: picked.filter((p) => p.line_kind === 'accessory').map((a) => ({ code: a.code, name: a.name })),
      total_cents: row.total_cents ?? 0,
      plan_name: row.plan_name,
      deposit_cents: depositBy.get(row.id) ?? 0,
      seller: row.seller,
      signed_at: row.signed_at,
    }
  })

  // Las que llegaron a datos de la novia: hay a quién llamar.
  const sinVenta = sessions
    .filter((row) => !sold(row) && row.customer_id !== null)
    .map((row) => {
      const picked = selectionsBy.get(row.id) ?? []
      const dress = picked.find((p) => p.line_kind === 'dress')
        ?? (favoritesBy.get(row.id) ?? [])[0]
        ?? null
      return {
        session_id: row.id,
        stage: reached(row),
        reason: row.reason,
        note: row.note,
        outcome: row.outcome,
        bride: [row.bride, row.apellido].filter(Boolean).join(' '),
        phone: row.phone,
        wedding_date: row.wedding_date,
        dress: dress ? { code: dress.code, name: dress.name } : null,
        favorites: (favoritesBy.get(row.id) ?? []).map((f) => ({ code: f.code, name: f.name })),
        seller: row.seller,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
      }
    })

  // Las que se fueron antes de dar sus datos: una cuenta y sus motivos. No hay
  // renglón por sesión porque no hay nada personal que poner en él.
  const anonimas = sessions.filter((row) => !sold(row) && row.customer_id === null)
  const motivos = new Map<string, number>()
  for (const row of anonimas) {
    // Abandonada no es perdida: nadie dijo por qué se fue. Se cuenta aparte
    // para no leerla como un motivo de no-venta que nunca se registró.
    const key = row.closed_at === null
      ? 'sigue abierta'
      : row.outcome === 'abandoned' ? 'abandonada (la tableta se quedó abierta)' : (row.reason ?? 'sin motivo')
    motivos.set(key, (motivos.get(key) ?? 0) + 1)
  }
  const abandonadas = sessions.filter((row) => row.outcome === 'abandoned').length

  const reachedFitting = sessions.filter((row) => rank(reached(row)) >= rank('fitting')).length

  return c.json({
    from,
    to,
    store_id: s.store,
    conversion: {
      opened: sessions.length,
      reached_fitting: reachedFitting,
      sold: ventas.length,
      abandoned: abandonadas,
    },
    ventas,
    sin_venta: sinVenta,
    anonimas: {
      count: anonimas.length,
      reasons: [...motivos.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    },
  })
})

export default app
