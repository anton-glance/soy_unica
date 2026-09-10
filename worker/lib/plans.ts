import { addMonths, daysBetween } from './dates'
import { splitByPercent } from './money'

/**
 * Los planes son un conjunto fijo que se escoge de una lista. No existe el
 * armado de planes por clienta: la dueña es explícita en que un plan a la
 * medida es imposible de seguir, y el sistema no debe ofrecerlo.
 */
export interface Plan {
  id: number
  name: string
  /** Porcentajes enteros en orden, suman 100. El primero es el anticipo. */
  splits: number[]
  min_price_cents: number
  max_price_cents: number | null
  /**
   * Meses con fecha después del anticipo. 0 significa que lo que resta se
   * liquida al recoger el vestido (`on_pickup`), sin fecha.
   */
  max_months: number
  discount_pct: number
  active: number
}

export interface ScheduleRow {
  seq: number
  due_type: 'fixed' | 'on_pickup'
  due_date: string | null
  amount_cents: number
}

export interface PlanOffer {
  plan: Plan
  total_cents: number
  discount_cents: number
  schedule: ScheduleRow[]
}

/** Un plan sin parcialidades con fecha se puede ofrecer aunque no haya boda. */
export function hasDatedInstallments(plan: Plan): boolean {
  return plan.max_months > 0
}

export function parseSplits(raw: string): number[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((n) => typeof n === 'number')) {
    throw new Error('El plan tiene porcentajes inválidos')
  }
  return parsed as number[]
}

/**
 * Genera el calendario acordado. El anticipo (seq 1) se paga el día de la
 * firma; cada parcialidad siguiente cae un mes después de la anterior, salvo
 * en los planes sin meses, donde se liquida al recoger.
 */
export function generateSchedule(plan: Plan, totalCents: number, signedOn: string): ScheduleRow[] {
  const amounts = splitByPercent(totalCents, plan.splits)
  return amounts.map((amount_cents, i) => {
    const seq = i + 1
    if (seq === 1) return { seq, due_type: 'fixed' as const, due_date: signedOn, amount_cents }
    if (plan.max_months === 0) return { seq, due_type: 'on_pickup' as const, due_date: null, amount_cents }
    return { seq, due_type: 'fixed' as const, due_date: addMonths(signedOn, seq - 1), amount_cents }
  })
}

export function priceAfterDiscount(plan: Plan, listTotalCents: number): { total_cents: number; discount_cents: number } {
  const discount_cents = Math.round((listTotalCents * plan.discount_pct) / 100)
  return { total_cents: listTotalCents - discount_cents, discount_cents }
}

export interface OfferInput {
  plans: Plan[]
  listTotalCents: number
  signedOn: string
  /** Sin fecha de boda sólo caben los planes sin parcialidades con fecha. */
  weddingDate: string | null
  minDaysBeforeWedding: number
}

/**
 * Devuelve sólo los planes que caben: activos, dentro del rango de precio, con
 * suficientes meses para sus parcialidades y —cuando hay boda— cuya última
 * parcialidad cae al menos `minDaysBeforeWedding` antes del evento.
 */
export function offerablePlans(input: OfferInput): PlanOffer[] {
  const { plans, listTotalCents, signedOn, weddingDate, minDaysBeforeWedding } = input
  const offers: PlanOffer[] = []

  for (const plan of plans) {
    if (!plan.active) continue
    if (listTotalCents < plan.min_price_cents) continue
    if (plan.max_price_cents !== null && listTotalCents > plan.max_price_cents) continue
    // El plan no puede pedir más meses con fecha de los que tiene autorizados.
    if (plan.splits.length - 1 > plan.max_months && plan.max_months > 0) continue
    if (!weddingDate && hasDatedInstallments(plan)) continue

    const { total_cents, discount_cents } = priceAfterDiscount(plan, listTotalCents)
    const schedule = generateSchedule(plan, total_cents, signedOn)

    if (weddingDate) {
      const lastDated = [...schedule].reverse().find((r) => r.due_date !== null)
      if (lastDated?.due_date && daysBetween(lastDated.due_date, weddingDate) < minDaysBeforeWedding) continue
    }

    offers.push({ plan, total_cents, discount_cents, schedule })
  }

  return offers
}
