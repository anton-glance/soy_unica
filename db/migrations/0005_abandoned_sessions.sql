-- ════════════════════════════════════════════════════════════════════════════
-- Sesiones abandonadas.
--
-- `outcome = 'abandoned'` estaba en el esquema desde el principio y nunca lo
-- escribía nadie: una sesión sólo se cerraba a mano, con el NIP. Cuando la
-- vendedora apaga la tableta al final del día sin cerrar la sesión, los
-- apartados de esa novia se quedan en 'watching' para siempre y a la mañana
-- siguiente esos vestidos ya no aparecen en el kiosco, sin forma de arreglarlo
-- desde la tienda.
--
-- Ahora una sesión sin actividad por N horas se cierra sola como abandonada y
-- suelta sus apartados. Se le conservan sus eventos y sus favoritos: no compró,
-- pero vino, y eso sigue siendo el registro de lo que pasó.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE kiosk_sessions ADD COLUMN abandoned_at TEXT;

-- Cuántas horas sin actividad antes de darla por abandonada. Cuatro es una
-- tarde completa: una novia que se prueba vestidos y se va a comer vuelve
-- antes; una tableta apagada, no.
ALTER TABLE stores ADD COLUMN session_timeout_hours INTEGER NOT NULL DEFAULT 4
  CHECK (session_timeout_hours >= 1);

-- El barrido busca las abiertas de una sucursal: sin esto recorre la tabla
-- entera cada vez.
CREATE INDEX idx_kiosk_sessions_open ON kiosk_sessions (store_id, closed_at);
