-- ════════════════════════════════════════════════════════════════════════════
-- Replace the single `accessory` catch-all with the kinds she actually works
-- with — mantilla, tiara, cinto, otros — and give the non-dress kinds a stock
-- count. "Accessory" stops being a value in the database: from here on it is
-- "anything that is not a dress", the same rule the UI and the importer now
-- both use.
--
-- `quantity` only means something for a kind other than 'dress' bought as
-- physical stock (`acquisition = 'unidad'`): how many of that exact row are on
-- the shelf right now. A dress is still tracked one unit at a time through
-- `status`/`held_by_session`, as before — adding a count there would just be a
-- second, conflicting way to say the same thing. A made-to-order accessory
-- (`acquisition = 'pedido'`, imported from the website) is never physically
-- counted either: like a made-to-order dress, it is always orderable, so its
-- quantity stays NULL and plays no part in availability.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt —
-- the same approach as 0007_payment_date_optional.sql. Everything with a
-- foreign key onto items.id keeps pointing at the same ids, since the rebuild
-- preserves them.
-- ════════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = OFF;

CREATE TABLE items_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id             TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code                 TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('dress','mantilla','tiara','cinto','otros')),
  acquisition          TEXT NOT NULL CHECK (acquisition IN ('unidad','pedido')),
  condition            TEXT NOT NULL CHECK (condition IN ('nuevo','muestra','exhibicion','liquidacion')),
  name                 TEXT NOT NULL,
  brand                TEXT,
  size                 TEXT,
  cut                  TEXT,
  color                TEXT,
  cost_cents           INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  price_cents          INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  -- How many are on the shelf. NULL for a dress and for anything made to
  -- order: neither is counted this way. Negative never makes sense.
  quantity             INTEGER CHECK (quantity IS NULL OR quantity >= 0),
  status               TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
                         'available','watching','reserved','tailoring',
                         'tailored','ready','sold','retired')),
  location             TEXT,
  notes                TEXT,
  intake_date          TEXT,
  held_by_session      INTEGER REFERENCES kiosk_sessions(id),
  contract_id          INTEGER REFERENCES contracts(id),
  tailoring_started_at TEXT,
  tailoring_done_at    TEXT,
  ready_notified_at    TEXT,
  delivered_at         TEXT,
  needs_review         INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0,1)),
  review_fields        TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (store_id, code),
  CHECK (acquisition <> 'pedido' OR (held_by_session IS NULL AND status = 'available')),
  -- Stock-counted stays NULL only for a dress or for something made to order.
  CHECK (kind = 'dress' OR acquisition = 'pedido' OR quantity IS NOT NULL)
);

INSERT INTO items_new (
  id, store_id, code, kind, acquisition, condition, name, brand, size, cut, color,
  cost_cents, price_cents, quantity, status, location, notes, intake_date,
  held_by_session, contract_id, tailoring_started_at, tailoring_done_at,
  ready_notified_at, delivered_at, needs_review, review_fields, created_at, updated_at
)
SELECT
  id, store_id, code,
  CASE
    WHEN kind <> 'accessory' THEN kind
    -- Same split the catalog importer and the kiosk's old client-side guess
    -- both used, now a real column instead of a name regex read at render
    -- time. A code or name that matches none of the specific words is 'otros'
    -- — the website's own generic "Accesorios" category, with nothing more
    -- specific underneath it, lands here too.
    WHEN code LIKE '%mantilla%' OR name LIKE '%mantilla%' THEN 'mantilla'
    WHEN code LIKE '%tiara%' OR name LIKE '%tiara%' OR code LIKE '%tocado%' OR name LIKE '%tocado%'
      OR code LIKE '%corona%' OR name LIKE '%corona%' THEN 'tiara'
    WHEN code LIKE '%cinto%' OR name LIKE '%cinto%' OR code LIKE '%cinturon%' OR name LIKE '%cinturon%'
      OR code LIKE '%cinturón%' OR name LIKE '%cinturón%' THEN 'cinto'
    ELSE 'otros'
  END,
  acquisition, condition, name, brand, size, cut, color, cost_cents, price_cents,
  -- Every existing accessory row was one physical unit with its own code and
  -- its own row — exactly a quantity of 1. A made-to-order one (there are
  -- none in the seed today, but the importer can produce them) keeps NULL.
  CASE WHEN kind <> 'accessory' THEN NULL WHEN acquisition = 'pedido' THEN NULL ELSE 1 END,
  status, location, notes, intake_date, held_by_session, contract_id,
  tailoring_started_at, tailoring_done_at, ready_notified_at, delivered_at,
  needs_review, review_fields, created_at, updated_at
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX idx_items_store_status ON items (store_id, status);
CREATE INDEX idx_items_hold         ON items (held_by_session);
CREATE INDEX idx_items_contract     ON items (contract_id);
CREATE INDEX idx_items_code         ON items (store_id, code);
CREATE INDEX idx_items_needs_review ON items (store_id, needs_review);

PRAGMA foreign_keys = ON;
