# Lo que no se hizo en este paso, y por qué

## 1. Los cuatro documentos de origen ya están, y ya se usaron

Los tres provisionales se reemplazaron por lo real:

| Archivo | Qué se hizo |
| --- | --- |
| `prototype.html` | Todos los valores de `src/styles/tokens.css` salen de ahí, con sus mismos nombres (`--ivory`, `--paper`, `--linen`, `--tape`, `--ink`, `--brass`, `--sage`, `--clay`, `--wine`), incluida su paleta oscura. `src/styles/base.css` es su capa de componentes, con sus mismas clases. Sus dos tipografías —Jost y Prata— van empaquetadas en `src/assets/fonts/`, no traídas de Google, para que la tienda se vea igual sin internet. |
| `contrato_de_novia_nov_2024.docx` | Es la plantilla sembrada, palabra por palabra, con sus nueve puntos y hasta sus erratas (`el pago pago a tiempo`, `se se realicen`). Los blancos que el sistema conoce son marcadores; los que no —el plazo de entrega y los días para tomar medidas— siguen siendo rayas para llenar a mano. |
| `medidas_soy_unica_mty.docx` | `src/screens/PrintMedidas.tsx` lo reproduce: el membrete con el logo y la dirección del encabezado de Word, las trece medidas en su orden exacto, el diagrama de medidas, el párrafo de conformidad y los tres bloques de firma: medidas, ajustes y entrega. |

> **Corrección de la ronda anterior.** Ahí se afirmó que el bloque de datos de
> la novia venía dos veces en el documento y se imprimió duplicado. Era falso.
> El bloque vive dentro de un `mc:AlternateContent`, que trae la misma caja de
> texto en dos codificaciones —`mc:Choice` con el dibujo moderno y
> `mc:Fallback` con el VML antiguo—; un extractor que recorre el árbol completo
> las cuenta las dos. Un renderizador escoge una. El bloque va **una** vez.

Las dos imágenes del formato (`word/media/`) se extrajeron a `src/assets/`: el
logo de la tienda y el diagrama de busto, cintura, caderas, altura y hueco de
piso. El logo también es el favicon, dibujado con la misma silueta de vestido
que usa el prototipo.

### Lo que el contrato real destapó: los planes sembrados no son los suyos

El punto 1 del contrato dice, textual, cuáles son los sistemas de pago:

> a)50% (apartado) y 50% (cuando vestido esta listo). B) 40% ( apartado)-30% -
> 30% (cada mes) C)20% 5 meses. el vestido se realiza con 40% precio de vestido

Son **50/50**, **40/30/30** y **20 % a cinco meses**. Los sembrados en
`0002_seed.sql` son otros: «Pago de contado», «Mitad y mitad», «Tres meses»
(50/25/25) y «Seis meses». Sólo el de mitad y mitad coincide.

**No se cambiaron**, porque cambiarlos cambia qué planes ofrece el sistema y el
encargo de este paso decía no tocar comportamiento. Pero conviene arreglarlo
antes de usarlo en la tienda: hoy el contrato impreso nombra tres planes y la
pantalla ofrece otros cuatro. Es un renglón por plan en Ajustes, o tres
renglones en la semilla:

| Nombre | `splits` | `max_months` |
| --- | --- | --- |
| Mitad y mitad | `[50,50]` | 0 |
| 40/30/30 | `[40,30,30]` | 2 |
| 20 % a cinco meses | `[20,20,20,20,20]` | 4 |

El contrato también confirma lo que ya estaba sembrado: hotel de vestido de
$30 por día tras 10 días de gracia, 5 % de recargo mensual por atraso, y toda
la lista de cargos extra.

## 1b. Lo que sí se leyó: el libro de pagos

`pagos.xlsx` se encontró en Drive como
`PagosRecuperado_automáticamente…xlsx` y **sí se leyó**. **No se importó**,
como pedía el encargo. Son 104 hojas de mes —una por mes, de 2018 a 2026— con
**1 290 renglones de clienta**. Lo que dicen, y lo que de ahí se modeló:

- **86 % de los contratos llevan más de tres abonos**, contra encabezados que
  sólo declaran «1 pago / 2 pago / 3 pago». El promedio es 5.6 abonos y el
  máximo 18; los abonos se desbordan a la derecha, escritos a mano como
  `2040 (7 dic)` en columnas sin nombre. Por eso el plan es fijo pero el campo
  del monto acepta cualquier cifra: es lo único que mantiene el registro fiel
  en lugar de empujar a la vendedora de vuelta al cuaderno.
- **La columna «medidas» está llena en 3 renglones de 1 290.** En ocho años y
  medio prácticamente nunca se capturó una medida. Es la confirmación más
  clara de que la hoja firmada es el registro y de que no debe existir ni un
  campo numérico de medidas en el sistema.
- **El vestido y sus accesorios viven en una sola celda de texto**
  (`p42, mantilla 11, crinolina`, `p25 mas velo liso m3 t`), y los cargos se
  desglosan a mano en celdas sueltas (`vestido 9500 / mantilla 2100 /
  corta 900 / cinto 550 / mangas 500`, `total 13671`, `menos 10000`,
  `faltan 3671`). De ahí que `contract_items` sea renglones tipados y no texto.
- Los códigos son los suyos: `p1`, `p9`, `p25`, `p42`, `sl6`, `p52`.

### Hallazgo que el encargo no cubre: renta

**49 renglones dicen `renta`** (`p15 renta`, `p9 renta`). La tienda también
renta vestidos, y el modelo de este paso sólo contempla venta: un vestido
rentado vuelve al inventario en una fecha, no se entrega para siempre. No se
inventó nada para cubrirlo. Vale la pena decidirlo antes de importar el
histórico, porque cambia el ciclo de vida del artículo.

## 2. Fuera de alcance a propósito (§11)

Ni una tabla, ni una dependencia, ni una ruta se agregó para nada de esto:

- Reportes y su entrega.
- Correo y `cron`.
- Exportación a Google Sheets.
- WhatsApp.
- El raspado de WooCommerce.
- La importación del histórico de `pagos.xlsx`.
- Escrituras sin conexión y cola de escritura. Las lecturas sí sirven desde
  caché y se marcan como viejas; las escrituras fallan de frente.
- Pantalla de traspaso. La regla y el endpoint sí existen
  (`POST /api/contracts/:folio/transfer`, dueña, negado en cuanto el vestido
  entró a costura); lo que falta es la interfaz.
- Librerías de PDF. Se imprime con `@media print` desde el navegador.

## 3. Decisiones que conviene revisar

- **`expense_categories`.** §6 dice «nada especulativo más allá de esta lista»,
  pero la semilla de §6 pide sembrar categorías de gasto y no había dónde. Es la
  única tabla agregada, y es exactamente lo que la semilla pedía.
- **Bloqueo por NIP en `audit_log`.** El bloqueo por intentos fallidos se deriva
  de renglones `entity = 'auth'` de la bitácora, en vez de una tabla nueva. Los
  intentos de NIP deberían auditarse de todos modos. Si crece el volumen, el
  siguiente paso natural es un Durable Object.
- **Los cuatro planes.** Ya no son una propuesta: el contrato real los nombra.
  Ver el apartado 1, que explica cuáles son y por qué no se cambiaron todavía.
- **Los cargos con rango** (bastilla 500–2000, mangas 300–500, hombros
  500–1000, crinolina 500–1200) se sembraron con el piso del rango, y el rango
  quedó en el nombre, que es como lo cotiza la vendedora.
- **Existencias de la semilla.** Doce vestidos y cuatro accesorios de Monterrey
  con su nomenclatura real (`p139`, `s14`, `A12`, `madelyn`, `mantilla 039`).
  Las del prototipo son otras (Amaranta, Enigma, Cherry…) y traen SKU además
  de código; se dejaron las de la nomenclatura real, que es la que usa la
  tienda. El inventario no tiene columna de SKU y por eso la tabla muestra una
  sola de código, no dos como el prototipo.
- **`photo_url` en la importación CSV.** La columna se valida y el enlace se
  guarda en las notas del artículo, pero la foto todavía no se descarga.
- **Archivador de Google Drive.** No existe. Con
  `archive_before_delete` encendido, el borrado por retención se niega y dice
  por qué, que es el comportamiento correcto mientras tanto.

## 4. Lo que el prototipo dibuja y todavía no existe

- **Fotos de artículo.** El prototipo tiene «Agregar foto» en la ficha de
  inventario y promete hasta cinco. Subir la foto ya funciona
  (`POST /api/uploads` con `kind = 'item_photo'`), pero falta la ruta que la
  ate al artículo en `item_photos`. Mientras tanto la ficha muestra la silueta
  del prototipo. Es un endpoint nuevo, así que no entró en este paso.
- **Cuenta regresiva de la sesión.** El prototipo muestra «Sesión abierta ·
  1:24 restante». No hay expiración de sesión de kiosco en el modelo, así que
  la píldora dice sólo «Sesión abierta».
- **El saldo.** El encargo pedía el saldo como el número más grande de la
  pantalla; el prototipo lo dibuja como un renglón discreto al pie del
  calendario. Se dejó en el lugar del prototipo, con el tamaño del título de
  pantalla: es el número más grande de ese panel sin romper la jerarquía del
  diseño.

## 5. Ronda 3 — lo que cambió

### La novia ya no puede llegar al contrato

Antes, abrir un vestido ofrecía «Elegir este vestido» y saltaba directo a los
datos de la novia: la pantalla de la vendedora, en una tableta que trae la
clienta en las manos. Ahora el kiosco sólo deja ver, marcar favoritos y pedir
pasar al probador; de ahí sale el aviso de entregar la tableta y el NIP de la
vendedora. **El NIP se comprueba en el servidor** (`POST /sessions/:id/select`
lo exige), así que no se puede saltar desde el navegador.

### Dos errores que sólo aparecieron al probar

- **Ningún plan cabía para una boda cercana.** El anticipo se paga el mismo día
  de la firma, pero la regla de «días mínimos antes de la boda» lo estaba
  contando como si fuera una parcialidad futura. Con boda en dos semanas eso
  descartaba hasta el pago de contado, que es justo lo que esa novia haría.
  Ahora la regla sólo mira los pagos posteriores a la firma.
- **La hoja de medidas salía sin modelo ni color.** El vestido se buscaba por
  `items.contract_id`, que sólo se sella al firmar; la hoja se imprime antes.
  Ahora se busca por el renglón del contrato, que existe desde que se elige.

### Sigue pendiente

- **El «Cerrar sesión» del kiosco sigue siendo una píldora con texto**, no una
  cruz. Es una acción con consecuencias —libera apartados y borra favoritos— y
  está a un palmo de la novia; una cruz sin etiqueta ahí se confunde con
  «salir» y se toca sin querer. Si se prefiere la cruz, es un cambio de una
  línea.
- **Fotos de artículo.** Sigue faltando la ruta que ata una foto subida a
  `item_photos`; la ficha muestra la silueta del prototipo.
- **El id de la sesión de venta vive en `localStorage`.** Si alguna vez se
  restaura un respaldo de la base, los ids guardados en las tabletas no
  existirán del otro lado. La aplicación ya se recupera sola —descarta el id y
  abre una sesión nueva—, pero conviene saberlo antes de restaurar.
