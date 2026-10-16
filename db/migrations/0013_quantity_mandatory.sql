-- La cantidad pasa a ser obligatoria (worker/lib/items.ts → reviewFields): un
-- artículo sin cantidad se marca «falta cantidad» y no se puede vender hasta que
-- se cuente. Con cantidad 0 sigue sin marcarse nunca: «No disponible» manda.
--
-- `needs_review` y `review_fields` son derivados; aquí se recalculan una vez
-- con la regla completa (la misma, en el mismo orden, que reviewFields). No se
-- toca ningún otro dato.
UPDATE items
   SET review_fields = CASE
     WHEN quantity = 0 THEN NULL
     ELSE NULLIF(TRIM(
       (CASE WHEN price_cents IS NULL OR price_cents <= 0 THEN ',price' ELSE '' END) ||
       (CASE WHEN TRIM(IFNULL(code, '')) = '' OR code LIKE 's/n-%' THEN ',code' ELSE '' END) ||
       (CASE WHEN TRIM(IFNULL(name, '')) = '' THEN ',name' ELSE '' END) ||
       (CASE WHEN kind = 'dress' AND TRIM(IFNULL(brand, '')) = '' THEN ',brand' ELSE '' END) ||
       (CASE WHEN quantity IS NULL THEN ',quantity' ELSE '' END) ||
       (CASE WHEN NOT EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = items.id) THEN ',photo' ELSE '' END)
     , ','), '')
   END;

UPDATE items SET needs_review = CASE WHEN review_fields IS NULL THEN 0 ELSE 1 END;
