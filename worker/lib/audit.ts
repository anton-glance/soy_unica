import { stmt } from './db'
import type { Session } from './env'

/**
 * Toda modificación, borrado y cancelación deja renglón en la bitácora.
 * Devuelve una sentencia preparada para que quepa en el mismo batch que el
 * cambio que registra.
 */
export interface AuditEntry {
  session: Pick<Session, 'userId' | 'store'> | null
  entity: string
  entityId: string | number | null
  action: string
  before?: unknown
  after?: unknown
}

export function auditStmt(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return stmt(
    db,
    `INSERT INTO audit_log (user_id, store_id, entity, entity_id, action, before, after)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    entry.session?.userId ?? null,
    entry.session?.store ?? null,
    entry.entity,
    entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
    entry.action,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
  )
}

export async function audit(db: D1Database, entry: AuditEntry): Promise<void> {
  await auditStmt(db, entry).run()
}
