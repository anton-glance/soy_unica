-- ════════════════════════════════════════════════════════════════════════════
-- Dos cosas, las dos sobre lo que queda escrito.
--
-- 1. El calendario de pagos se congela cuando se escoge el plan, y el papel
--    manda. Antes se volvía a generar al firmar con la fecha de firma: si la
--    vendedora imprimía el jueves y la novia firmaba el viernes, el papel que
--    ella se llevaba y la base de datos no coincidían en una sola fecha de
--    vencimiento. Ahora se guarda con qué día se generó y firmar en otro día
--    obliga a reimprimir.
--
-- 2. La sesión es el registro de lo que pasó con una clienta que entró, haya
--    comprado o no. Faltaban tres cosas para que lo fuera: en qué etapa murió,
--    qué escogió la vendedora (aparte del contrato, que puede quedar anulado)
--    y el momento en que la tableta pasó de manos.
-- ════════════════════════════════════════════════════════════════════════════

-- El día con el que se generó el calendario. Es la fecha que salió impresa.
ALTER TABLE contracts ADD COLUMN schedule_generated_on TEXT
  CHECK (schedule_generated_on IS NULL OR schedule_generated_on LIKE '____-__-__');

-- La etapa a la que llegó la sesión antes de cerrarse. `stage` se sobreescribe
-- con 'closed' y se perdía: sin esto, «murió en datos de la novia» y «murió
-- viendo el catálogo» se leen igual.
ALTER TABLE kiosk_sessions ADD COLUMN closed_at_stage TEXT;

-- Lo que la vendedora escogió, en el renglón de la sesión y no sólo en el del
-- contrato: un contrato anulado sigue existiendo, pero la selección es un
-- hecho de la sesión y tiene que sobrevivir a cualquier cosa que le pase al
-- contrato.
CREATE TABLE session_selections (
  session_id INTEGER NOT NULL REFERENCES kiosk_sessions(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  line_kind  TEXT NOT NULL CHECK (line_kind IN ('dress','accessory')),
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (session_id, item_id)
);
CREATE INDEX idx_session_selections_session ON session_selections (session_id);

-- Los favoritos dejan de borrarse al cerrar (ver worker/routes/sessions.ts):
-- son la señal de demanda de la semana. Este índice es para el reporte.
CREATE INDEX idx_session_favorites_item ON session_favorites (item_id);
