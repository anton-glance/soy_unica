# Importación del catálogo — soyunicanovias.com

Origen: `https://soyunicanovias.com/wp-json/wc/store/v1/products`. Sucursal destino: `mty`.
**Nada de esto se ha escrito en ninguna base.**

> ## ⚠ Estas cifras NO son del sitio real
>
> El entorno donde se generó este reporte no tiene salida a `soyunicanovias.com`:
> su política de red sólo deja salir a los registros de paquetes. Los números de
> abajo salen de `tests/fixtures/woo-products.json`, seis productos de mentira
> hechos a la forma exacta de la Store API para ejercitar el mapeo, incluidos sus
> casos difíciles: sin SKU, precio con otra unidad menor, HTML en el nombre,
> código repetido y producto sin precio.
>
> El importador está completo y probado —`tests/catalog-map.test.ts`, nueve
> pruebas—; lo único que falta es correrlo donde haya red:
>
> ```
> node scripts/import/catalog.mjs --fetch     # baja el catálogo
> node scripts/import/catalog.mjs --images    # baja y recodifica las imágenes
> ```
>
> Eso regenera este archivo con las cifras de verdad: cuántos productos hay,
> cuántos se rechazan, cuántos códigos chocan, cuántos megas agregan las
> imágenes y cómo queda la proyección de almacenamiento. **Hasta entonces, la
> mitad de este reporte que pediste —bytes agregados y proyección— no existe.**

## Resumen

| | productos |
|---|---|
| encontrados en el sitio | 6 |
| importables | **3** |
| rechazados | 2 |
| códigos repetidos | 1 |

De los importables, 2 vestidos y 1 accesorios.
Todos entran como **por pedido**: las banderas de existencias del sitio no son de fiar y
decir que hay una unidad física que quizá no exista es peor que lo contrario. Talla, costo
y condición quedan vacíos —el sitio no los trae— y se llenan en Inventario.

## Rechazados

| id | nombre | por qué |
|---|---|---|
| 104 | Producto sin precio | precio ilegible: "" |
| 106 | — | sin SKU ni slug: no hay código; sin nombre |

## Códigos repetidos

El código es único por sucursal, así que sólo entra el primero.

| código | se queda | se descarta |
|---|---|---|
| `p139` | Vestido Madelyn (101) | Madelyn repetida (105) |

## Imágenes

_No se corrió con `--images`, así que no se bajó ninguna._
El sitio ofrece 3 imágenes para estos productos (máximo cinco por artículo).
