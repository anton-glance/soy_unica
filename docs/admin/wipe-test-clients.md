# Wipe test clients, sessions, contracts, payments, credits, expenses

Everything currently in the database under clients — customers, kiosk sessions,
contracts, contract line items, installments, payments, payment receipts,
credits (traspasos) — plus every expense, was created while testing the kiosk
before launch. None of it is a real sale or a real expense.

## What this removes

- `customers`, `kiosk_sessions`, `contracts`, `contract_items`, `installments`,
  `payments`, `payment_files`, `credits`, `session_favorites`, `session_events`,
  `expenses`.
- Every `files` row except `kind = 'item_photo'` — signed contracts, payment
  receipts, measurement sheets, adjustment notes, delivery photos, expense
  receipts. Their R2 objects become orphaned, same known non-blocking side
  effect as the catalog import leaves for removed rows.

## What this leaves alone

- The inventory catalog itself: `items`, `item_photos`, `files` where
  `kind = 'item_photo'`, and everything about each item's identity, price,
  photos and code.
- `stores`, `users`, `plans`, `surcharges`, `commission_rules`,
  `expense_categories`, `audit_log`.
- One thing on `items` *does* change: any item a test session or contract was
  holding gets `held_by_session` and `contract_id` cleared, and its `status`
  reset to `available` if it was `reserved`/`tailoring`/`tailored`/`ready`/`sold`.
  The hold was test state; the item underneath it is real catalog data and
  keeps everything else.

## Verified

Built a throwaway local D1 from `db/migrations/`, seeded one customer, session,
contract (with a contract item, an installment, a payment, a payment receipt
file, a credit, a session favorite, a session event), one expense with its
receipt file, and one catalog item held by that session/contract with its own
photo — then ran this exact SQL against it. Confirmed afterward: every table
above is empty, `items` still has all 16 seed rows plus the test item, the
test item's `status` is back to `available` with `held_by_session` and
`contract_id` both `NULL`, and the item's photo (`item_photos` +
`files` kind `item_photo`) is untouched.

## Applying it

Local first, always:

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/admin/wipe-test-clients.sql
```

For production, the same command with `--remote` in place of
`--local --persist-to .wrangler/state`:

```
npx wrangler d1 execute soy-unica --remote --file docs/admin/wipe-test-clients.sql
```

This has no filter and no preview step — it is a full wipe of every client,
session, contract, payment, credit and expense in the database. Confirm that
is what you want before running it against `--remote`.
