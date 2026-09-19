-- `reviewFields()` ahora exige una foto, pero `needs_review`/`review_fields`
-- nunca se recalculan solos: sólo cuando algo escribe sobre la fila. Sin este
-- backfill, todo lo que ya estaba en el inventario antes de este cambio —la
-- inmensa mayoría, hoy sin fotos— se seguiría viendo como si no le faltara
-- nada, tanto en la columna «Fotos» como en «Por verificar».
UPDATE items
   SET needs_review = 1,
       review_fields = CASE
         WHEN review_fields IS NULL OR review_fields = '' THEN 'photo'
         WHEN review_fields LIKE '%photo%' THEN review_fields
         ELSE review_fields || ',photo'
       END
 WHERE id NOT IN (SELECT DISTINCT item_id FROM item_photos);
