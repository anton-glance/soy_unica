-- Generado por scripts/import/catalog.mjs. NO editar a mano.
-- Aplicar SÓLO a la base local hasta que el reporte esté revisado:
--   npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/catalog.sql
--
-- Los artículos que ya existan con el mismo código no se tocan.

-- https://soyunicanovias.com/producto/vestido-madelyn/
INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, color, price_cents, notes, intake_date)
  VALUES ('mty', 'p139', 'dress', 'pedido', 'nuevo', 'Vestido Madelyn', 'Lanesta',
          'Ivory', 1850000, 'importado del sitio · Vestidos de novia', date('now'));

-- https://soyunicanovias.com/producto/mantilla-larga-bordada/
INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, color, price_cents, notes, intake_date)
  VALUES ('mty', 'mantilla-larga-bordada', 'accessory', 'pedido', 'nuevo', 'Mantilla larga bordada', NULL,
          NULL, 90000, 'importado del sitio · Accesorios, Mantillas', date('now'));

-- 103
INSERT OR IGNORE INTO items (store_id, code, kind, acquisition, condition, name, brand, color, price_cents, notes, intake_date)
  VALUES ('mty', 'p142', 'dress', 'pedido', 'nuevo', 'Vestido Aurora', 'Kira Nova',
          NULL, 1650000, 'importado del sitio · Vestidos de novia', date('now'));