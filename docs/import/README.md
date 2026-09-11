# Importaciones

Dos importadores, en `scripts/import/`. **Ninguno escribe en ninguna base.**
Cada uno produce un reporte en Markdown y un archivo `.sql`; aplicarlo es un
comando aparte que corres tú. Ésa es toda la protección: la única forma de que
esto toque una base es que una persona lo aplique a propósito, y el reporte
existe para que esa persona sepa qué está aplicando.

Todo lo que generan cae en esta misma carpeta, `docs/import/`.

---

## 1 · Catálogo del sitio

### Bajarlo

```
node scripts/import/catalog.mjs --fetch --images
```

Necesita salida a internet (`soyunicanovias.com`). Tarda: son cientos de
imágenes, una petición por cada una.

**Las banderas**

| bandera | qué hace |
| --- | --- |
| `--fetch` | pagina `/wp-json/wc/store/v1/products?per_page=100&page=N` hasta que se acaba, y guarda el JSON crudo |
| `--images` | además baja cada imagen y la vuelve a codificar: 1600 px, WebP, ≤300 KB, los mismos límites que la tableta |
| *(sin banderas)* | vuelve a leer el JSON ya bajado y regenera el reporte y el `.sql`, sin volver a pedir nada |

**Qué escribe**

| archivo | qué es |
| --- | --- |
| `docs/import/catalog-raw.json` | la respuesta cruda del sitio, tal cual. No se versiona |
| `docs/import/catalog.md` | **el reporte que hay que leer** |
| `docs/import/catalog.sql` | los `INSERT`, para aplicar |
| `docs/import/catalog-images/` | las imágenes ya recodificadas, en `.webp`. No se versionan: van a R2 |

### Qué revisar en el reporte antes de aplicar

1. **El aviso de arriba.** Si el reporte sigue diciendo que las cifras salen de
   una fixture, el `--fetch` no corrió: no apliques nada.
2. **Rechazados.** Productos sin código o sin precio legible. Cada uno con su
   motivo. Si son muchos, algo cambió en el sitio y conviene mirarlo antes.
3. **Códigos repetidos.** El código es único por sucursal, así que de cada
   choque sólo entra el primero. Revisa que el que se queda sea el bueno: ése es
   el que la vendedora va a teclear para buscar.
4. **Imágenes que no se pudieron bajar**, con su motivo.
5. **Proyección de almacenamiento.** Cuántos megas agrega y a cuánto deja el
   total. Si eso deja el bucket cerca de su tope, mejor saberlo antes.

### Aplicar

Primero **local**, siempre:

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/catalog.sql
```

Las imágenes van a R2 aparte, una por una:

```
for f in docs/import/catalog-images/*.webp; do
  npx wrangler r2 object put "soy-unica-files/mty/item_photo/$(basename "$f")" \
    --file "$f" --local
done
```

Los artículos entran con `INSERT OR IGNORE`: **un código que ya exista no se
toca**. Se puede volver a aplicar sin duplicar nada.

---

## 2 · Contratos de 2026 del libro de pagos

### Generarlo

Necesita el catálogo actual para amarrar los fragmentos del producto a un
artículo, así que se le pasa en una bandera:

```
ITEMS=$(npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --json --command "SELECT id, code, name, kind FROM items WHERE store_id='mty'" \
  | tail -n +2 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))")

node scripts/import/pagos.mjs --items="$ITEMS"
```

Sin `--items` corre igual, pero ningún fragmento amarra con nada y todo queda
como texto.

**Qué escribe**

| archivo | qué es |
| --- | --- |
| `docs/import/pagos.md` | **el reporte que hay que leer** |
| `docs/import/pagos.sql` | los `INSERT`, para aplicar |
| `docs/import/pagos.json` | lo mismo en crudo, por si hace falta mirarlo con otra herramienta. No se versiona: son miles de renglones generados que taparían los reportes en el diff |

### Qué revisar en el reporte antes de aplicar

1. **Rechazados.** No entran al `.sql`. Cada uno trae el contenido crudo del
   renglón: se corrige en el libro y se vuelve a generar, o se captura a mano.
2. **Duplicados descartados.** De cada pareja se conserva una captura. La tabla
   muestra los dos totales: si en algún renglón el bueno fuera el descartado, se
   ve de inmediato.
3. **Posibles duplicados que no se juntaron solos.** Nombres a una o dos letras
   de distancia, misma fecha. Ahora mismo **se importan las dos veces**. Hay que
   decidirlo a mano.
4. **El resto de $100.** Trece contratos con exactamente cien pesos pagados de
   más. Mientras no se confirme qué es, se quedan así, sin renglón inventado.
5. **Fragmentos que no amarraron.** Se guardan como texto. Si son muchos, es
   señal de que el catálogo todavía no está importado: importa primero el
   catálogo y vuelve a generar esto.

### Aplicar

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/pagos.sql
```

**Ojo:** a diferencia del catálogo, esto **no** es repetible. Cada corrida
inserta clientas y contratos nuevos con folios nuevos. Si hay que rehacerlo,
primero se borra lo importado:

```sql
DELETE FROM contracts WHERE imported = 1;              -- se lleva sus renglones y abonos
DELETE FROM customers WHERE source = 'pagos.xlsx';
```

---

## El orden importa

El catálogo va **primero**. La importación del libro amarra cada fragmento de
producto —`p139`, `mantilla 045`, `crinolina 6 aros`— contra `items.code`, y con
el catálogo provisional de la semilla casi ninguno encuentra su artículo.

```
1. catálogo  --fetch --images   → revisar → aplicar
2. pagos     --items="$ITEMS"   → revisar → aplicar
```

El reporte del libro dice, en «Fragmentos de producto», cuántos amarraron y
cuántos quedaron como texto. Ese par de números es la forma de comprobar que el
orden se respetó.

---

## Producción

Nada de esto se aplica a una base remota hasta que los dos reportes estén
revisados. Cuando lo estén, es el mismo comando sin `--local --persist-to`:

```
npx wrangler d1 execute soy-unica --remote --file docs/import/pagos.sql
```
