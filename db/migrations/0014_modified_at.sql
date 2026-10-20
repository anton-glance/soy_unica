-- «Mod.» en el inventario: cuándo se tocó por última vez cada artículo.
--
-- `updated_at` ya existía pero se mueve también cuando una novia sólo está
-- viendo un vestido (el apartado «viendo ahora»), así que no sirve para eso.
-- `modified_at` es aparte y sólo lo mueve un cambio de verdad.

ALTER TABLE items ADD COLUMN modified_at TEXT;

-- Lo que ya hay: si la base tiene registro de un cambio (`updated_at` posterior
-- a `created_at`), se usa; si no, se toma la fecha de ingreso, y si tampoco la
-- hay, la de alta.
UPDATE items
   SET modified_at = CASE
     WHEN updated_at > created_at THEN updated_at
     ELSE COALESCE(NULLIF(intake_date, ''), created_at)
   END;

-- Lo que venga: un artículo nuevo nace modificado hoy…
CREATE TRIGGER items_modified_on_insert AFTER INSERT ON items
BEGIN
  UPDATE items SET modified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
   WHERE id = NEW.id AND modified_at IS NULL;
END;

-- …y cualquier cambio a sus datos lo mueve, también los que hace una venta
-- (cantidad, estado, contrato, costura, entrega). Se escucha por columna, así
-- que lo derivado (`needs_review`, `review_fields`) y el apartado temporal
-- (`held_by_session`) no cuentan; y pasar de «disponible» a «viendo ahora» y
-- de regreso tampoco, que es sólo alguien mirando el artículo.
CREATE TRIGGER items_modified_on_update
AFTER UPDATE OF code, kind, acquisition, condition, name, brand, size, cut, color,
                cost_cents, price_cents, quantity, status, location, notes, intake_date,
                contract_id, tailoring_started_at, tailoring_done_at, ready_notified_at,
                delivered_at ON items
WHEN NOT (OLD.status = 'available' AND NEW.status = 'watching')
 AND NOT (OLD.status = 'watching' AND NEW.status = 'available')
BEGIN
  UPDATE items SET modified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id;
END;

-- Cambiar las fotos también es cambiar el artículo.
CREATE TRIGGER items_modified_on_photo_insert AFTER INSERT ON item_photos
BEGIN
  UPDATE items SET modified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.item_id;
END;
CREATE TRIGGER items_modified_on_photo_update AFTER UPDATE ON item_photos
BEGIN
  UPDATE items SET modified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.item_id;
END;
CREATE TRIGGER items_modified_on_photo_delete AFTER DELETE ON item_photos
BEGIN
  UPDATE items SET modified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.item_id;
END;
