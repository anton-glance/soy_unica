-- ════════════════════════════════════════════════════════════════════════════
-- Items that need the owner's attention.
--
-- The website does not price everything. Veils and mantillas were never given a
-- price, and several dresses (INTIMA, Nova, Luccienna, Camellia, Adelina) are
-- deliberately left unpriced in Monterrey because they also sit in the CDMX
-- catalogue at a higher price. Dropping those rows on import loses real stock;
-- the shop has been run from memory for ten years and incomplete data is the
-- normal case, not an error.
--
-- So everything comes in, and the rows missing something carry a flag that says
-- what. The flag is derived, never typed: see reviewFields() in
-- worker/lib/items.ts, which is the single place that decides.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE items ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0,1));

-- Which fields are missing, comma separated: 'price,size,cost'. Kept as the
-- field names rather than a sentence so the record sheet can mark them one by
-- one, and so a report can count them.
ALTER TABLE items ADD COLUMN review_fields TEXT;

-- The inventory filter chip counts these, and they sort first.
CREATE INDEX idx_items_needs_review ON items (store_id, needs_review);
