-- Nuevas reglas de «por verificar» (worker/lib/items.ts → reviewFields):
--
--   · obligatorios: precio, código, modelo, foto — y marca, sólo en vestidos;
--   · costo, talla, corte, color y notas dejaron de ser huecos;
--   · un artículo en cero existencias nunca se marca: «No disponible» manda.
--
-- `needs_review` y `review_fields` son derivados (se recalculan en cada
-- escritura que puede llenar un hueco), así que aquí sólo se recalculan una
-- vez para lo que ya está en la tabla. No se toca ningún otro dato.
UPDATE items
   SET review_fields = CASE
     WHEN quantity = 0 THEN NULL
     ELSE NULLIF(TRIM(
       (CASE WHEN price_cents IS NULL OR price_cents <= 0 THEN ',price' ELSE '' END) ||
       (CASE WHEN TRIM(IFNULL(code, '')) = '' OR code LIKE 's/n-%' THEN ',code' ELSE '' END) ||
       (CASE WHEN TRIM(IFNULL(name, '')) = '' THEN ',name' ELSE '' END) ||
       (CASE WHEN kind = 'dress' AND TRIM(IFNULL(brand, '')) = '' THEN ',brand' ELSE '' END) ||
       (CASE WHEN NOT EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = items.id) THEN ',photo' ELSE '' END)
     , ','), '')
   END;

UPDATE items SET needs_review = CASE WHEN review_fields IS NULL THEN 0 ELSE 1 END;
