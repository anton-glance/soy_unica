-- Soy Única Novias — esquema inicial.
--
-- Reglas del esquema:
--   · Todo el dinero es entero en centavos (MXN). Nunca punto flotante.
--   · Las fechas de calendario son TEXT 'YYYY-MM-DD'.
--   · Las marcas de tiempo son TEXT ISO-8601 en UTC.
--   · Los booleanos son INTEGER 0/1.
--
-- Orden de creación: las llaves foráneas apuntan siempre hacia atrás. El único
-- ciclo del modelo (contracts.session_id ↔ kiosk_sessions.contract_id) se rompe
-- dejando kiosk_sessions.contract_id sin REFERENCES; el Worker lo mantiene.

-- ─────────────────────────────────────────────────────────── sucursales ──
CREATE TABLE stores (
  id                              TEXT PRIMARY KEY CHECK (id IN ('mty','cdmx')),
  name                            TEXT NOT NULL,
  address                         TEXT NOT NULL DEFAULT '',
  phone                           TEXT NOT NULL DEFAULT '',
  currency                        TEXT NOT NULL DEFAULT 'MXN',
  timezone                        TEXT NOT NULL DEFAULT 'America/Monterrey',
  kiosk_show_prices               INTEGER NOT NULL DEFAULT 1 CHECK (kiosk_show_prices IN (0,1)),
  report_email                    TEXT,
  min_days_before_wedding         INTEGER NOT NULL DEFAULT 15 CHECK (min_days_before_wedding >= 0),
  next_folio_seq                  INTEGER NOT NULL DEFAULT 1 CHECK (next_folio_seq >= 1),
  contract_template               TEXT NOT NULL DEFAULT '',
  hotel_daily_cents               INTEGER NOT NULL DEFAULT 3000 CHECK (hotel_daily_cents >= 0),
  hotel_free_days                 INTEGER NOT NULL DEFAULT 10 CHECK (hotel_free_days >= 0),
  late_fee_pct                    REAL    NOT NULL DEFAULT 5 CHECK (late_fee_pct >= 0 AND late_fee_pct <= 100),
  -- Pisos de retención: §8. El Worker los vuelve a validar antes de guardar.
  retention_sold_photos_months    INTEGER NOT NULL DEFAULT 24 CHECK (retention_sold_photos_months >= 0),
  retention_client_docs_months    INTEGER NOT NULL DEFAULT 60 CHECK (retention_client_docs_months >= 24),
  retention_expense_photos_months INTEGER NOT NULL DEFAULT 60 CHECK (retention_expense_photos_months >= 12),
  archive_target                  TEXT NOT NULL DEFAULT 'none' CHECK (archive_target IN ('none','gdrive')),
  archive_before_delete           INTEGER NOT NULL DEFAULT 1 CHECK (archive_before_delete IN (0,1)),
  created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ─────────────────────────────────────────────────────────── usuarios ────
-- Un renglón por persona por sucursal. El NIP se guarda como PBKDF2-SHA256
-- (100 000 iteraciones, sal por usuario). Nunca en claro.
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','seller')),
  pin_hash   TEXT NOT NULL,
  pin_salt   TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (store_id, name)
);
CREATE INDEX idx_users_store_role ON users (store_id, role, active);

-- ─────────────────────────────────────────────────────────── clientas ───
CREATE TABLE customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  apellido     TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  -- phone sin separadores, para que la búsqueda encuentre 8110001122 igual
  -- que "81 1000 11 22".
  phone_digits TEXT NOT NULL DEFAULT '',
  wedding_date TEXT CHECK (wedding_date IS NULL OR wedding_date LIKE '____-__-__'),
  source       TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_customers_phone ON customers (store_id, phone_digits);
CREATE INDEX idx_customers_name  ON customers (store_id, name, apellido);

-- ─────────────────────────────────────────────────── planes de pago ─────
-- Conjunto fijo. No hay armado de planes por clienta: la dueña es explícita
-- en que los planes a la medida son imposibles de seguir.
CREATE TABLE plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- JSON: porcentajes enteros que suman 100, en orden. [50,50] = mitad y mitad.
  splits          TEXT NOT NULL CHECK (json_valid(splits)),
  min_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_price_cents >= 0),
  max_price_cents INTEGER CHECK (max_price_cents IS NULL OR max_price_cents >= min_price_cents),
  max_months      INTEGER NOT NULL DEFAULT 0 CHECK (max_months >= 0),
  discount_pct    REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort            INTEGER NOT NULL DEFAULT 0,
  UNIQUE (store_id, name)
);

-- ────────────────────────────────────────────────────────── cargos ──────
CREATE TABLE surcharges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('envio','talla','ajuste','hotel','otro')),
  -- Marca o expresión de talla a la que aplica; NULL = a criterio de la vendedora.
  applies_to   TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  pct          REAL NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 100),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_surcharges_store ON surcharges (store_id, active, kind);

-- ─────────────────────────────────────────────────────── comisiones ─────
CREATE TABLE commission_rules (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id              TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  priority              INTEGER NOT NULL DEFAULT 0,
  min_price_cents       INTEGER NOT NULL DEFAULT 0 CHECK (min_price_cents >= 0),
  max_price_cents       INTEGER CHECK (max_price_cents IS NULL OR max_price_cents >= min_price_cents),
  sold_at_or_above_list INTEGER CHECK (sold_at_or_above_list IS NULL OR sold_at_or_above_list IN (0,1)),
  rate_pct              REAL NOT NULL DEFAULT 0 CHECK (rate_pct >= 0 AND rate_pct <= 100),
  basis                 TEXT NOT NULL CHECK (basis IN ('cash','sale_value','split')),
  period                TEXT NOT NULL CHECK (period IN ('weekly','monthly')),
  active                INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE INDEX idx_commission_store ON commission_rules (store_id, active, priority);

-- ──────────────────────────────────────────── categorías de gasto ───────
CREATE TABLE expense_categories (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  sort     INTEGER NOT NULL DEFAULT 0,
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (store_id, name)
);

-- ─────────────────────────────────────────────── sesiones de venta ──────
CREATE TABLE kiosk_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL DEFAULT '',
  opened_by    INTEGER NOT NULL REFERENCES users(id),
  opened_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  stage        TEXT NOT NULL DEFAULT 'browsing' CHECK (stage IN (
                 'browsing','fitting','selected','bride_data','sheet_printed',
                 'sheet_signed','terms','contract_printed','signed','payment','closed')),
  customer_id  INTEGER REFERENCES customers(id),
  -- Sin REFERENCES a propósito: rompe el ciclo con contracts.session_id.
  contract_id  INTEGER,
  closed_at    TEXT,
  outcome      TEXT CHECK (outcome IS NULL OR outcome IN ('won','lost','abandoned')),
  reason       TEXT,
  note         TEXT,
  -- NULL = no se imprimieron hojas; 1 = la vendedora confirmó destruirlas.
  sheets_disposed INTEGER CHECK (sheets_disposed IS NULL OR sheets_disposed IN (0,1)),
  CHECK (closed_at IS NULL OR outcome IS NOT NULL)
);
CREATE INDEX idx_sessions_store_open ON kiosk_sessions (store_id, closed_at);

-- ───────────────────────────────────────────────────────── contratos ────
CREATE TABLE contracts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Se emite una sola vez desde stores.next_folio_seq y jamás se reutiliza,
  -- ni siquiera cuando el contrato queda en 'cancelled'.
  folio              TEXT NOT NULL UNIQUE,
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  seller_id          INTEGER NOT NULL REFERENCES users(id),
  session_id         INTEGER REFERENCES kiosk_sessions(id),
  signed_at          TEXT,
  plan_id            INTEGER REFERENCES plans(id),
  -- Copia del nombre del plan al momento de firmar: el papel es el registro legal
  -- y el plan pudo haber cambiado de nombre después.
  plan_name          TEXT,
  list_total_cents   INTEGER NOT NULL DEFAULT 0 CHECK (list_total_cents >= 0),
  discount_cents     INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  gift_credit_cents  INTEGER NOT NULL DEFAULT 0 CHECK (gift_credit_cents >= 0),
  credit_applied_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_applied_cents >= 0),
  total_cents        INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                       'draft','active','paid','delivered','cancelled',
                       'cancelled_forfeit','transferred','void')),
  printed_at         TEXT,
  closed_at          TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_contracts_store_status ON contracts (store_id, status);
CREATE INDEX idx_contracts_customer     ON contracts (customer_id);
CREATE INDEX idx_contracts_session      ON contracts (session_id);

-- ────────────────────────────────────────────────────────── archivos ────
CREATE TABLE files (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN (
                'item_photo','receipt','expense','measurement_sheet',
                'contract','adjustments','delivery')),
  bytes       INTEGER NOT NULL CHECK (bytes > 0),
  mime        TEXT NOT NULL CHECK (mime IN ('image/webp','image/jpeg')),
  width       INTEGER,
  height      INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  contract_id INTEGER REFERENCES contracts(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Sellado por el archivador antes de que la retención pueda borrar el archivo.
  archived_at TEXT,
  archive_ref TEXT
);
CREATE INDEX idx_files_store_kind ON files (store_id, kind, created_at);
CREATE INDEX idx_files_contract   ON files (contract_id, kind);

-- ───────────────────────────────────────────────────── inventario ───────
CREATE TABLE items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id             TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Su propia nomenclatura: p139, s14, A12, madelyn, mantilla 039.
  code                 TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('dress','accessory')),
  -- 'pedido' = se manda a hacer. Nunca se aparta ni cambia de estado.
  acquisition          TEXT NOT NULL CHECK (acquisition IN ('unidad','pedido')),
  condition            TEXT NOT NULL CHECK (condition IN ('nuevo','muestra','exhibicion','liquidacion')),
  name                 TEXT NOT NULL,
  brand                TEXT,
  size                 TEXT,
  cut                  TEXT,
  color                TEXT,
  cost_cents           INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  price_cents          INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
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
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (store_id, code),
  -- Los modelos por pedido no se apartan: dos novias pueden encargar el mismo.
  CHECK (acquisition <> 'pedido' OR (held_by_session IS NULL AND status = 'available'))
);
CREATE INDEX idx_items_store_status ON items (store_id, status);
CREATE INDEX idx_items_hold         ON items (held_by_session);
CREATE INDEX idx_items_contract     ON items (contract_id);
CREATE INDEX idx_items_code         ON items (store_id, code);

CREATE TABLE item_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  UNIQUE (item_id, file_id)
);
CREATE INDEX idx_item_photos_item ON item_photos (item_id, sort);

-- ────────────────────────────────────── renglones del contrato ──────────
-- Toda venta es un vestido más accesorios numerados: se modelan como
-- renglones, nunca como texto suelto en un campo.
CREATE TABLE contract_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  item_id     INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  line_kind   TEXT NOT NULL CHECK (line_kind IN ('dress','accessory','surcharge','gift_credit')),
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_contract_items ON contract_items (contract_id, sort);

-- ──────────────────────────────────────────────── plan acordado ─────────
-- Estas son las parcialidades pactadas: la base de todo vencimiento, atraso
-- y cuenta por cobrar. La cobertura se deriva de los pagos, no se guarda aquí.
CREATE TABLE installments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  due_type     TEXT NOT NULL CHECK (due_type IN ('fixed','on_pickup')),
  due_date     TEXT CHECK (due_date IS NULL OR due_date LIKE '____-__-__'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (contract_id, seq),
  CHECK ((due_type = 'fixed' AND due_date IS NOT NULL)
      OR (due_type = 'on_pickup' AND due_date IS NULL))
);

-- ──────────────────────────────────────────────────────────── pagos ─────
-- Sólo se agregan. Una corrección es una cancelación con motivo (dueña) más
-- un pago nuevo; el renglón cancelado sigue a la vista.
CREATE TABLE payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id    INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  paid_at        TEXT NOT NULL CHECK (paid_at LIKE '____-__-__'),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  method         TEXT NOT NULL CHECK (method IN ('cash','transfer')),
  receipt_folio  TEXT,
  collected_by   INTEGER NOT NULL REFERENCES users(id),
  -- La parcialidad a la que la vendedora dirigió el abono. El saldo nunca
  -- depende de este campo; sirve para leer el plan contra lo realmente pagado.
  installment_id INTEGER REFERENCES installments(id),
  voided_at      TEXT,
  voided_by      INTEGER REFERENCES users(id),
  void_reason    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (voided_at IS NULL OR (voided_by IS NOT NULL AND void_reason IS NOT NULL AND length(trim(void_reason)) > 0))
);
CREATE INDEX idx_payments_contract ON payments (contract_id, paid_at);
CREATE INDEX idx_payments_store    ON payments (store_id, paid_at);

CREATE TABLE payment_files (
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (payment_id, file_id)
);

-- ───────────────────────────────────────────── favoritos y bitácora ─────
CREATE TABLE session_favorites (
  session_id INTEGER NOT NULL REFERENCES kiosk_sessions(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (session_id, item_id)
);

CREATE TABLE session_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES kiosk_sessions(id) ON DELETE CASCADE,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  stage      TEXT NOT NULL,
  detail     TEXT
);
CREATE INDEX idx_session_events ON session_events (session_id, at);

-- ───────────────────────────────────────────────────────── traspaso ─────
CREATE TABLE credits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  from_contract_id INTEGER NOT NULL REFERENCES contracts(id),
  to_contract_id   INTEGER REFERENCES contracts(id),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  expires_at       TEXT CHECK (expires_at IS NULL OR expires_at LIKE '____-__-__'),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','expired','void')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_credits_store ON credits (store_id, status);

-- ───────────────────────────────────────────────────────────── gastos ───
CREATE TABLE expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  spent_at     TEXT NOT NULL CHECK (spent_at LIKE '____-__-__'),
  category     TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  vendor       TEXT,
  note         TEXT,
  file_id      TEXT REFERENCES files(id),
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_expenses_store_date ON expenses (store_id, spent_at);

-- ────────────────────────────────────────────────────────── bitácora ────
-- Toda modificación, borrado y cancelación deja renglón. También los intentos
-- de NIP, que es de donde el Worker deriva el bloqueo por intentos fallidos.
CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  user_id   INTEGER REFERENCES users(id),
  store_id  TEXT REFERENCES stores(id),
  entity    TEXT NOT NULL,
  entity_id TEXT,
  action    TEXT NOT NULL,
  before    TEXT,
  after     TEXT
);
CREATE INDEX idx_audit_store_at ON audit_log (store_id, at);
CREATE INDEX idx_audit_entity   ON audit_log (entity, entity_id, at);
CREATE INDEX idx_audit_auth     ON audit_log (entity, store_id, entity_id, at);
