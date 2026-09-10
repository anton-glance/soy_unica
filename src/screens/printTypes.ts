export interface ContractPrint {
  contract: { id: number; folio: string; total_cents: number; plan_name: string | null; status: string; signed_at: string | null }
  customer: { name: string; apellido: string; phone: string; wedding_date: string | null } | null
  item: { code: string; name: string; color: string | null } | null
  lines: { description: string; price_cents: number; line_kind: string }[]
  installments: { seq: number; due_type: 'fixed' | 'on_pickup'; due_date: string | null; amount_cents: number }[]
  store: { name: string; address: string } | null
  contract_body: string
}
