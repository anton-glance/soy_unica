-- Generado por scripts/import/pagos.mjs. NO editar a mano.
-- Aplicar SÓLO a la base local hasta que el reporte esté revisado:
--   npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/pagos.sql
--
-- Sin BEGIN/COMMIT: D1 aplica el archivo como un lote y rechaza las
-- transacciones explícitas.
-- La vendedora de todos estos contratos es la dueña de mty, que es quien importa.

-- ene 26 fila 2 · evelyn yazmin flores · p53 , mantilla 045
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'evelyn', 'yazmin flores', 'pagos.xlsx', 'ene 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0001', last_insert_rowid(), u.id, 'active',
         '2026-01-10', 'Histórico (importado)', 2350000, 150000, 2200000, 1,
         'pagos.xlsx · ene 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0001'), NULL, 'p53', 2350000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0001'), NULL, 'mantilla 045', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0001'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-10', 'anticipo', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0001';

-- ene 26 fila 3 · laura denise sifuentes · s10 de exhibicion
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'laura', 'denise sifuentes', 'pagos.xlsx', 'ene 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0002', last_insert_rowid(), u.id, 'paid',
         '2026-01-16', 'Histórico (importado)', 400000, 0, 400000, 1,
         'pagos.xlsx · ene 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0002'), NULL, 's10 de exhibicion', 400000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-16', 'anticipo', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0002';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-17', '2100 17 feb', 210000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0002';

-- ene 26 fila 4 · karina elizabeth kiroga · p139,mantilla045 crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'karina', 'elizabeth kiroga', 'pagos.xlsx', 'ene 26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0003', last_insert_rowid(), u.id, 'paid',
         '2026-01-17', 'Histórico (importado)', 1970000, 0, 1970000, 1,
         'pagos.xlsx · ene 26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0003'), 1, 'p139', 1970000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0003'), NULL, 'mantilla045 crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-17', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-17', '3375 17 feb', 337500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-17', '3375 17 mar', 337500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-17', '3375 17 abril', 337500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', '3375 6-jun', 337500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-07', '200 7-jun', 20000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-06', '1100 6-jul', 110000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0003';

-- ene 26 fila 5 · hannia yamileth rodriguez · p146, velo 022
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'hannia', 'yamileth rodriguez', 'pagos.xlsx', 'ene 26 fila 5');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0004', last_insert_rowid(), u.id, 'paid',
         '2026-01-24', 'Histórico (importado)', 1850000, 150000, 1700000, 1,
         'pagos.xlsx · ene 26 · fila 5'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0004'), NULL, 'p146', 1850000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0004'), NULL, 'velo 022', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0004'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-24', 'anticipo', 330000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-21', '3425 21 feb', 342500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-21', '3500 21 marz', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-24', '3500 24 abril', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-26', '3300 26 mayo', 330000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', '70 6-jun', 7000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0004';

-- ene 26 fila 6 · alejandra jaime · j1129, ,mantilla 016 3 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'alejandra', 'jaime', 'pagos.xlsx', 'ene 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0005', last_insert_rowid(), u.id, 'paid',
         '2026-01-24', 'Histórico (importado)', 3365000, 250000, 3115000, 1,
         'pagos.xlsx · ene 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0005'), NULL, 'j1129', 3365000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0005'), NULL, 'mantilla 016 3 aros', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0005'), NULL, 'Regalo para accesorios', -250000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-24', 'anticipo', 1180000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-24', '5900 24 feb', 590000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-24', '650 24 feb', 65000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-20', '5900 20 marz', 590000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-09', '5900 9 abril', 590000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-28', '200 28 abril', 20000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-18', '900 18-may', 90000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0005';

-- ene 26 fila 7 · lizbeth jaqueline villanueva · melissa ,crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'lizbeth', 'jaqueline villanueva', 'pagos.xlsx', 'ene 26 fila 7');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0006', last_insert_rowid(), u.id, 'paid',
         '2026-01-29', 'Histórico (importado)', 1900000, 150000, 1750000, 1,
         'pagos.xlsx · ene 26 · fila 7'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0006'), NULL, 'melissa', 1900000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0006'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0006'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-01-29', 'anticipo', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0006';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-25', '3500 25 feb', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0006';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-26', '3500 26 marz', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0006';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-28', '3500 28 abril', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0006';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-18', '3600 18-jun', 360000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0006';

-- marzo 26 fila 2 · desteny barajas · p20 de liquidacion
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'desteny', 'barajas', 'pagos.xlsx', 'marzo 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0007', last_insert_rowid(), u.id, 'paid',
         '2026-03-07', 'Histórico (importado)', 500000, 0, 500000, 1,
         'pagos.xlsx · marzo 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0007'), NULL, 'p20 de liquidacion', 500000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-07', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0007';

-- marzo 26 fila 3 · sandra lizeth calderon · p68 de liquidacion
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'sandra', 'lizeth calderon', 'pagos.xlsx', 'marzo 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0008', last_insert_rowid(), u.id, 'paid',
         '2026-03-13', 'Histórico (importado)', 150000, 0, 150000, 1,
         'pagos.xlsx · marzo 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0008'), NULL, 'p68 de liquidacion', 150000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-13', 'anticipo', 50000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0008';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-18', '1000 18 marz', 100000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0008';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-26', '100 26 marz', 10000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0008';

-- marzo 26 fila 4 · adiana hernandez · p39 de liquidacion
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'adiana', 'hernandez', 'pagos.xlsx', 'marzo 26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0009', last_insert_rowid(), u.id, 'paid',
         '2026-03-13', 'Histórico (importado)', 1010000, 0, 1010000, 1,
         'pagos.xlsx · marzo 26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0009'), NULL, 'p39 de liquidacion', 1010000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-13', 'anticipo', 1010000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0009';

-- marzo 26 fila 5 · andrea dominguez · p140
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'andrea', 'dominguez', 'pagos.xlsx', 'marzo 26 fila 5');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0010', last_insert_rowid(), u.id, 'paid',
         '2026-03-18', 'Histórico (importado)', 1080000, 0, 1080000, 1,
         'pagos.xlsx · marzo 26 · fila 5'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0010'), NULL, 'p140', 1080000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-18', 'anticipo', 210000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0010';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-15', '8800 15 abr', 880000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0010';

-- marzo 26 fila 6 · blanca aracely reyes · p139
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'blanca', 'aracely reyes', 'pagos.xlsx', 'marzo 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0011', last_insert_rowid(), u.id, 'paid',
         '2026-03-21', 'Histórico (importado)', 1500000, 0, 1500000, 1,
         'pagos.xlsx · marzo 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0011'), 1, 'p139', 1500000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-21', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0011';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-25', '3000 25 abril', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0011';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-23', '3000 23-may', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0011';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-13', '3000 13-jun', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0011';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-25', '3300 25-jul', 330000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0011';

-- marzo 26 fila 7 · nora debany garcia · p142, mantilla 016, tirantes
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'nora', 'debany garcia', 'pagos.xlsx', 'marzo 26 fila 7');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0012', last_insert_rowid(), u.id, 'paid',
         '2026-03-27', 'Histórico (importado)', 1240000, 0, 1240000, 1,
         'pagos.xlsx · marzo 26 · fila 7'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0012'), 2, 'p142', 1240000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0012'), NULL, 'mantilla 016', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0012'), NULL, 'tirantes', 0, 'accessory', 2);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-27', 'anticipo', 496000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0012';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-28', '3800 28 abril', 380000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0012';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-05', '3740 5-jun', 374000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0012';

-- marzo 26 fila 8 · aislin gigdem g · p136- crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'aislin', 'gigdem g', 'pagos.xlsx', 'marzo 26 fila 8');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0013', last_insert_rowid(), u.id, 'active',
         '2026-03-28', 'Histórico (importado)', 1720000, 0, 1720000, 1,
         'pagos.xlsx · marzo 26 · fila 8'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0013'), NULL, 'p136- crinolina 6 aros', 1720000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-28', 'anticipo', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-30', '3200 30 abril', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-01', '3200 1-jun', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-01', '3200 1-jul', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-31', '3200 31-jul', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-01', '200 1-ago', 20000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0013';

-- marzo 26 fila 9 · carolina vaquera gomez · p53, crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'carolina', 'vaquera gomez', 'pagos.xlsx', 'marzo 26 fila 9');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0014', last_insert_rowid(), u.id, 'paid',
         '2026-03-28', 'Histórico (importado)', 2120000, 0, 2120000, 1,
         'pagos.xlsx · marzo 26 · fila 9'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0014'), NULL, 'p53', 2120000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0014'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-28', 'anticipo', 460000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0014';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-28', '4150 28 abril', 415000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0014';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-27', '4150 27-may', 415000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0014';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-27', '4150 27-jun', 415000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0014';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-28', '4150 28-jul', 415000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0014';

-- feb 26 fila 2 · guadalupe del angel · p33 de liquidacion mas ajustes, crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'guadalupe', 'del angel', 'pagos.xlsx', 'feb 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0015', last_insert_rowid(), u.id, 'paid',
         '2026-02-04', 'Histórico (importado)', 780000, 0, 780000, 1,
         'pagos.xlsx · feb 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0015'), NULL, 'p33 de liquidacion mas ajustes', 780000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0015'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-04', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0015';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-04', '4000 4 marz', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0015';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-06', '900 6 may', 90000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0015';

-- feb 26 fila 6 · jackeline cepeda · p47 de liquidacion, crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'jackeline', 'cepeda', 'pagos.xlsx', 'feb 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0016', last_insert_rowid(), u.id, 'active',
         '2026-02-14', 'Histórico (importado)', 1620000, 0, 1620000, 1,
         'pagos.xlsx · feb 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0016'), NULL, 'p47 de liquidacion', 1620000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0016'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-14', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0016';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-14', '9000 14 marz', 900000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0016';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-02', '480 2 mayo', 48000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0016';

-- feb 26 fila 14 · laila cristal · madelyn
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'laila', 'cristal', 'pagos.xlsx', 'feb 26 fila 14');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0017', last_insert_rowid(), u.id, 'active',
         '2026-02-07', 'Histórico (importado)', 2440000, 0, 2440000, 1,
         'pagos.xlsx · feb 26 · fila 14'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0017'), 10, 'madelyn', 2440000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-07', 'anticipo', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-21', '2000 21 feb', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-04', '2000 4-abril', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-25', '2000 25-abril', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', '2000 6-jun', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-15', '3280 15-jul', 328000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-14', '3280 14-ago', 328000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0017';

-- feb 26 fila 15 · juieta yahaira · merry- yana liquidacion, mantilla 039
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'juieta', 'yahaira', 'pagos.xlsx', 'feb 26 fila 15');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0018', last_insert_rowid(), u.id, 'active',
         '2026-02-11', 'Histórico (importado)', 3825000, 0, 3825000, 1,
         'pagos.xlsx · feb 26 · fila 15'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0018'), NULL, 'merry- yana liquidacion', 3825000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0018'), 13, 'mantilla 039', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-11', 'anticipo', 665000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-11', '1000 11 feb', 100000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-11', '6650 11-marz', 665000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-11', '6650 11 -abril', 665000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-11', '6650 11-may', 665000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-10', '6650 10 -jun', 665000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-15', '3500 15 jul', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0018';

-- feb 26 fila 16 · fatima gatica · melissa , mantilla 039
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'fatima', 'gatica', 'pagos.xlsx', 'feb 26 fila 16');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0019', last_insert_rowid(), u.id, 'paid',
         '2026-02-11', 'Histórico (importado)', 2100000, 0, 2100000, 1,
         'pagos.xlsx · feb 26 · fila 16'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0019'), NULL, 'melissa', 2100000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0019'), 13, 'mantilla 039', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-11', 'anticipo', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-12', '2200 12 feb', 220000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-19', '4200 19 marzo', 420000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-14', '4200 14 abril', 420000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-14', '4000 14 -may', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-16', '4400 16-jun', 440000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-25', '250 25-ago', 25000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0019';

-- feb 26 fila 18 · maria del rosario · azalia m,crinolina 6a ,liga,mantilla 022
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'maria', 'del rosario', 'pagos.xlsx', 'feb 26 fila 18');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0020', last_insert_rowid(), u.id, 'paid',
         '2026-02-21', 'Histórico (importado)', 3990000, 300000, 3690000, 1,
         'pagos.xlsx · feb 26 · fila 18'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0020'), NULL, 'azalia m', 3990000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0020'), NULL, 'crinolina 6a', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0020'), NULL, 'liga', 0, 'accessory', 2);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0020'), NULL, 'mantilla 022', 0, 'accessory', 3);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0020'), NULL, 'Regalo para accesorios', -300000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-21', 'anticipo', 730000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0020';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-20', '7300 20 -marz', 730000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0020';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-27', '7300 27-abril', 730000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0020';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-04', '15550 4-jul', 1555000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0020';

-- feb 26 fila 19 · ivette sarahi cabrera · melissa
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'ivette', 'sarahi cabrera', 'pagos.xlsx', 'feb 26 fila 19');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0021', last_insert_rowid(), u.id, 'paid',
         '2026-02-21', 'Histórico (importado)', 1750000, 0, 1750000, 1,
         'pagos.xlsx · feb 26 · fila 19'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0021'), NULL, 'melissa', 1750000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-21', 'anticipo', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-20', '2000 20-mar', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-21', '2000 21 -abri', 200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-19', '4000 19-may', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-15', '3000 15-jun', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-21', '3050 21-jul', 305000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0021';

-- feb 26 fila 20 · rocio giselle roque · noeline , mantilla 041
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'rocio', 'giselle roque', 'pagos.xlsx', 'feb 26 fila 20');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0022', last_insert_rowid(), u.id, 'paid',
         '2026-02-21', 'Histórico (importado)', 2870000, 0, 2870000, 1,
         'pagos.xlsx · feb 26 · fila 20'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0022'), NULL, 'noeline', 2870000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0022'), 14, 'mantilla 041', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-21', 'anticipo', 280000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', NULL, '2800', 280000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-31', '5775 31-marz', 577500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', '11550 6-jun', 1155000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-25', '5775 25-jul', 577500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-01', '100 1-ago', 10000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0022';

-- feb 26 fila 21 · ana valeria valerio · p107, t6cad0 66 , mantilla 41
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'ana', 'valeria valerio', 'pagos.xlsx', 'feb 26 fila 21');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0023', last_insert_rowid(), u.id, 'paid',
         '2026-02-23', 'Histórico (importado)', 1610000, 0, 1610000, 1,
         'pagos.xlsx · feb 26 · fila 21'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0023'), NULL, 'p107', 1610000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0023'), NULL, 't6cad0 66', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0023'), NULL, 'mantilla 41', 0, 'accessory', 2);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-23', 'anticipo', 280000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0023';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-25', '2700 25-mar', 270000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0023';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-22', '4750 22 -abr', 475000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0023';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-16', '5850 16-may', 585000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0023';

-- feb 26 fila 22 · ma lourdes diaz · P39, mantilla 45
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'ma', 'lourdes diaz', 'pagos.xlsx', 'feb 26 fila 22');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0024', last_insert_rowid(), u.id, 'active',
         '2026-02-24', 'Histórico (importado)', 2490000, 150000, 2340000, 1,
         'pagos.xlsx · feb 26 · fila 22'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0024'), NULL, 'P39', 2490000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0024'), NULL, 'mantilla 45', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0024'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-24', 'anticipo', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0024';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-24', '4500 24 -mar', 450000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0024';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-23', '4500 23-abril', 450000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0024';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-22', '4500 22-may', 450000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0024';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-22', '4500 22-jun', 450000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0024';

-- feb 26 fila 23 · mariana hernandez · ella
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'mariana', 'hernandez', 'pagos.xlsx', 'feb 26 fila 23');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0025', last_insert_rowid(), u.id, 'paid',
         '2026-02-28', 'Histórico (importado)', 1750000, 150000, 1600000, 1,
         'pagos.xlsx · feb 26 · fila 23'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0025'), NULL, 'ella', 1750000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0025'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-28', 'anticipo', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0025';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-28', '3200 28-mar', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0025';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-30', '3200 30-abril', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0025';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-29', '3200 29-may', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0025';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-30', '3200 30 jun', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0025';

-- feb 26 fila 24 · nereyda concepcion · adelina , tiara 58, cinto 17
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'nereyda', 'concepcion', 'pagos.xlsx', 'feb 26 fila 24');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0026', last_insert_rowid(), u.id, 'paid',
         '2026-02-28', 'Histórico (importado)', 2800000, 300000, 2500000, 1,
         'pagos.xlsx · feb 26 · fila 24'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0026'), NULL, 'adelina', 2800000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0026'), NULL, 'tiara 58', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0026'), NULL, 'cinto 17', 0, 'accessory', 2);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0026'), NULL, 'Regalo para accesorios', -300000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-02-28', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0026';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-03-17', '10000 17 marzo', 1000000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0026';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-23', '5000 23 abril', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0026';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-23', '6150 23 may', 615000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0026';

-- 6 mayo 26 fila 2 · mariana martinez mata · p46 liquidacion, crinolina 3 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'mariana', 'martinez mata', 'pagos.xlsx', '6 mayo 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0027', last_insert_rowid(), u.id, 'active',
         '2026-05-06', 'Histórico (importado)', 1100000, 0, 1100000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0027'), NULL, 'p46 liquidacion', 1100000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0027'), NULL, 'crinolina 3 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-06', 'anticipo', 220000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0027';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-03', '2200 3-jun', 220000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0027';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-06', '2200 6-jul', 220000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0027';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-05', '2200 5-ago', 220000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0027';

-- 6 mayo 26 fila 3 · martha ivonne bazaldua · jazmin
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'martha', 'ivonne bazaldua', 'pagos.xlsx', '6 mayo 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0028', last_insert_rowid(), u.id, 'active',
         '2026-05-07', 'Histórico (importado)', 3950000, 300000, 3650000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0028'), NULL, 'jazmin', 3950000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0028'), NULL, 'Regalo para accesorios', -300000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-07', 'anticipo', 730000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0028';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-20', '3000 20-jul', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0028';

-- 6 mayo 26 fila 4 · blanca cantu · p24 liquidacion capa
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'blanca', 'cantu', 'pagos.xlsx', '6 mayo 26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0029', last_insert_rowid(), u.id, 'active',
         '2026-05-16', 'Histórico (importado)', 500000, 0, 500000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0029'), NULL, 'p24 liquidacion capa', 500000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-16', 'anticipo', 50000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0029';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-30', '1600 30-may', 160000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0029';

-- 6 mayo 26 fila 5 · haidee assi hagmaier · intima
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'haidee', 'assi hagmaier', 'pagos.xlsx', '6 mayo 26 fila 5');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0030', last_insert_rowid(), u.id, 'active',
         '2026-05-23', 'Histórico (importado)', 4200000, 300000, 3900000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 5'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0030'), NULL, 'intima', 4200000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0030'), NULL, 'Regalo para accesorios', -300000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-23', 'anticipo', 720000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0030';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-23', '7200 23-jun', 720000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0030';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-21', '10200 21-jul', 1020000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0030';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-24', '7200 24-ago', 720000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0030';

-- 6 mayo 26 fila 6 · maria fernanda rosalino · p57 mantilla 49
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'maria', 'fernanda rosalino', 'pagos.xlsx', '6 mayo 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0031', last_insert_rowid(), u.id, 'paid',
         '2026-05-30', 'Histórico (importado)', 1900000, 150000, 1750000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0031'), NULL, 'p57 mantilla 49', 1900000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0031'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-30', 'anticipo', 1200000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0031';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-11', '5600 11-jul', 560000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0031';

-- 6 mayo 26 fila 7 · karina guerra gzz · j1191
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'karina', 'guerra gzz', 'pagos.xlsx', '6 mayo 26 fila 7');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0032', last_insert_rowid(), u.id, 'active',
         '2026-05-30', 'Histórico (importado)', 3150000, 250000, 2900000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 7'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0032'), NULL, 'j1191', 3150000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0032'), NULL, 'Regalo para accesorios', -250000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-30', 'anticipo', 580000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0032';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-07', '5800 7-jul', 580000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0032';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-31', '11600 31-jul', 1160000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0032';

-- 6 mayo 26 fila 8 · valeria yazmin medina · p56
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'valeria', 'yazmin medina', 'pagos.xlsx', '6 mayo 26 fila 8');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0033', last_insert_rowid(), u.id, 'active',
         '2026-05-30', 'Histórico (importado)', 2150000, 150000, 2000000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 8'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0033'), NULL, 'p56', 2150000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0033'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-30', 'anticipo', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0033';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-30', '4000 30-jun', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0033';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-31', '4000 31-jul', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0033';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-31', '4000 31-ago', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0033';

-- 6 mayo 26 fila 9 · katia rubi jauregui · p139 mantilla 039
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'katia', 'rubi jauregui', 'pagos.xlsx', '6 mayo 26 fila 9');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0034', last_insert_rowid(), u.id, 'active',
         '2026-05-30', 'Histórico (importado)', 2000000, 150000, 1850000, 1,
         'pagos.xlsx · 6 mayo 26 · fila 9'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0034'), 1, 'p139 mantilla 039', 2000000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0034'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-30', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0034';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-30', '2215 30-jun', 221500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0034';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-30', '2215 30-jul', 221500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0034';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-31', '2215 31-ago', 221500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0034';

-- abril 26 fila 2 · stephani rodriguez · j1170 muetra tIrantes
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'stephani', 'rodriguez', 'pagos.xlsx', 'abril 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0035', last_insert_rowid(), u.id, 'paid',
         '2026-04-06', 'Histórico (importado)', 2580000, 0, 2580000, 1,
         'pagos.xlsx · abril 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0035'), NULL, 'j1170 muetra tIrantes', 2580000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-06', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0035';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-12', '10000 12-jun', 1000000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0035';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-23', '10900 23-jul', 1090000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0035';

-- abril 26 fila 3 · leslie sofia rodriguez · melissa, mantilla 039,mantilla 48, tiara 63
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'leslie', 'sofia rodriguez', 'pagos.xlsx', 'abril 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0036', last_insert_rowid(), u.id, 'active',
         '2026-04-16', 'Histórico (importado)', 2550000, 0, 2550000, 1,
         'pagos.xlsx · abril 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0036'), NULL, 'melissa', 2550000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0036'), 13, 'mantilla 039', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0036'), NULL, 'mantilla 48', 0, 'accessory', 2);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0036'), NULL, 'tiara 63', 0, 'accessory', 3);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-16', 'anticipo', 510000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0036';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-21', '10000 21-jun', 1000000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0036';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-25', '5100 25-jul', 510000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0036';

-- abril 26 fila 4 · gloria cecelia gamboa · p59
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'gloria', 'cecelia gamboa', 'pagos.xlsx', 'abril 26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0037', last_insert_rowid(), u.id, 'paid',
         '2026-04-18', 'Histórico (importado)', 2140000, 0, 2140000, 1,
         'pagos.xlsx · abril 26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0037'), NULL, 'p59', 2140000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-18', 'anticipo', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0037';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-18', '4000 18-may', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0037';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-19', '4000 19-jun', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0037';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-23', '4000 23-jul', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0037';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-18', '5400 18-ago', 540000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0037';

-- abril 26 fila 5 · alondra yahaira salazar · p139, crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'alondra', 'yahaira salazar', 'pagos.xlsx', 'abril 26 fila 5');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0038', last_insert_rowid(), u.id, 'paid',
         '2026-04-25', 'Histórico (importado)', 1500000, 0, 1500000, 1,
         'pagos.xlsx · abril 26 · fila 5'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0038'), 1, 'p139', 1500000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0038'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-25', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0038';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-28', '5000 28 abril', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0038';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-27', '5000 27-jun', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0038';

-- abril 26 fila 6 · zuralba aguilar · p139, crinolina 6 aros
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'zuralba', 'aguilar', 'pagos.xlsx', 'abril 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0039', last_insert_rowid(), u.id, 'paid',
         '2026-04-25', 'Histórico (importado)', 1675000, 150000, 1525000, 1,
         'pagos.xlsx · abril 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0039'), 1, 'p139', 1675000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0039'), NULL, 'crinolina 6 aros', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0039'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-04-25', 'anticipo', 600000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0039';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-05-23', '9000 23-may', 900000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0039';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-20', '350 20-jun', 35000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0039';

-- junio 26 fila 3 · lourdes yesenia · mikado moño velo largo de perlas velo corto de perlas
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'lourdes', 'yesenia', 'pagos.xlsx', 'junio 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0040', last_insert_rowid(), u.id, 'active',
         '2026-06-06', 'Histórico (importado)', 3160000, 250000, 2910000, 1,
         'pagos.xlsx · junio 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0040'), NULL, 'mikado moño velo largo de perlas velo corto de perlas', 3160000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0040'), NULL, 'Regalo para accesorios', -250000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', 'anticipo', 564000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0040';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-06', '3400 6-jul', 340000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0040';

-- junio 26 fila 4 · mixi barron lopez · p139 velo largo liso
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'mixi', 'barron lopez', 'pagos.xlsx', 'junio 26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0041', last_insert_rowid(), u.id, 'active',
         '2026-06-06', 'Histórico (importado)', 1860000, 150000, 1710000, 1,
         'pagos.xlsx · junio 26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0041'), 1, 'p139 velo largo liso', 1860000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0041'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-06', 'anticipo', 360000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0041';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-13', '5000 13 -jun', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0041';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-07', '3375 7-jul', 337500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0041';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-11', '2500 11-ago', 250000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0041';

-- junio 26 fila 6 · adriana lopez · p139
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'adriana', 'lopez', 'pagos.xlsx', 'junio 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0042', last_insert_rowid(), u.id, 'active',
         '2026-06-13', 'Histórico (importado)', 1650000, 150000, 1500000, 1,
         'pagos.xlsx · junio 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0042'), 1, 'p139', 1650000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0042'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-13', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0042';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-13', '3000 13-jul', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0042';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-14', '3000 14-ago', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0042';

-- junio 26 fila 7 · karla peña · s14 m ,tirantes, crinolina 1 aro
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'karla', 'peña', 'pagos.xlsx', 'junio 26 fila 7');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0043', last_insert_rowid(), u.id, 'active',
         '2026-06-20', 'Histórico (importado)', 815000, 0, 815000, 1,
         'pagos.xlsx · junio 26 · fila 7'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0043'), 4, 's14 m', 815000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0043'), NULL, 'tirantes', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0043'), NULL, 'crinolina 1 aro', 0, 'accessory', 2);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-06-20', 'anticipo', 178000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0043';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-20', '1600 20-jul', 160000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0043';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-20', '1830 20-ago', 183000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0043';

-- jul26 fila 2 · martha guadalupe · crinolina 3 aros tiara 66, melissa
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'martha', 'guadalupe', 'pagos.xlsx', 'jul26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0044', last_insert_rowid(), u.id, 'paid',
         '2026-07-18', 'Histórico (importado)', 1830000, 0, 1830000, 1,
         'pagos.xlsx · jul26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0044'), NULL, 'crinolina 3 aros tiara 66', 1830000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0044'), NULL, 'melissa', 0, 'accessory', 1);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-18', 'anticipo', 780000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0044';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-18', '5500 18-ago', 550000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0044';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-09-04', '5100 4-sept', 510000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0044';

-- jul26 fila 4 · maria isabel · mantilla 45, j1194
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'maria', 'isabel', 'pagos.xlsx', 'jul26 fila 4');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0045', last_insert_rowid(), u.id, 'active',
         '2026-07-24', 'Histórico (importado)', 3650000, 300000, 3350000, 1,
         'pagos.xlsx · jul26 · fila 4'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0045'), NULL, 'mantilla 45', 3650000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0045'), NULL, 'j1194', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0045'), NULL, 'Regalo para accesorios', -300000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-24', 'anticipo', 350000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0045';

-- jul26 fila 5 · daniela mata · crinolina 6 a, cherry
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'daniela', 'mata', 'pagos.xlsx', 'jul26 fila 5');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0046', last_insert_rowid(), u.id, 'active',
         '2026-07-28', 'Histórico (importado)', 2150000, 150000, 2000000, 1,
         'pagos.xlsx · jul26 · fila 5'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0046'), NULL, 'crinolina 6 a', 2150000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0046'), NULL, 'cherry', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0046'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-28', 'anticipo', 400000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0046';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-09-04', '3200 4-sep', 320000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0046';

-- jul26 fila 6 · damaris uribe · crinolina 3 a, ella
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'damaris', 'uribe', 'pagos.xlsx', 'jul26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0047', last_insert_rowid(), u.id, 'active',
         '2026-07-29', 'Histórico (importado)', 1700000, 100000, 1600000, 1,
         'pagos.xlsx · jul26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0047'), NULL, 'crinolina 3 a', 1700000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0047'), NULL, 'ella', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0047'), NULL, 'Regalo para accesorios', -100000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-07-29', 'anticipo', 640000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0047';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-29', '1920 29-ago', 192000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0047';

-- ago 26 fila 2 · alejandra sanchez · titiara63
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'alejandra', 'sanchez', 'pagos.xlsx', 'ago 26 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0048', last_insert_rowid(), u.id, 'paid',
         '2026-08-01', 'Histórico (importado)', 240000, 0, 240000, 1,
         'pagos.xlsx · ago 26 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0048'), NULL, 'titiara63', 240000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-01', 'anticipo', 240000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0048';

-- ago 26 fila 3 · himelda rivera · mantilla o39, madelyn
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'himelda', 'rivera', 'pagos.xlsx', 'ago 26 fila 3');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0049', last_insert_rowid(), u.id, 'active',
         '2026-08-01', 'Histórico (importado)', 2800000, 150000, 2650000, 1,
         'pagos.xlsx · ago 26 · fila 3'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0049'), NULL, 'mantilla o39', 2800000, 'dress', 0);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0049'), 10, 'madelyn', 0, 'accessory', 1);
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0049'), NULL, 'Regalo para accesorios', -150000, 'gift_credit', 99);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-01', 'anticipo', 900000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0049';
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-29', '4375 29-ago', 437500, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0049';

-- ago 26 fila 6 · johanna jaquelin · amaranta
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'johanna', 'jaquelin', 'pagos.xlsx', 'ago 26 fila 6');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0050', last_insert_rowid(), u.id, 'active',
         '2026-08-29', 'Histórico (importado)', 3000000, 0, 3000000, 1,
         'pagos.xlsx · ago 26 · fila 6'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0050'), NULL, 'amaranta', 3000000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-08-29', 'anticipo', 500000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0050';

-- Hoja7 fila 2 · maria fernanda · cherry mantilla 039
INSERT INTO customers (store_id, name, apellido, source, notes)
  VALUES ('mty', 'maria', 'fernanda', 'pagos.xlsx', 'Hoja7 fila 2');
INSERT INTO contracts (store_id, folio, customer_id, seller_id, status, signed_at, plan_name,
                       list_total_cents, gift_credit_cents, total_cents, imported, import_source)
  SELECT 'mty', 'MTY-IMP-0051', last_insert_rowid(), u.id, 'active',
         '2026-09-02', 'Histórico (importado)', 2350000, 0, 2350000, 1,
         'pagos.xlsx · Hoja7 · fila 2'
    FROM users u WHERE u.store_id = 'mty' AND u.role = 'owner' ORDER BY u.id LIMIT 1;
INSERT INTO contract_items (contract_id, item_id, description, price_cents, line_kind, sort)
  VALUES ((SELECT id FROM contracts WHERE folio = 'MTY-IMP-0051'), NULL, 'cherry mantilla 039', 2350000, 'dress', 0);
INSERT INTO payments (contract_id, store_id, paid_at, paid_at_raw, amount_cents, method, collected_by, imported)
  SELECT c.id, 'mty', '2026-09-02', 'anticipo', 300000, 'cash', c.seller_id, 1
    FROM contracts c WHERE c.folio = 'MTY-IMP-0051';
