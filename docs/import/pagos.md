# Importación del libro de pagos — contratos de 2026

Origen: `docs/pagos.xlsx`, 9 hojas de 2026. Sucursal destino: `mty`.
**Nada de esto se ha escrito en ninguna base.** Este reporte y el `.sql` que lo acompaña
son todo lo que produjo la corrida.

## Resumen

| | renglones |
|---|---|
| encontrados en las hojas | 67 |
| importables | **51** |
| rechazados | 5 |
| duplicados descartados | 11 |

Suman 182 abonos (el anticipo cuenta como uno), $994,800 contratados
y $762,350 cobrados.

## Las hojas, y cómo se leyó cada una

| hoja | encabezado | renglones | importables | rechazados | duplicados |
|---|---|---|---|---|---|
| `ene 26` | fila 1 | 6 | 6 | 0 | 0 |
| `marzo 26` | fila 1 | 8 | 8 | 0 | 0 |
| `feb 26` | fila 1 | 23 | 12 | 0 | 11 |
| `6 mayo 26` | fila 1 | 8 | 8 | 0 | 0 |
| `abril 26` | fila 1 | 5 | 5 | 0 | 0 |
| `junio 26` | fila 1 | 5 | 4 | 1 | 0 |
| `jul26` | **no tiene** | 6 | 4 | 2 | 0 |
| `ago 26` | fila 1 | 5 | 3 | 2 | 0 |
| `Hoja7` | fila 1 | 1 | 1 | 0 | 0 |

Las columnas no están en el mismo lugar en todas las hojas y un encabezado llega a mentir:
en `junio 26` el encabezado pone «producto» en la columna 5 y los datos están en la 4.
Por eso los papeles no se toman del encabezado sino del propio renglón, con reglas que se
pueden verificar a ojo: el anticipo es el primer número suelto, el total es el último, y
en medio todo lo que empiece con dígito es un abono. Un número suelto **en medio** no se
interpreta: se rechaza el renglón, porque ésa es justo la forma de un renglón contaminado
por un copiar y pegar de otra hoja.

## Rechazados

Ninguno de estos entra al `.sql`. Les falta un dato que **no se puede adivinar**, y
adivinarlo sería peor que dejarlos fuera.

**`docs/import/pendientes.html` es la hoja para imprimir**: los cinco renglones con todas
sus celdas tal como están en el libro y los huecos en blanco para completarlos a mano.
Una vez completados se capturan en el sistema como cualquier contrato.

### `junio 26` fila 5 — paola chapa

- no trae ni anticipo ni total

```json
{"0":"2026-06-06","1":"paola chapa","4":"madelyn ,mantilla045,crinolina 6 aros","7":"ctiara66","10":"2500 17-jun","11":"5100 9-jul","12":"4200 11-ago","17":"2500 de regalo"}
```

### `jul26` fila 1 — belem orea

- números sueltos entre el anticipo y el total, en las columnas 12: 5000

```json
{"0":"2026-07-08","1":"belem orea","3":" mantilla 039","5":1200,"6":"3800 31-jul","12":5000,"16":29100,"17":"2500 de regalo"}
```

### `jul26` fila 3 — anna olivares

- números sueltos entre el anticipo y el total, en las columnas 12: 41000

```json
{"0":"2026-07-23","1":"anna olivares","3":"mantilla 039","4":"      amalia m","5":11000,"6":"7000 22-ago","12":41000,"14":"3000 de regalo accesorios","16":15000,"17":"1500 de regalo"}
```

### `ago 26` fila 4 — abigail mancilla

- el abono «120000 4-sept» es mayor que el total (20000)

```json
{"0":"2026-08-17","1":"abigail mancilla","5":"cherry","9":8000,"10":"120000 4-sept","16":20000}
```

### `ago 26` fila 5 — doris encinia

- sólo trae un número (2750): no se sabe si es anticipo o total

```json
{"0":"2026-08-29","1":"doris encinia","3":"crinolina 3 aros","5":"p139","9":2750}
```

## Decisiones tomadas a mano

Éstas **no** salieron de ninguna regla automática: las decidió la dueña mirando los
renglones. Viven en la tabla `MANUAL` de `scripts/import/parse-pagos.mjs`, cada una con su
motivo; cambiar de opinión sobre cualquiera es cambiar una línea de esa tabla y volver a
generar.

### `feb 26` filas 4 y 15 — julieta yahaira rdz / juieta yahaira

**misma clienta.** Misma fecha de firma, mismo total al peso ($38,250) y una letra de diferencia en el nombre. La llave exacta no las junta; la dueña confirmó que es una sola persona. Se conserva la captura tardía.

### `feb 26` filas 3 y 14 — laila cristal

**cambio de modelo.** NO es un duplicado. El contrato permite cambiar de modelo antes de las medidas a uno de mayor precio, y eso es exactamente «p40 de liquidación» de $10,000 convertido en «madelyn» de $24,400. La captura tardía es la buena, que es lo que ya se conservaba, pero en el reporte va como cambio de modelo y no como captura descartada.

### `feb 26` filas 11 y 22 — Ma lourdes diaz

**accesorios después de firmar.** Los $1,400 de diferencia entre las dos capturas son accesorios agregados después de firmar: coinciden exactamente con su cargo por talla 16. La captura tardía es la buena.

### `feb 26` filas 7 y 18 — maria del rosario

**accesorios después de firmar.** Los $400 de diferencia son accesorios agregados después de firmar. La captura tardía es la buena.

## Capturas duplicadas descartadas

**Qué las hace duplicados:** misma hoja, **misma fecha de firma** y **mismo nombre**
—comparado sin acentos ni espacios y recortado a diez letras, porque el libro trae
«nereyda concocoan» y «nereyda concepcion» para la misma clienta—. Febrero está capturado
dos veces: un bloque temprano y otro más abajo con más abonos. Se conserva **la última que**
**sirva**: si la tardía se rechaza, gana la anterior, porque perder a la clienta es peor.

Los totales de las dos capturas no siempre coinciden, así que aquí están los dos.

| hoja | fila descartada | clienta | firma | total descartado | fila conservada | total conservado |
|---|---|---|---|---|---|---|
| `feb 26` | 5 | fatima gatica | 2026-02-11 | $21,000 | 16 | $21,000 |
| `feb 26` | 8 | ivette sarahi cabrera | 2026-02-21 | $17,500 | 19 | $17,500 |
| `feb 26` | 9 | rocio giselle roque | 2026-02-21 | $28,700 | 20 | $28,700 |
| `feb 26` | 10 | ana valeria valerio | 2026-02-23 | $16,100 | 21 | $16,100 |
| `feb 26` | 12 | mariana hernandez | 2026-02-28 | $16,000 | 23 | $16,000 |
| `feb 26` | 13 | nereyda concocoan | 2026-02-28 | $25,000 | 24 | $25,000 |
| `feb 26` | 17 | jackeline cepeda | 2026-02-14 | $3,830 | 6 | $16,200 |

## Posibles duplicados que NO se juntaron solos

Misma hoja, misma fecha de firma, nombres a una o dos letras de distancia. **No se**
**fusionan solas**: juntar a dos clientas distintas es peor que dejar dos renglones. Cada
una que aparezca aquí se importa dos veces hasta que alguien la decida y entre a la tabla
`MANUAL`.

Ninguno.

## Fragmentos de producto

**15 de 85** fragmentos amarraron con un artículo del catálogo;
**70** se quedan como texto. Ese par de números es la forma de comprobar que el
catálogo se importó antes que esto.

**El número es bajo porque el catálogo todavía es el provisional de la semilla:**
16 artículos, contra los cientos que tiene el sitio. Esta importación depende
de la del catálogo (C1): en cuanto ésa corra, hay que volver a generar este `.sql` y la
mayoría de estos fragmentos va a encontrar su artículo. Lo que no amarre se queda como
texto en el renglón del contrato, que es legible y no pierde nada.

Los que no amarraron:

| fragmento | veces |
|---|---|
| `crinolina 6 aros` | 6 |
| `melissa` | 5 |
| `p53` | 2 |
| `tirantes` | 2 |
| `mantilla 45` | 2 |
| `ella` | 2 |
| `mantilla 045` | 1 |
| `s10 de exhibicion` | 1 |
| `mantilla045 crinolina 6 aros` | 1 |
| `p146` | 1 |
| `velo 022` | 1 |
| `j1129` | 1 |
| `mantilla 016 3 aros` | 1 |
| `p20 de liquidacion` | 1 |
| `p68 de liquidacion` | 1 |
| `p39 de liquidacion` | 1 |
| `p140` | 1 |
| `mantilla 016` | 1 |
| `p136- crinolina 6 aros` | 1 |
| `p33 de liquidacion mas ajustes` | 1 |
| `p47 de liquidacion` | 1 |
| `merry- yana liquidacion` | 1 |
| `azalia m` | 1 |
| `crinolina 6a` | 1 |
| `liga` | 1 |
| `mantilla 022` | 1 |
| `noeline` | 1 |
| `p107` | 1 |
| `t6cad0 66` | 1 |
| `mantilla 41` | 1 |
| `P39` | 1 |
| `adelina` | 1 |
| `tiara 58` | 1 |
| `cinto 17` | 1 |
| `p46 liquidacion` | 1 |
| `crinolina 3 aros` | 1 |
| `jazmin` | 1 |
| `p24 liquidacion capa` | 1 |
| `intima` | 1 |
| `p57 mantilla 49` | 1 |
| `j1191` | 1 |
| `p56` | 1 |
| `j1170 muetra tIrantes` | 1 |
| `mantilla 48` | 1 |
| `tiara 63` | 1 |
| `p59` | 1 |
| `mikado moño velo largo de perlas velo corto de perlas` | 1 |
| `crinolina 1 aro` | 1 |
| `crinolina 3 aros tiara 66` | 1 |
| `j1194` | 1 |
| `crinolina 6 a` | 1 |
| `cherry` | 1 |
| `crinolina 3 a` | 1 |
| `titiara63` | 1 |
| `mantilla o39` | 1 |
| `amaranta` | 1 |
| `cherry mantilla 039` | 1 |

## El regalo de accesorios

22 contratos traen «regalo N para accesorios» (o alguna de sus variantes:
«N de regalo», «N de ragalo en acceso»).

**Confirmado por la dueña:** la columna «total» de la hoja ya trae la cifra neta. Por eso
volver a restarle el regalo dejaba diecinueve contratos pagados de más por el importe
exacto del regalo. Se importa con `list_total_cents = total + regalo`,
`gift_credit_cents = regalo` y `total_cents = total`, de modo que **lista − regalo = total**
cuadra y lo que se le debe a la tienda es lo que dice la hoja.

## El resto sin explicar: trece contratos con exactamente $100 de más

Trece contratos tienen pagado exactamente cien pesos por encima de su total. La sospecha
—**sin confirmar**— es el «porta traje $100» de la lista de precios, cobrado al recoger el
vestido. **No se le inventó renglón a nadie:** entra como está en la hoja y queda como un
resto sin explicar hasta que la dueña lo confirme. Si lo confirma, se vuelve un renglón de
cargo con su nombre.

| folio | clienta | total | pagado | resto |
|---|---|---|---|---|
| `MTY-IMP-0002` | laura denise sifuentes | $4,000 | $4,100 | $100 |
| `MTY-IMP-0003` | karina elizabeth kiroga | $19,700 | $19,800 | $100 |
| `MTY-IMP-0005` | alejandra jaime | $31,150 | $31,250 | $100 |
| `MTY-IMP-0006` | lizbeth jaqueline villanueva | $17,500 | $17,600 | $100 |
| `MTY-IMP-0008` | sandra lizeth calderon | $1,500 | $1,600 | $100 |
| `MTY-IMP-0010` | andrea dominguez | $10,800 | $10,900 | $100 |
| `MTY-IMP-0012` | nora debany garcia | $12,400 | $12,500 | $100 |
| `MTY-IMP-0015` | guadalupe del angel | $7,800 | $7,900 | $100 |
| `MTY-IMP-0022` | rocio giselle roque | $28,700 | $28,800 | $100 |
| `MTY-IMP-0031` | maria fernanda rosalino | $17,500 | $17,600 | $100 |
| `MTY-IMP-0035` | stephani rodriguez | $25,800 | $25,900 | $100 |
| `MTY-IMP-0039` | zuralba aguilar | $15,250 | $15,350 | $100 |
| `MTY-IMP-0044` | martha guadalupe | $18,300 | $18,400 | $100 |

Otros 6 pagaron de más por cantidades distintas. No encajan en la misma
explicación y hay que mirarlos aparte:

| folio | clienta | total | pagado | resto |
|---|---|---|---|---|
| `MTY-IMP-0004` | hannia yamileth rodriguez | $17,000 | $17,095 | $95 |
| `MTY-IMP-0011` | blanca aracely reyes | $15,000 | $15,300 | $300 |
| `MTY-IMP-0019` | fatima gatica | $21,000 | $21,250 | $250 |
| `MTY-IMP-0020` | maria del rosario | $36,900 | $37,450 | $550 |
| `MTY-IMP-0021` | ivette sarahi cabrera | $17,500 | $17,550 | $50 |
| `MTY-IMP-0026` | nereyda concepcion | $25,000 | $26,150 | $1,150 |

## Saldos que quedan

- liquidados: 8
- con saldo: 24, $236,145 en total
- pagados de más: 19 (ver la sección de arriba)

## Decisiones que se tomaron, y que conviene mirar

- **Folio.** Los contratos importados llevan folio `MTY-IMP-0001` en adelante. No salen de
  la secuencia de la tienda: si salieran, la historia se comería los folios de los
  contratos nuevos. Además, en papel se distingue de un vistazo.
- **Vendedora.** El libro no dice quién vendió. Todos quedan a nombre de la dueña, que es
  quien importa; `imported = 1` los marca.
- **Precios por renglón.** El libro sólo trae el total del contrato, no lo que costó cada
  vestido y cada accesorio. El total va todo en el renglón del vestido y los accesorios
  quedan en cero, con su texto. Sumados dan el total, que es lo que importa para el saldo.
- **Plan.** `Histórico (importado)`, sin parcialidades generadas: el saldo es el total
  menos lo pagado, y no hay calendario que inventar.
- **Comprobantes.** Estos abonos se cobraron antes de que el sistema existiera y no tienen
  foto. Se marcan `imported = 1` y la excepción vive sólo aquí: la API sigue rechazando
  cualquier abono nuevo sin comprobante.
- **Fechas ilegibles.** 1 de 182 abonos no traen fecha que se pueda leer
  (`«2800 28-2»`). Se guarda el monto y la fecha queda nula, con el texto original al lado.
