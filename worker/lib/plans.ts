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

/** Por qué un plan no se puede ofrecer para este precio y esta fecha. */
export type RejectionReason =
  | 'inactive'
  | 'price_below'
  | 'price_above'
  | 'months'
  | 'needs_date'
  | 'too_close_to_wedding'

export interface PlanRejection {
  plan: Plan
  reason: RejectionReason
  /** En español, dicho de forma que se pueda actuar. */
  detail: string
}

export interface PlanEvaluation {
  offers: PlanOffer[]
  rejected: PlanRejection[]
}

/**
 * Evalúa todos los planes y dice, uno por uno, si cabe o por qué no. Cuando no
 * cabe ninguno, la vendedora necesita saber cuál de las tres restricciones
 * falló —el precio, los meses o los días antes de la boda— para saber qué
 * mover.
 */
export function evaluatePlans(input: OfferInput): PlanEvaluation {
  const { plans, listTotalCents, signedOn, weddingDate, minDaysBeforeWedding } = input
  const offers: PlanOffer[] = []
  const rejected: PlanRejection[] = []
  const reject = (plan: Plan, reason: RejectionReason, detail: string) => rejected.push({ plan, reason, detail })

  for (const plan of plans) {
    if (!plan.active) {
      reject(plan, 'inactive', 'Está desactivado en Ajustes.')
      continue
    }
    if (listTotalCents < plan.min_price_cents) {
      reject(plan, 'price_below', `Es para ventas desde ${mxn(plan.min_price_cents)}.`)
      continue
    }
    if (plan.max_price_cents !== null && listTotalCents > plan.max_price_cents) {
      reject(plan, 'price_above', `Es para ventas hasta ${mxn(plan.max_price_cents)}.`)
      continue
    }
    // El plan no puede pedir más meses con fecha de los que tiene autorizados.
    if (plan.max_months > 0 && plan.splits.length - 1 > plan.max_months) {
      reject(plan, 'months', `Necesita ${plan.splits.length - 1} meses y tiene ${plan.max_months} autorizados.`)
      continue
    }
    if (!weddingDate && hasDatedInstallments(plan)) {
      reject(plan, 'needs_date', 'Lleva parcialidades con fecha y la novia todavía no tiene fecha de evento.')
      continue
    }

    const { total_cents, discount_cents } = priceAfterDiscount(plan, listTotalCents)
    const schedule = generateSchedule(plan, total_cents, signedOn)

    if (weddingDate) {
      // La regla de días antes de la boda mira sólo los pagos que caen DESPUÉS
      // de la firma. El anticipo se entrega hoy, en el mostrador: no puede
      // estar «demasiado cerca» de nada. Contarlo dejaba sin ningún plan a una
      // novia con boda en dos semanas, que es justo cuando paga de contado.
      const lastDated = [...schedule].reverse().find((r) => r.due_date !== null && r.due_date > signedOn)
      if (lastDated?.due_date) {
        const margin = daysBetween(lastDated.due_date, weddingDate)
        if (margin < minDaysBeforeWedding) {
          reject(
            plan,
            'too_close_to_wedding',
            margin < 0
              ? 'Su último pago caería después de la boda.'
              : `Su último pago caería ${margin} ${margin === 1 ? 'día' : 'días'} antes de la boda y se piden ${minDaysBeforeWedding}.`,
          )
          continue
        }
      }
    }

    offers.push({ plan, total_cents, discount_cents, schedule })
  }

  return { offers, rejected }
}

/**
 * Devuelve sólo los planes que caben: activos, dentro del rango de precio, con
 * suficientes meses para sus parcialidades y —cuando hay boda— cuya última
 * parcialidad cae al menos `minDaysBeforeWedding` antes del evento.
 */
export function offerablePlans(input: OfferInput): PlanOffer[] {
  return evaluatePlans(input).offers
}

/** Pesos sin centavos, como los escribe la tienda. */
function mxn(cents: number): string {
  return '$' + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
