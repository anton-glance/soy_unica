-- Semilla de arranque.
--
-- Los NIP quedan en PBKDF2-SHA256 con 100 000 iteraciones y sal por usuario,
-- igual que los que se cambien después desde Ajustes. `npm run db:reset` los
-- imprime al terminar, con la nota de cambiarlos antes de usar el sistema.

INSERT INTO stores (
  id, name, address, phone, timezone, min_days_before_wedding, contract_template
) VALUES
  ('mty', 'Soy Única Novias · Monterrey',
   'Porfirio Diaz 107, Centro,66400 San Nicolas de los Garza, N.L.',
   '', 'America/Monterrey', 15,
   -- El contrato real de la tienda (docs/contrato_de_novia_nov_2024.docx),
   -- palabra por palabra, con cada blanco que el sistema sí conoce vuelto
   -- marcador. Los blancos que quedan con rayas (el plazo de entrega y los
   -- días para tomar medidas) se llenan a mano: el sistema no guarda esos
   -- datos y no se van a inventar. La dueña lo edita en Ajustes.
   'Contrato de compra de vestido de novia

1. Objeto de contrato.

El cliente “Novia” {{bride_name}} {{apellido}} Pago anticipo de vestido de novia de cantidad {{anticipo}} precio {{total}} modelo {{dress}} {{code}} color {{color}} material 100 % poliester Accesorios {{accessories}}

Fecha de evento {{wedding_date}} Numero de Tel. {{phone}}

Sistemas de pago

a)50% (apartado) y 50% (cuando vestido esta listo). B) 40% ( apartado)-30% - 30% (cada mes) C)20% 5 meses.   el vestido se realiza con 40% precio de vestido

2. Pagos.

El Cliente es responsable de realizar los pagos al tiempo acuerdo del grafico de pagos:

Día de pago cada mes de cantidad, plan {{plan_name}}:

{{schedule_table}}

En caso de que El Cliente NO realiza el pago pago a tiempo y no tiene otro acuerdo con “Soy única”: se quita el descuento o promoción o se aplica 5% más de precio del vestido por el mes

3. Tiempo de entrega

“Soy única” es responsable de entregar el vestido de novia al Cliente en un plazo desde ______ a ______ días.

Tiempo se cuenta desde la fecha de toma de medidas.

La entrega se realiza cuando el Cliente   liquidó el vestido total 100%.

El Cliente debe de recoger su vestido durante 10 días después del aviso que el vestido está listo para su entrega. En caso de que el cliente no recogió su vestido durante 10 días desde 11vo día se aplica cobro “Hotel de vestido” 30 mxn por día con fecha  límite hasta día del  evento de la novia , después de esta fecha soy única no es responsable de resguardar el vestido  (si no tiene otro acuerdo con “ soy única “.

En caso de que la novia quiere pagar hotel de vestido este se paga por adelantado .

Después de entrega de vestido a La novia “Soy Única” no responsable de vestido.  El vestido se entrega vaporizado si la novia requiere 2da vaporización se cobra extra.

4. Devoluciones.

“Soy única” no acepta devoluciones de anticipos de cualquier artículo.

5. Cambios.

“Soy única” no acepta cambios de los accesorios separados.

El Cliente puede realizar cambio del modelo antes de tomar medidas en un precio mayor de vestido punto 1

En caso de que el cliente separo vestido de existencia no se aplica cambio.

En caso de que el Cliente cambio de fecha de evento más de 6 meses y el vestido no está realizado se actualizará el precio del dia de medidas (se aplica promociones del día de separación del vestido).

6. Medidas. “Soy única” toma de medidas del Cliente para realizar pedido de vestido antes de ______ dias. “Soy Unica”:

no es responsable: en caso de que el Cliente no llego para tomar medidas, no se hace responsable de cambios de medidas de novia desde la fecha que se tomaron las medidas.

7. Ajustes “Soy única” se hace responsable del primer ajuste para que el vestido ajuste perfecto a las medidas tomados y el diseño de vestido. En caso de que novia cambio de medidas (ajuste se puede realizar con costo extra).  La altura de piso al vestido esta considerada de 1,5 ,2 cm acuerdo del estandarte. Ajustes se realizan durante 40 días. Ajustes no incluye en de liquidación.

8. Pruebas. “Soy Única” es responsable de avisar al Cliente de que su vestido está listo y durante 10 dias la novia viene a prueba de vestido. (cita de prueba dura 30- 40 mns).

9. Pagos Extra.

Ajustes extra (en caso de que la novia quiera modificar el vestido o ajustes que no incluye).Ajustes bastilla de $500-$2000,mangas$300-$500,hombros$500-$1000,2do planchado Vestido sin cola $400,cola 1metro $600,cola mas de 1 metro $800,Mantilla corta $200,larga$400,5mts $600, coser cinto $250

Apartir de la talla 16 (medidas 104-86-112) se cobra extra $1400, Marca lanesta  envio extra $3000,Marca kira nova, armonía, annie victor envio extra $1500 mxn. Marca lanesta, armonía, kiranova, annie victor a partir de talla 44-46 (100-80-108 se cobra 8% del precio del vestido. crinolina$500-1200mxn. Porta traje 100mxn

Yo {{bride_name}} {{apellido}} con mi firma _________ acepto condiciones del contrato. Fecha {{date}}'),

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
-- Los cuatro de la tienda. Los tres primeros están escritos en el punto 1 del
-- contrato real (docs/contrato_de_novia_nov_2024.docx):
--   a) 50% (apartado) y 50% (cuando vestido esta listo)
--   b) 40% (apartado) - 30% - 30% (cada mes)
--   c) 20% 5 meses
-- El de contado es el cuarto, con su descuento configurable en Ajustes.
--
-- `max_months = 0` significa que lo que resta se liquida al recoger el
-- vestido, sin fecha: son los únicos planes que se pueden ofrecer cuando la
-- novia todavía no tiene fecha de evento. Ningún plan lleva precio mínimo: la
-- dueña lo pone en Ajustes si algún día lo quiere.
INSERT INTO plans (store_id, name, splits, min_price_cents, max_price_cents, max_months, discount_pct, sort) VALUES
  ('mty',  'Contado',        '[100]',                0, NULL, 0, 10, 1),
  ('mty',  'Mitad y mitad',  '[50,50]',              0, NULL, 0,  0, 2),
  ('mty',  '40/30/30',       '[40,30,30]',           0, NULL, 2,  0, 3),
  ('mty',  '20 × 5',         '[20,20,20,20,20]',     0, NULL, 4,  0, 4),
  ('cdmx', 'Contado',        '[100]',                0, NULL, 0, 10, 1),
  ('cdmx', 'Mitad y mitad',  '[50,50]',              0, NULL, 0,  0, 2),
  ('cdmx', '40/30/30',       '[40,30,30]',           0, NULL, 2,  0, 3),
  ('cdmx', '20 × 5',         '[20,20,20,20,20]',     0, NULL, 4,  0, 4);

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
  ('mty', 'Renta', 1), ('mty', 'Nómina', 2), ('mty', 'Publicidad', 3), ('mty', 'Servicios', 4),
  ('mty', 'Insumos', 5), ('mty', 'Costurera', 6), ('mty', 'Otro', 7);

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
