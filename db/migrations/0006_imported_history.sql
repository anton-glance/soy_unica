-- ════════════════════════════════════════════════════════════════════════════
-- Historia importada del libro de pagos.
--
-- Los contratos de 2026 vienen de `docs/pagos.xlsx`, no del sistema. Sus abonos
-- no tienen foto del comprobante y nunca la van a tener: se cobraron antes de
-- que el sistema existiera. La regla de «ningún abono sin comprobante» no se
-- toca —sigue valiendo en la API, para todo lo que se capture de hoy en
-- adelante—; lo que se marca es cuáles renglones son historia importada, y la
-- excepción vive únicamente en el camino de importación.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE payments  ADD COLUMN imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1));
ALTER TABLE contracts ADD COLUMN imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1));

-- De dónde salió cada contrato importado: hoja y renglón del libro, para poder
-- volver al original cuando algo no cuadre.
ALTER TABLE contracts ADD COLUMN import_source TEXT;

CREATE INDEX idx_contracts_imported ON contracts (store_id, imported);
