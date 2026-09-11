/**
 * El plan fijo manda; los abonos se acomodan contra él.
 *
 * El saldo del contrato es siempre `total_cents − suma de pagos no cancelados`.
 * La cobertura de cada parcialidad se deriva de los pagos aplicados: nunca se
 * guarda como fuente de verdad.
 *
 * El campo del monto acepta cualquier cifra a propósito. Los registros de la
 * tienda muestran contratos con seis a diecinueve abonos contra tres a cinco
 * parcialidades planeadas, y ese patrón sigue. Un abono corto deja la
 * parcialidad parcialmente cubierta con su remanente a la vista; un abono de
 * más se corre a la siguiente. El sistema no rechaza dinero que la novia ya
 * entregó, ni obliga a la vendedora a inventar una cifra que cuadre.
 */

export interface InstallmentRow {
  id: number
  seq: number
  due_type: 'fixed' | 'on_pickup'
  due_date: string | null
  amount_cents: number
}

export interface PaymentRow {
  id: number
  paid_at: string | null
  amount_cents: number
  installment_id: number | null
  voided_at: string | null
}

export type CoverageStatus = 'pending' | 'partial' | 'covered' | 'overdue'

export interface CoverageRow extends InstallmentRow {
  applied_cents: number
  remaining_cents: number
  status: CoverageStatus
}

export interface Ledger {
  total_cents: number
  paid_cents: number
  balance_cents: number
  coverage: CoverageRow[]
  /** Dinero recibido que ya no cabe en ninguna parcialidad (sobrepago). */
  unapplied_cents: number
  next_due: CoverageRow | null
  overdue: CoverageRow[]
}

export function livePayments(payments: readonly PaymentRow[]): PaymentRow[] {
  return payments.filter((p) => p.voided_at === null)
}

export function balanceOf(totalCents: number, payments: readonly PaymentRow[]): number {
  const paid = livePayments(payments).reduce((sum, p) => sum + p.amount_cents, 0)
  return totalCents - paid
}

/**
 * Acomoda los abonos sobre el calendario. Cada pago empieza en la parcialidad
 * a la que la vendedora lo dirigió (o en la primera sin cubrir) y lo que sobra
 * se corre hacia adelante.
 */
export function buildLedger(
  totalCents: number,
  installments: readonly InstallmentRow[],
  payments: readonly PaymentRow[],
  today: string,
): Ledger {
  const rows: CoverageRow[] = [...installments]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => ({ ...i, applied_cents: 0, remaining_cents: i.amount_cents, status: 'pending' }))

  const ordered = livePayments(payments).sort((a, b) =>
    // Un abono importado puede no traer fecha; esos van al final, en el orden
    // en que se capturaron.
    a.paid_at === b.paid_at ? a.id - b.id
      : a.paid_at === null ? 1
      : b.paid_at === null ? -1
      : a.paid_at < b.paid_at ? -1 : 1,
  )

  let unapplied = 0
  for (const payment of ordered) {
    let left = payment.amount_cents
    let start = rows.findIndex((r) => r.id === payment.installment_id)
    if (start < 0) start = rows.findIndex((r) => r.remaining_cents > 0)
    if (start < 0) {
      unapplied += left
      continue
    }
    for (let i = start; i < rows.length && left > 0; i++) {
      const row = rows[i]
      if (!row) continue
      const take = Math.min(left, row.remaining_cents)
      row.applied_cents += take
      row.remaining_cents -= take
      left -= take
    }
    // Un abono dirigido a una parcialidad tardía puede sobrar hacia adelante y
    // aun así dejar sin cubrir una anterior: se rellena hacia atrás antes de
    // declararlo sobrepago.
    for (let i = 0; i < start && left > 0; i++) {
      const row = rows[i]
      if (!row) continue
      const take = Math.min(left, row.remaining_cents)
      row.applied_cents += take
      row.remaining_cents -= take
      left -= take
    }
    unapplied += left
  }

  for (const row of rows) {
    if (row.remaining_cents === 0) row.status = 'covered'
    else if (row.due_type === 'fixed' && row.due_date !== null && row.due_date < today) row.status = 'overdue'
    else if (row.applied_cents > 0) row.status = 'partial'
    else row.status = 'pending'
  }

  const paid_cents = ordered.reduce((sum, p) => sum + p.amount_cents, 0)

  return {
    total_cents: totalCents,
    paid_cents,
    balance_cents: totalCents - paid_cents,
    coverage: rows,
    unapplied_cents: unapplied,
    next_due: rows.find((r) => r.remaining_cents > 0) ?? null,
    overdue: rows.filter((r) => r.status === 'overdue'),
  }
}

/**
 * Recargo por atraso que permite el contrato de la tienda: o se pierde el
 * descuento promocional, o se cobra un porcentaje del precio del vestido por
 * mes vencido. Es una sugerencia que la dueña aprueba, nunca un cargo
 * automático.
 */
export function suggestedLateFee(
  ledger: Ledger,
  opts: { dressPriceCents: number; discountCents: number; lateFeePct: number; today: string },
): { months_overdue: number; lose_discount_cents: number; monthly_fee_cents: number } | null {
  if (ledger.overdue.length === 0) return null
  const oldest = ledger.overdue.reduce((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? a : b))
  if (!oldest.due_date) return null
  const days = Math.max(0, Math.round((Date.parse(`${opts.today}T00:00:00Z`) - Date.parse(`${oldest.due_date}T00:00:00Z`)) / 86_400_000))
  const months_overdue = Math.max(1, Math.ceil(days / 30))
  return {
    months_overdue,
    lose_discount_cents: opts.discountCents,
    monthly_fee_cents: Math.round((opts.dressPriceCents * opts.lateFeePct) / 100) * months_overdue,
  }
}
