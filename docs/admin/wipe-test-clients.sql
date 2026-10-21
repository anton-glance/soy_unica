-- Wipe all client/session/contract/payment/expense data before launch — all
-- of it was created while testing the kiosk, none of it is a real sale.
--
-- Left completely untouched: items (the inventory catalog itself), item_photos,
-- files with kind = 'item_photo', stores, users, plans, surcharges,
-- commission_rules, expense_categories, audit_log.
--
-- Order matters — it exists only to satisfy foreign keys that don't cascade
-- (items.held_by_session/contract_id, files.contract_id, credits.*_contract_id):
-- release every item's hold before the session/contract it points to is gone,
-- clear expenses and their receipt files before deleting anything they
-- reference, then contracts (which cascade to contract_items, installments,
-- payments, payment_files), then sessions (which cascade to session_favorites,
-- session_events), then the clients themselves.

-- 1. Release any item currently held by a test session/contract. The hold is
--    test state; the item underneath it is real catalog data and stays.
UPDATE items
SET held_by_session = NULL,
    contract_id = NULL,
    status = CASE WHEN status IN ('reserved','tailoring','tailored','ready','sold')
                  THEN 'available' ELSE status END
WHERE held_by_session IS NOT NULL OR contract_id IS NOT NULL;

-- 2. Expenses first — nothing references them, and this clears the one
--    reference (expenses.file_id) that would otherwise block step 3.
DELETE FROM expenses;

-- 3. Every non-catalog file: signed contracts, receipts, measurement sheets,
--    adjustments, delivery photos, expense receipts. Catalog photos
--    (kind = 'item_photo') are the only kind excluded.
DELETE FROM files WHERE kind <> 'item_photo';

-- 4. Credits (traspasos) reference contracts directly, with no cascade.
DELETE FROM credits;

-- 5. Contracts — cascades to contract_items, installments, payments, and
--    payments cascade to payment_files.
DELETE FROM contracts;

-- 6. Sessions — cascades to session_favorites, session_events.
DELETE FROM kiosk_sessions;

-- 7. The clients themselves.
DELETE FROM customers;
