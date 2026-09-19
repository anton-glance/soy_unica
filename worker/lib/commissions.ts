import { buildLedger, type InstallmentRow, type PaymentRow } from './payments'

/**
 * Lo que gana quien vende, calculado de verdad — antes «Comisiones» en
 * Ajustes sólo guardaba las tasas, sin que nada las aplicara contra una
 * venta real.
 *
 * Cada regla dice sobre qué se calcula («Sobre», en Ajustes):
 *   - `sale_value`: el precio de venta completo, el día que se firma.
 *   - `cash`:       cada abono, el día que se cobra.
 *   - `split`:      cada parcialidad del plan, el día en que vence — según
 *                    el calendario firmado, no según cuándo (o si) se pagó.
 * y en qué periodo se cuenta («Periodo»): sólo se usan aquí las reglas
 * semanales; una regla mensual no tiene un «esta semana» que reportar.
 */

export interface CommissionRule {
  id: number
  priority: number
  min_price_cents: number
  max_price_cents: number | null
  sold_at_or_above_list: 0 | 1 | null
  rate_pct: number
  basis: 'cash' | 'sale_value' | 'split'
  period: 'weekly' | 'monthly'
}

export interface CommissionContract {
  id: number
  seller_id: number
  seller_name: string
  total_cents: number
  list_total_cents: number
  signed_at: string | null
}

export interface CommissionLine {
  seller_id: number
  seller_name: string
  contract_id: number
  cents: number
}

/** La primera regla activa cuyo rango de precio la cubre, por prioridad. */
function matchRule(rules: readonly CommissionRule[], totalCents: number, atOrAboveList: boolean): CommissionRule | null {
  const candidates = rules
    .filter((r) => totalCents >= r.min_price_cents && (r.max_price_cents === null || totalCents <= r.max_price_cents))
    .filter((r) => r.sold_at_or_above_list === null || Boolean(r.sold_at_or_above_list) === atOrAboveList)
    .sort((a, b) => a.priority - b.priority)
  return candidates[0] ?? null
}

export interface WeeklyCommissions {
  lines: CommissionLine[]
  total_cents: number
  /** Cuántas reglas activas quedaron fuera del cálculo por ser mensuales. */
  excluded_monthly_rules: number
}

export function weeklyCommissions(
  rules: readonly CommissionRule[],
  contracts: readonly CommissionContract[],
  paymentsByContract: ReadonlyMap<number, PaymentRow[]>,
  installmentsByContract: ReadonlyMap<number, InstallmentRow[]>,
  from: string,
  to: string,
  today: string,
): WeeklyCommissions {
  const weekly = rules.filter((r) => r.period === 'weekly')
  const excludedMonthly = rules.filter((r) => r.period === 'monthly').length
  const lines: CommissionLine[] = []

  for (const contract of contracts) {
    const rule = matchRule(weekly, contract.total_cents, contract.total_cents >= contract.list_total_cents)
    if (!rule) continue
    const cut = (cents: number) => Math.round((cents * rule.rate_pct) / 100)

    if (rule.basis === 'sale_value') {
      const day = contract.signed_at?.slice(0, 10)
      if (day && day >= from && day <= to) {
        lines.push({ seller_id: contract.seller_id, seller_name: contract.seller_name, contract_id: contract.id, cents: cut(contract.total_cents) })
      }
    } else if (rule.basis === 'cash') {
      for (const p of paymentsByContract.get(contract.id) ?? []) {
        if (p.voided_at !== null || !p.paid_at) continue
        const day = p.paid_at.slice(0, 10)
        if (day >= from && day <= to) {
          lines.push({ seller_id: contract.seller_id, seller_name: contract.seller_name, contract_id: contract.id, cents: cut(p.amount_cents) })
        }
      }
    } else {
      // split: sigue el calendario firmado, no el abono real — se arma el
      // mismo ledger que ve la vendedora, y de ahí sólo el monto planeado de
      // cada parcialidad, no lo que ya se le aplicó.
      const installments = installmentsByContract.get(contract.id) ?? []
      const payments = paymentsByContract.get(contract.id) ?? []
      const ledger = buildLedger(contract.total_cents, installments, payments, today)
      for (const row of ledger.coverage) {
        // Sin fecha fija (due_type 'on_pickup') no hay semana a la que cargarla.
        if (row.due_date && row.due_date >= from && row.due_date <= to) {
          lines.push({ seller_id: contract.seller_id, seller_name: contract.seller_name, contract_id: contract.id, cents: cut(row.amount_cents) })
        }
      }
    }
  }

  return { lines, total_cents: lines.reduce((sum, l) => sum + l.cents, 0), excluded_monthly_rules: excludedMonthly }
}
