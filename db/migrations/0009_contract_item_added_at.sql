-- ════════════════════════════════════════════════════════════════════════════
-- Cuándo se agregó cada renglón del contrato.
--
-- Round 6: una clienta puede volver ya con el contrato firmado a comprar sólo
-- un accesorio — sin sesión, sin medidas, sin contrato nuevo (docs/NEXT.md,
-- «Accesorios después del contrato»). Se agrega al mismo contrato como un
-- renglón más de `contract_items`, pero entonces ese renglón deja de ser algo
-- que la vendedora escogió al momento de elegir el vestido: el reporte de la
-- dueña necesita distinguir uno de otro para mostrar la venta original aparte
-- de lo que se le sumó después.
--
-- NULL = renglón original, escrito por /sessions/:id/select o /sessions/:id/terms.
-- No NULL = se agregó después de firmado, con la fecha en que se agregó.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE contract_items ADD COLUMN added_at TEXT;
