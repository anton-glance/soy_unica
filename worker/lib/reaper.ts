import { all, stmt } from './db'
import { auditStmt } from './audit'
import { nowIso } from './dates'

/**
 * Cierra las sesiones que quedaron abiertas y suelta sus apartados.
 *
 * El caso real: la vendedora apaga la tableta al final del día sin cerrar la
 * sesión. Los vestidos que esa novia tocó se quedan en 'watching' apartados por
 * una sesión que ya no existe, y a la mañana siguiente no aparecen en el
 * kiosco. No había forma de arreglarlo desde la tienda.
 *
 * Una sesión abandonada NO es una sesión perdida: nadie dijo por qué se fue la
 * clienta. Se marca `outcome = 'abandoned'` y se distingue en el reporte. Se le
 * conservan sus eventos y sus favoritos —vino, y eso sigue siendo el registro
 * de lo que pasó—; lo único que se suelta son los apartados, que son estado
 * vivo del inventario y no del historial.
 *
 * No se le pide NIP a nadie porque no la cierra nadie: la cierra el tiempo.
 */
export interface Reaped {
  id: number
  stage: string
  hours_idle: number
}

export async function reapAbandoned(db: D1Database, store: string): Promise<Reaped[]> {
  const timeout = await all<{ session_timeout_hours: number }>(
    db, `SELECT session_timeout_hours FROM stores WHERE id = ?`, store)
  const hours = timeout[0]?.session_timeout_hours ?? 4

  // La última señal de vida es el último evento; si no tiene ninguno, la hora
  // en que se abrió.
  const stale = await all<{ id: number; stage: string; last_seen: string }>(
    db,
    `SELECT k.id, k.stage,
            COALESCE(MAX(e.at), k.opened_at) AS last_seen
       FROM kiosk_sessions k
       LEFT JOIN session_events e ON e.session_id = k.id
      WHERE k.store_id = ? AND k.closed_at IS NULL
      GROUP BY k.id
     -- Con el MISMO formato que guardan las columnas. datetime() devuelve
     -- 'YYYY-MM-DD HH:MM:SS', y comparar eso como texto contra un ISO con 'T'
     -- sale siempre al revés: la 'T' es mayor que el espacio.
     HAVING last_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`,
    store, `-${hours} hours`,
  )
  if (stale.length === 0) return []

  const now = nowIso()
  const writes: D1PreparedStatement[] = []
  for (const row of stale) {
    writes.push(
      stmt(db,
        `UPDATE kiosk_sessions
            SET stage = 'closed', closed_at_stage = ?, closed_at = ?, abandoned_at = ?,
                outcome = 'abandoned', reason = 'sin actividad'
          WHERE id = ? AND closed_at IS NULL`,
        row.stage, now, now, row.id),
      stmt(db, `INSERT INTO session_events (session_id, stage, detail) VALUES (?, 'closed', ?)`,
        row.id, `abandonada tras ${hours} h sin actividad · murió en «${row.stage}»`),
      // Sólo los apartados. Los favoritos se quedan.
      stmt(db, `UPDATE items SET status = 'available', held_by_session = NULL, updated_at = ?
                 WHERE held_by_session = ? AND status = 'watching'`, now, row.id),
      // La bitácora lo registra sin usuaria: no lo cerró nadie.
      auditStmt(db, { session: null, entity: 'kiosk_session', entityId: row.id, action: 'abandon',
        after: { hours_idle: hours, stage: row.stage } }),
    )
  }
  await db.batch(writes)

  return stale.map((row) => ({
    id: row.id,
    stage: row.stage,
    // `last_seen` ya viene en ISO con Z; se tolera la forma con espacio por si
    // algún renglón viejo la trae.
    hours_idle: Math.floor((Date.now() - Date.parse(row.last_seen.replace(' ', 'T').replace(/Z?$/, 'Z'))) / 3_600_000),
  }))
}
