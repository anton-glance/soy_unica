-- Semilla de arranque.
--
-- Los NIP quedan en PBKDF2-SHA256 con 100 000 iteraciones y sal por usuario,
-- igual que los que se cambien después desde Ajustes. `npm run db:reset` los
-- imprime al terminar, con la nota de cambiarlos antes de usar el sistema.

INSERT INTO stores (
  id, name, address, phone, timezone, min_days_before_wedding, contract_template
) VALUES
  ('mty', 'Soy Única Novias · Monterrey',
   'Porfirio Díaz 107, Centro, 66400 San Nicolás de los Garza, N.L.',
   '', 'America/Monterrey', 15,
   -- ⚠ PLANTILLA PROVISIONAL. El texto definitivo es el del contrato real de
   -- la tienda (docs/contrato_de_novia_nov_2024.docx), palabra por palabra.
   -- Se reemplaza desde Ajustes → Plantilla del contrato, sin tocar código.
   'CONTRATO DE COMPRAVENTA DE VESTIDO DE NOVIA

{{store}}
{{address}}
Folio: {{folio}}                         Fecha: {{date}}

DATOS DE LA CLIENTA
Nombre: {{bride_name}} {{apellido}}
Teléfono: {{phone}}
Fecha del evento: {{wedding_date}}

VESTIDO
Modelo: {{dress}}          Código: {{code}}          Color: {{color}}

ACCESORIOS
{{accessories}}

CONDICIONES DE PAGO
Plan contratado: {{plan_name}}
Total: {{total}}
Anticipo: {{anticipo}}

CALENDARIO DE PAGOS
{{schedule_table}}

La clienta manifiesta haber revisado el vestido y estar de acuerdo con las
medidas asentadas en la hoja de medidas firmada por ambas partes, que forma
parte de este contrato.

Los anticipos no son reembolsables. El vestido se entrega una vez liquidado el
total. Pasados los días de gracia desde el aviso de que el vestido está listo,
se cobrará hotel de vestido por día. En caso de atraso en los pagos se pierde
el descuento promocional o se cobra el recargo mensual pactado, a criterio de
la tienda.


_______________________              _______________________
   {{bride_name}} {{apellido}}              Por {{store}}
        La clienta                            La tienda'),

  ('cdmx', 'Soy Única Novias · CDMX', '', '', 'America/Mexico_City', 15, '');

-- La CDMX arranca con la misma plantilla que Monterrey.
UPDATE stores SET contract_template = (SELECT contract_template FROM stores WHERE id = 'mty')
WHERE id = 'cdmx';

-- ────────────────────────────────────────────────────────────── usuarias ──
-- Dueña 4242 en ambas sucursales; vendedoras 1111 (MTY) y 2222 (CDMX).
INSERT INTO users (store_id, name, role, pin_hash, pin_salt) VALUES
  ('mty',  'Dueña',     'owner',  'SkFVTeXOgVOy9pQJT1IvGaNIXkUXEL0xU7ovJZ73BFQ', 'wR0Q2kSodfuvHHN1pBmysg'),
  ('mty',  'Vendedora', 'seller', 'OwdzqDJgOZHgQd4KBcyUf3GbJP4-OZhTMEiUD-a3CJ0', 'JN8h-Hy1WN69sEvQLVvz2A'),
  ('cdmx', 'Dueña',     'owner',  'JtFw4VOoPYIkyLw48ujCJU09C3Yipx8c0XVUU9jhvec', 'V0Le6KrSK4fpIPw2QSkxvA'),
  ('cdmx', 'Vendedora', 'seller', 'hVXsO40w9eth6UZJ4RIqpFxRYianMmaAuUOpAP8RqsM', 'j_TWwCgS-EJs-Uxi4_3SzQ');

-- ──────────────────────────────────────────────────── planes de pago ──────
-- Conjunto fijo. `max_months = 0` significa que lo que resta se liquida al
-- recoger el vestido, sin fecha: son los únicos planes que se pueden ofrecer
-- cuando la novia todavía no tiene fecha de evento.
INSERT INTO plans (store_id, name, splits, min_price_cents, max_price_cents, max_months, discount_pct, sort) VALUES
  ('mty',  'Pago de contado',        '[100]',                     0,       NULL, 0, 10, 1),
  ('mty',  'Mitad y mitad',          '[50,50]',                   0,       NULL, 0,  0, 2),
  ('mty',  'Tres meses',             '[50,25,25]',           800000,       NULL, 2,  0, 3),
  ('mty',  'Seis meses',             '[40,12,12,12,12,12]', 1500000,       NULL, 5,  0, 4),
  ('cdmx', 'Pago de contado',        '[100]',                     0,       NULL, 0, 10, 1),
  ('cdmx', 'Mitad y mitad',          '[50,50]',                   0,       NULL, 0,  0, 2),
  ('cdmx', 'Tres meses',             '[50,25,25]',           800000,       NULL, 2,  0, 3),
  ('cdmx', 'Seis meses',             '[40,12,12,12,12,12]', 1500000,       NULL, 5,  0, 4);

-- ───────────────────────────────────────────────────────────── cargos ─────
-- Tomados del contrato real. Donde el contrato marca un rango se siembra el
-- piso y el rango queda en el nombre, que es como lo cotiza la vendedora.
INSERT INTO surcharges (store_id, name, kind, applies_to, amount_cents, pct, sort) VALUES
  ('mty', 'Envío Lanesta',                          'envio', 'Lanesta',                            300000, 0,  1),
  ('mty', 'Envío Kira Nova / Armonía / Annie Victor','envio', 'Kira Nova, Armonía, Annie Victor',   150000, 0,  2),
  ('mty', 'Talla 16 en adelante',                   'talla', '>=16',                               140000, 0,  3),
  ('mty', 'Talla 44–46 en adelante',                'talla', '>=44',                                    0, 8,  4),
  ('mty', 'Bastilla (500–2000)',                    'ajuste', NULL,                                 50000, 0,  5),
  ('mty', 'Mangas (300–500)',                       'ajuste', NULL,                                 30000, 0,  6),
  ('mty', 'Hombros (500–1000)',                     'ajuste', NULL,                                 50000, 0,  7),
  ('mty', 'Segundo planchado sencillo',             'ajuste', NULL,                                 40000, 0,  8),
  ('mty', 'Segundo planchado mediano',              'ajuste', NULL,                                 60000, 0,  9),
  ('mty', 'Segundo planchado grande',               'ajuste', NULL,                                 80000, 0, 10),
  ('mty', 'Mantilla corta',                         'otro',  NULL,                                  20000, 0, 11),
  ('mty', 'Mantilla larga',                         'otro',  NULL,                                  40000, 0, 12),
  ('mty', 'Mantilla 5 metros',                      'otro',  NULL,                                  60000, 0, 13),
  ('mty', 'Coser cinto',                            'ajuste', NULL,                                 25000, 0, 14),
  ('mty', 'Crinolina (500–1200)',                   'otro',  NULL,                                  50000, 0, 15),
  ('mty', 'Porta traje',                            'otro',  NULL,                                  10000, 0, 16);

INSERT INTO surcharges (store_id, name, kind, applies_to, amount_cents, pct, sort)
SELECT 'cdmx', name, kind, applies_to, amount_cents, pct, sort FROM surcharges WHERE store_id = 'mty';

-- ────────────────────────────────────────────── categorías de gasto ───────
INSERT INTO expense_categories (store_id, name, sort) VALUES
  ('mty', 'Renta', 1), ('mty', 'Luz', 2), ('mty', 'Agua', 3), ('mty', 'Internet y teléfono', 4),
  ('mty', 'Costura y ajustes', 5), ('mty', 'Tintorería', 6), ('mty', 'Limpieza', 7),
  ('mty', 'Papelería', 8), ('mty', 'Publicidad', 9), ('mty', 'Sueldos', 10),
  ('mty', 'Mercancía', 11), ('mty', 'Envíos', 12), ('mty', 'Mantenimiento', 13), ('mty', 'Otro', 99);

INSERT INTO expense_categories (store_id, name, sort)
SELECT 'cdmx', name, sort FROM expense_categories WHERE store_id = 'mty';

-- ─────────────────────────────────────────── reglas de comisión ───────────
INSERT INTO commission_rules (store_id, priority, min_price_cents, max_price_cents, sold_at_or_above_list, rate_pct, basis, period) VALUES
  ('mty', 1,       0,  999999, NULL, 3, 'cash',       'weekly'),
  ('mty', 2, 1000000, 1999999,    1, 4, 'sale_value', 'weekly'),
  ('mty', 3, 2000000,    NULL,    1, 5, 'sale_value', 'weekly');

INSERT INTO commission_rules (store_id, priority, min_price_cents, max_price_cents, sold_at_or_above_list, rate_pct, basis, period)
SELECT 'cdmx', priority, min_price_cents, max_price_cents, sold_at_or_above_list, rate_pct, basis, period
FROM commission_rules WHERE store_id = 'mty';

-- ──────────────────────────────────────────────────────── inventario ──────
-- ⚠ EXISTENCIAS PROVISIONALES. Doce vestidos y cuatro accesorios de Monterrey
-- con su nomenclatura real (p139, s14, A12, madelyn, mantilla 039), listos
-- para reemplazarse por las existencias del prototipo (docs/prototype.html).
-- Las de `acquisition = 'pedido'` son modelos que se mandan a hacer: nunca se
-- apartan, para que dos novias puedan encargar el mismo.
INSERT INTO items (store_id, code, kind, acquisition, condition, name, brand, size, cut, color, cost_cents, price_cents, location, intake_date) VALUES
  ('mty', 'p139',        'dress',     'unidad', 'nuevo',       'Madelyn',    'Lanesta',       '10', 'Sirena',    'Ivory',      850000, 1850000, 'Pasillo A', '2025-02-14'),
  ('mty', 'p142',        'dress',     'unidad', 'nuevo',       'Aurora',     'Kira Nova',     '12', 'Princesa',  'Blanco',     780000, 1650000, 'Pasillo A', '2025-02-14'),
  ('mty', 'p151',        'dress',     'unidad', 'exhibicion',  'Valentina',  'Armonía',       '08', 'Recto',     'Ivory',      620000, 1290000, 'Pasillo A', '2025-03-02'),
  ('mty', 's14',         'dress',     'unidad', 'muestra',     'Renata',     'Annie Victor',  '14', 'Sirena',    'Champagne',  540000, 1120000, 'Pasillo B', '2025-03-02'),
  ('mty', 's21',         'dress',     'unidad', 'nuevo',       'Ximena',     'Lanesta',       '16', 'Princesa',  'Ivory',      910000, 1980000, 'Pasillo B', '2025-04-11'),
  ('mty', 's33',         'dress',     'unidad', 'liquidacion', 'Camila',     'Kira Nova',     '06', 'Recto',     'Blanco',     430000,  790000, 'Pasillo B', '2024-11-20'),
  ('mty', 'A12',         'dress',     'unidad', 'nuevo',       'Regina',     'Armonía',       '10', 'Corte A',   'Ivory',      700000, 1490000, 'Pasillo C', '2025-05-06'),
  ('mty', 'A18',         'dress',     'unidad', 'exhibicion',  'Fernanda',   'Annie Victor',  '12', 'Corte A',   'Blanco',     660000, 1380000, 'Pasillo C', '2025-05-06'),
  ('mty', 'A24',         'dress',     'unidad', 'nuevo',       'Sofía',      'Lanesta',       '08', 'Sirena',    'Champagne',  880000, 1890000, 'Pasillo C', '2025-06-18'),
  ('mty', 'madelyn',     'dress',     'pedido', 'nuevo',       'Madelyn',    'Lanesta',       'A medida', 'Sirena',   'A elegir',      0, 2100000, 'Catálogo',  '2025-01-09'),
  ('mty', 'aurora',      'dress',     'pedido', 'nuevo',       'Aurora',     'Kira Nova',     'A medida', 'Princesa', 'A elegir',      0, 1950000, 'Catálogo',  '2025-01-09'),
  ('mty', 'isabella',    'dress',     'pedido', 'nuevo',       'Isabella',   'Armonía',       'A medida', 'Corte A',  'A elegir',      0, 1750000, 'Catálogo',  '2025-01-09'),
  ('mty', 'mantilla 039','accessory', 'unidad', 'nuevo',       'Mantilla larga bordada', NULL, 'Única', NULL, 'Ivory',        38000,   90000, 'Vitrina',   '2025-02-14'),
  ('mty', 'mantilla 041','accessory', 'unidad', 'nuevo',       'Mantilla corta',         NULL, 'Única', NULL, 'Blanco',       18000,   45000, 'Vitrina',   '2025-02-14'),
  ('mty', 'velo 07',     'accessory', 'unidad', 'nuevo',       'Velo dos capas',         NULL, 'Única', NULL, 'Ivory',        22000,   58000, 'Vitrina',   '2025-03-02'),
  ('mty', 'crinolina 12','accessory', 'unidad', 'nuevo',       'Crinolina tres aros',    NULL, 'Única', NULL, 'Blanco',       30000,   72000, 'Bodega',    '2025-03-02');
