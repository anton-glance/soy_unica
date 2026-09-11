-- ════════════════════════════════════════════════════════════════════════════
-- Los modelos por pedido compartían nombre con la unidad que está en el rack:
-- «Madelyn» $18,500 (p139, de unidad) y «Madelyn» $21,000 (madelyn, a medida),
-- lo mismo con «Aurora». En el kiosco y en los favoritos eso se lee como un
-- vestido repetido a dos precios, no como dos artículos distintos.
--
-- No eran favoritos duplicados: marcar dos veces el mismo vestido ya es
-- imposible (`session_favorites` tiene PRIMARY KEY (session_id, item_id) y se
-- inserta con INSERT OR IGNORE). Eran dos renglones de existencias con el
-- mismo nombre. Se les pone el suyo.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE items
   SET name = name || ' a medida'
 WHERE acquisition = 'pedido'
   AND name NOT LIKE '% a medida'
   AND EXISTS (
     SELECT 1 FROM items other
      WHERE other.store_id = items.store_id
        AND other.name     = items.name
        AND other.id      <> items.id
   );

-- No se pone un índice único sobre (store_id, name) a propósito: dos unidades
-- del mismo modelo en tallas distintas sí se llaman igual, y eso es correcto.
-- Lo que no puede repetirse es el código, que ya es único por sucursal.
