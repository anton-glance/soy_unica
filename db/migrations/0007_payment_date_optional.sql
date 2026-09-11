-- ════════════════════════════════════════════════════════════════════════════
-- La fecha de un abono puede faltar, y sólo en la historia importada.
--
-- En el libro hay celdas como «2800 28-2», donde la fecha quedó a medias y no
-- hay forma de saber de qué mes hablaba. Inventarle una fecha a un pago que de
-- verdad ocurrió es peor que dejarla en blanco: el monto es un hecho y la fecha
-- no se sabe. Se conserva además el texto original de la celda.
--
-- SQLite no deja quitar un NOT NULL en el lugar, así que se reconstruye la
-- tabla. Nada apunta a `payments` con llave foránea, así que la reconstrucción
-- es segura.
-- ════════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = OFF;

CREATE TABLE payments_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id    INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Nula únicamente en renglones importados: la API siempre manda una fecha.
  paid_at        TEXT CHECK (paid_at IS NULL OR paid_at LIKE '____-__-__'),
  -- El texto tal cual venía en la celda del libro, para poder volver a él.
  paid_at_raw    TEXT,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  method         TEXT NOT NULL CHECK (method IN ('cash','transfer')),
  receipt_folio  TEXT,
  collected_by   INTEGER NOT NULL REFERENCES users(id),
  installment_id INTEGER REFERENCES installments(id),
  voided_at      TEXT,
  voided_by      INTEGER REFERENCES users(id),
  void_reason    TEXT,
  imported       INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (voided_at IS NULL OR (voided_by IS NOT NULL AND void_reason IS NOT NULL AND length(trim(void_reason)) > 0)),
  -- Sin fecha sólo se admite lo importado.
  CHECK (paid_at IS NOT NULL OR imported = 1)
);

INSERT INTO payments_new (id, contract_id, store_id, paid_at, amount_cents, method, receipt_folio,
                          collected_by, installment_id, voided_at, voided_by, void_reason, imported, created_at)
  SELECT id, contract_id, store_id, paid_at, amount_cents, method, receipt_folio,
         collected_by, installment_id, voided_at, voided_by, void_reason, imported, created_at
    FROM payments;

DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX idx_payments_contract ON payments (contract_id);

PRAGMA foreign_keys = ON;
