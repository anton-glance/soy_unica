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
- **El id de la sesión de venta vive en `localStorage`.** Si alguna vez se
  restaura un respaldo de la base, los ids guardados en las tabletas no
  existirán del otro lado. La aplicación ya se recupera sola —descarta el id y
  abre una sesión nueva—, pero conviene saberlo antes de restaurar.


## 6. Ronda 4 — un solo marco, el paso de selección y los bloqueos

### El marco es uno para toda la aplicación

`src/components/Screen.tsx` es la cabecera de **todas** las pantallas. Ninguna
dibuja la suya. La barra es fija, mide siempre `--bar-h` (96 px) y reparte tres
huecos que existen aunque vayan vacíos —así nada se mueve de sitio al cambiar de
pantalla:

- izquierda, el regreso: círculo de 52 px con contorno fino y una flecha, sin
  etiqueta, siempre en x = 34. Falta sólo en la primera pantalla, la de la
  sucursal, que no tiene padre.
- centro, el título, uno y sólo uno, en la letra de display a 44 px —el tamaño
  que ya usaba «Selecciona tu rol».
- derecha, la (X): únicamente en los cuatro cuadros, donde significa salir del
  sistema. Ninguna pantalla interior la lleva.

Los diálogos no usan `<Screen>`: llevan su (X) arriba a la derecha y no tienen
regreso. Su encabezado sí comparte el reparto —hueco, título centrado, (X)— para
que el título quede al centro de verdad.

Los títulos repetidos de Inventario y Registrar gasto se borraron: ahora viven
sólo en la barra.

### El teclado del NIP

La tecla **5 cae en el centro exacto de la pantalla** (50 vw / 50 vh), medido en
el navegador en los tres teclados: entrada, entrega de la tableta y cierre de
sesión. Va anclado al viewport, no al hueco que deja la barra, que era el error
de antes: quedaba media barra más abajo. Los puntos ahora se llenan conforme se
teclea y muestran cuántos dígitos lleva el NIP, en vez de seis círculos fijos.

### Lo que se encontró probando, y no estaba en la lista

- **La barra se comía los toques de los diálogos.** `.veil` estaba en z-index 20
  y la barra en 30: la (X) de un diálogo a pantalla completa era inalcanzable
  porque el hueco vacío de la barra interceptaba el toque. El velo pasó a 100.
- **El pie de acción caía fuera de la pantalla.** `<main>` medía el alto
  completo, así que el pie quedaba justo debajo del borde inferior: el botón
  existía y no se veía. Ahora el pie es pegajoso, mide siempre `--footer-h`
  (110 px) y la acción propia de una pantalla —«Guardar el plan»— se pega
  encima de él, nunca debajo.
- **El contrato se imprimía sin calendario de pagos.** Las parcialidades se
  escribían al firmar, pero el contrato se imprime *antes* de la firma: la hoja
  que la novia firmaba llevaba la tabla en blanco. Ahora se escriben al escoger
  el plan y se vuelven a generar al firmar, con la fecha de firma. Lo destapó la
  prueba nueva `tests/plan-to-contract.test.ts`.
- **`input[type=tel]` no estaba en la lista de campos.** Por eso el teléfono
  salía angosto: el selector de `base.css` enumera tipos y `tel` no aparecía.
  Medido en el navegador, ahora mide lo mismo que el nombre y la fecha (518 px).

### Sigue pendiente

- **El «Cerrar sesión» del kiosco sigue siendo una píldora con texto**, no una
  cruz, por la misma razón de la ronda 3: es una acción con consecuencias y está
  a un palmo de la novia.
- **La importación del catálogo de WooCommerce y de `pagos.xlsx`** (parte C de
  la ronda 3) sigue sin correr. Nada de esta ronda la toca.


## 7. Ronda 5 — el papel, el registro de la sesión y CI

### El calendario de pagos se congela al escoger el plan

Antes se escribía al escoger el plan y **se volvía a generar al firmar, con la
fecha de firma**. Si la vendedora imprimía el jueves y la novia firmaba el
viernes, el papel que ella se llevaba y la base de datos no coincidían en una
sola fecha de vencimiento —y el papel es el registro legal.

Ahora `contracts.schedule_generated_on` guarda el día con el que se generó, que
es el que salió impreso. `/sign` ya no genera nada: lee lo guardado. Si la firma
cae en otro día, responde 409 con código `stale_schedule` y la pantalla ofrece
«Volver a imprimir», que vuelve a generar con la fecha de hoy y regresa la
sesión al paso de imprimir. `tests/frozen-schedule.test.ts` recorre eso:
adelanta el reloj un día, comprueba la negativa, reimprime, firma y verifica
renglón por renglón que lo guardado es lo impreso.

### Lo que una sesión deja escrito

La sesión es el registro de lo que pasó con una clienta que entró, haya comprado
o no. Faltaban cuatro cosas y ya están:

- **El traspaso de la tableta** es ahora un hecho de la sesión:
  `POST /sessions/:id/handover` comprueba el NIP en el servidor y deja escrito
  quién tomó la tableta y qué favoritos se fueron al probador.
- **La selección vive en la sesión**, en `session_selections`, y no sólo en los
  renglones del contrato: un contrato anulado sigue existiendo, pero lo que la
  clienta escogió es de su historia y no puede depender de lo que le pase
  después al contrato.
- **Los favoritos ya no se borran al cerrar.** Se borraban justo cuando la
  sesión se volvía histórico, y eran la única señal de demanda de la semana.
  Los apartados del inventario sí se sueltan: eso es estado vivo.
- **`kiosk_sessions.closed_at_stage`** guarda la etapa en que murió. `stage` se
  sobreescribe con `'closed'` y sin esto «se fue viendo el catálogo» y «se fue
  después de dar sus datos» se leen igual.

La consecuencia: una sesión que llegó a capturar datos deja una persona
localizable —nombre, teléfono, el vestido que quería y por qué se fue—, que es
una lista de llamadas. Una que se fue antes deja una cuenta y un motivo, sin un
solo dato personal, porque nunca se capturó ninguno.

### El reporte semanal (sólo la mitad de sesiones)

`GET /api/reports/weekly` y la pantalla `/reporte`, sólo para la dueña. El
correo y la programación siguen fuera de alcance.

El reporte es de **una sucursal**: la del cookie de quien entró. No hay forma de
pedir la otra, y eso es a propósito —ninguna ruta lee `store_id` del cuerpo ni de
la query. La dueña ve CDMX entrando como CDMX.

### Sigue pendiente

- **Las importaciones de datos** (catálogo de WooCommerce y `pagos.xlsx`) van en
  otra rama y otro PR.
- **El «Cerrar sesión» del kiosco sigue siendo una píldora con texto**, por la
  misma razón de las rondas anteriores.


## 8. Correcciones sobre la ronda 5

### CI: una corrida por commit

`on: push` + `on: pull_request` corría el mismo commit dos veces en cualquier
rama con PR abierto. El disparador de push queda limitado a `main`.

### Sesiones abandonadas

`outcome = 'abandoned'` estaba en el esquema desde el principio y no lo escribía
nadie: una sesión sólo se cerraba a mano, con el NIP. Cuando la vendedora apaga
la tableta al final del día sin cerrarla, los apartados de esa novia se quedan
en `watching` para siempre y a la mañana siguiente esos vestidos ya no aparecen
en el kiosco, sin forma de arreglarlo desde la tienda.

Ahora el tiempo las cierra. `worker/lib/reaper.ts` busca las sesiones sin
actividad —el último `session_events.at`, o `opened_at` si no tiene ninguno— por
más de `stores.session_timeout_hours` (4 por omisión, configurable en Ajustes,
mínimo 1) y las cierra con `outcome = 'abandoned'`, soltando sus apartados. Les
conserva **eventos y favoritos**: no compró, pero vino.

El barrido corre en tres lugares: un cron del Worker cada hora, al abrir una
sesión nueva —que es la mañana siguiente, cuando de verdad importa— y al
consultar las sesiones abiertas.

Abandonada **no** es perdida: nadie dijo por qué se fue la clienta. El reporte
la cuenta aparte, con su propio renglón en el embudo y su propio motivo, para no
leerla como una venta perdida que nunca se registró.

Los cuadros del inicio muestran cuántas sesiones siguen abiertas en la sucursal.
Si dice dos y sólo hay una tableta en uso, ahí está el aviso.

## 9. Las importaciones de datos (rama aparte)

Dos importadores, en `scripts/import/`. Ninguno escribe en ninguna base: cada
uno produce **un reporte** y **un `.sql`** que se aplica a mano. Es a propósito
—la única forma de que esto toque una base es que una persona corra el comando,
y el reporte existe para que esa persona sepa qué está aplicando.

```
node scripts/import/pagos.mjs --items="$(…)"   # libro de pagos 2026
node scripts/import/catalog.mjs --fetch        # catálogo del sitio
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state --file docs/import/pagos.sql
```

### C2 — los contratos de 2026 · corrido

`docs/import/pagos.md`. De 67 renglones en las nueve hojas de 2026: **51
importables**, 5 rechazados, 11 descartados. Aplicado a la base local: 51
contratos, 182 abonos, 51 clientas, 22 créditos de regalo, cero parcialidades
generadas, y las dos aritméticas cuadran en los 51.

De los once descartados, cuatro los decidió la dueña a mano —una clienta
capturada con el nombre mal escrito, un cambio de modelo que no era duplicado y
dos casos de accesorios agregados después de firmar—. Están en la tabla `MANUAL`
de `scripts/import/parse-pagos.mjs`, cada una con su motivo, y el reporte las
nombra una por una.

Los cinco rechazados salen en `docs/import/pendientes.html`, una hoja de papel
con sus celdas crudas y los huecos en blanco: **no se les inventó ningún
importe**. Una de ellas ya pagó $11,800 sin total anotado, así que la hoja lo
marca como cuenta por cobrar viva.

El libro está lleno a mano desde 2018 y se nota: tres distribuciones de columnas
distintas, una hoja sin encabezado, un encabezado que miente sobre dónde está el
producto, celdas con dos abonos adentro, un abono escrito «cancelo», un «120000»
que era 12000, y once clientas de febrero capturadas dos veces. Nada de eso se
adivina en silencio: lo que no se entiende se rechaza con el contenido crudo de
la celda.

**El regalo de accesorios está confirmado:** la columna «total» de la hoja ya
trae la cifra neta, así que el regalo no se vuelve a restar.

**Lo que sigue sin resolverse**, y está listado renglón por renglón en el
reporte: trece contratos con exactamente cien pesos pagados de más —la sospecha
es el «porta traje $100» cobrado al recoger, sin confirmar, y no se le inventó
renglón a nadie—, y una pareja de nombres a una letra de distancia que hoy se
importa dos veces.

`docs/import/README.md` tiene los comandos exactos, qué escribe cada uno y qué
revisar antes de aplicar.

### C1 — el catálogo · escrito y probado, no corrido

`docs/import/catalog.md`. El importador está completo: paginación de la Store
API, mapeo con sus casos difíciles, recodificado de imágenes con los mismos
límites de la tableta (1600 px, WebP, ≤300 KB) y renglones en `files` + R2. El
mapeo está probado en `tests/catalog-map.test.ts`.

**No se pudo correr contra el sitio:** este entorno no tiene salida a
`soyunicanovias.com`. Las cifras del reporte salen de una fixture. Falta correrlo
donde haya red para tener los números de verdad —y la proyección de
almacenamiento, que sin las imágenes no existe.

## 10. Round 6 — the open questions, settled

The owner answered every question section 10 raised. This replaces that
section entirely — the three-question discussion it used to hold is gone;
these are the decisions instead. Still in English, per the same standing
instruction: everything a developer reads is English from here on.

### Cancelled — one catalog across both branches

The `models` / `store_models` / `units` split proposed here is **cancelled**.
Confirmed directly with the owner: separate catalogs and inventories per
branch are fine as they are. The two branches' catalogs overlap by only a
handful of items — the same unpriced ones `needs_review` already flags,
where Monterrey leaves a dress unpriced because CDMX carries it at a
different price — and entering those few rows twice, once per branch, is an
acceptable cost. More locations than the current two are not a concern on
any near horizon.

Recording the reason so this doesn't get re-proposed later: the split was
motivated by CDMX's catalog turning out to be separate data (confirmed when
`scripts/import/catalog.mjs` was built) and by garments occasionally moving
between branches overnight. Neither turns out to need a schema change —
CDMX's catalog is simply imported on its own into `mty`/`cdmx` as today's
schema already allows, and a garment moving branches is rare enough, and
`items.store_id` cheap enough to hand-edit for the few rows it affects, that
it doesn't justify re-pointing every foreign key onto `items.id` through a
new `units` table. `items` stays exactly as it is: one row per branch, no
`store_id`-less catalog layer above it.

### Reduced — order-new versus sell-the-display

Every model in the catalog is made to order — that's why measurements exist
at all, and why clause 3 of the contract counts the delivery window from the
measurement date. There is no display-vs-order distinction to model: the
owner deactivates an item from the catalog by hand (today: `retire` /
`unretire`, `worker/lib/items.ts`) when she no longer physically has it to
show. So there is no `fulfilment` field on the contract line, and no
automatic depletion of anything when a sale closes.

What survives from that discussion is much smaller: the `watching` status
(`items.status`, set by `takeHold()` in `worker/routes/sessions.ts`) is a
**soft indicator only** — it tells the kiosk "someone is currently looking at
this," nothing more — and it must never block a second bride from taking the
same model to the fitting room.

**What `watching` actually does today, checked against the code, and why it
still blocks:**

- `takeHold()` (`worker/routes/sessions.ts`, called from `/view` and
  `/favorites`) sets `status = 'watching'` and `held_by_session` on a
  `'unidad'` item the moment a bride opens its detail or favourites it —
  `'pedido'` items are skipped entirely (`if (item.acquisition === 'pedido')
  return`), which was already correct and needs no change.
- `GET /items/kiosk` reports `held_by_other` for any `'unidad'` item another
  session is watching, and the kiosk card shows "La está viendo otra
  clienta" — that's the soft indicator, and it's fine as it is.
- `POST /sessions/:id/select` is where the soft indicator turns into a real
  block: for a `'unidad'` item, `if (item.held_by_session !== null &&
  item.held_by_session !== row.id) throw conflict('Ese vestido lo está
  viendo otra clienta en este momento.')` refuses the second bride outright.
  That's the blocking behaviour that has to go — favouriting or viewing a
  model must stay visible to everyone, but choosing it for a fitting must
  never depend on who looked at it first.

This is recorded, not built this round: the fix is to stop `/select` from
refusing on `held_by_session` alone (a `'unidad'` item should be selectable
by any session unless it's already `reserved` on an *active* contract, which
`/select`'s `status` check just below the quoted line already covers on its
own), and to leave `watching`/`held_by_other` purely informational from
there on. `worker/lib/reaper.ts`'s release-on-timeout logic keeps working
unchanged; it just stops being the thing standing between two brides and one
rack.

### Merged and expanded — clients and resumable sessions

The client's whole history — not one contract, not one session — is now the
unit the owner thinks in. A bride leaves and comes back, often weeks later;
the client card is meant to be every session she's ever had, each with its
start, her favourites, what she chose, and how it ended, and she should be
resumable from wherever a given session stopped.

**What round 6 already moved toward this, so it doesn't get re-described as
untouched:** the close reason was already captured before this round
(`kiosk_sessions.outcome`, `reason`, `note`, `closed_at_stage`), and this
round added a `GET /clients/:id` endpoint (`worker/routes/clients.ts`) and a
client page (`src/screens/Clients.tsx`) that show one customer's one session
— her favourites as "Lo que vio" when there was no sale, her outcome and
reason under "Por qué no se vendió", and a same-day "Reanudar" via `Agregar`
when that session is still open (`session.closed_at === null`). What's
**not** built yet, and is the actual scope of "merged and expanded": a
`customers` row is created fresh by every session that reaches
`POST /sessions/:id/bride` (`worker/routes/sessions.ts`), with no lookup by
phone against an existing customer first — so today a returning bride gets a
second, disconnected `customers` row rather than a second session folded
into her existing one. Merging those into one client identity (matched on
phone, most likely) and letting a *closed* session be resumed — not only one
the reaper hasn't caught up to yet — is the real work this section defers.

Also confirmed reachable, since the owner said she couldn't find it: the
weekly report's "Sesiones sin venta" section (`src/screens/Reports.tsx`,
formerly `WeeklyReport.tsx`) is reached from the tiles via the owner-only
"Reportes" button (`src/screens/Tiles.tsx`) — that path exists and works.
It's easy to miss because it's below "⚙ Ajustes" and not a tile itself; worth
a second look if it's still hard to find once this round ships, but nothing
about the route is actually broken.

### Changed — accessories after the contract, and it's no longer a question

Round 6 asked which shape a post-signature accessory sale should take.
Settled, and now built: **the addendum**, not a second contract.
`POST /contracts/:folio/accessories` (`worker/routes/contracts.ts`) inserts a
new `contract_items` row (`line_kind = 'accessory'`, `added_at` set —
`db/migrations/0009_contract_item_added_at.sql`) on the *existing* contract
and adds its price straight onto `contracts.total_cents`. No new session, no
new folio, no new `installments` row: the extra amount simply raises the
balance `buildLedger()` (`worker/lib/payments.ts`) already computes as
`total_cents − paid`, so it's covered by whatever the bride pays next,
same as an under-paid instalment would be. The client page
(`src/screens/Clients.tsx`) shows it as its own line under "Lo que se
llevó", marked "agregado {date}", and the owner's report
(`src/screens/Reports.tsx`) lists it separately from what was sold at
signing, per session, under "Agregado después del contrato".

This only covers accessories, deliberately: a dress always needs a session
and measurements, so this shortcut never applies to one.

### New — promo price, not price history

Not a history of every price a model has carried — a **current price plus an
optional promo price**. When a promo price is set, the kiosk and the seller
screens render the regular price struck through and the promo price larger
and brighter next to it; with no promo price set, an item displays exactly
as it does today.

Two places this touches, both already in the codebase, neither built against
yet:

- **The site's "Bridal Sale -20%" flag.** `scripts/import/map-product.mjs`
  already detects this category and records it as a note on the imported
  item (`row.promo`, see `docs/import/catalog.mjs`'s promotion-note section)
  — it has never touched `price_cents`. Once promo pricing exists, this is
  the first real producer of it: the importer should compute the promo price
  from the flagged 20% off instead of writing a note nobody acts on.
- **The contract's late-payment clause.** Clause 2 of the printed contract
  (`db/migrations/0002_seed.sql`'s seeded `contract_template`) already says a
  late payment costs the bride her "descuento o promoción" — so a promo
  price has to be capturable *per contract*, frozen at the price the bride
  actually signed at (contracts already copy `plan_name` at signing for the
  same reason: the plan can change name later and the paper is the legal
  record), not read live off the item, or a late payment would have nothing
  fixed to take away.

### New — PIN recovery

The immediate bug is fixed this round: see part 1.2 and
`docs/DEPLOY.md` §11 for the manual `pin_hash`/`pin_salt` reset, which is
the only recovery path that exists today and needs `wrangler` access to the
remote database — not something the owner can do herself.

What's recorded, not built, is how she regains access **without** a
developer. Three shapes, weighed against each other, none chosen yet:

1. **A recovery code, generated once and kept offline** (written down,
   given to the owner at deploy time) — closest to how most consumer
   password resets work, but it's one more secret to lose, and losing it
   is exactly the failure mode this exists to recover from.
2. **Owner resets seller.** Natural fit for the existing role hierarchy
   (`users.role IN ('owner','seller')`) and needs no new secret — but
   doesn't help if the owner herself is the one locked out, which is
   exactly what happened in part 1.2.
3. **Seller resets owner.** Closes that gap, but means a seller can lock the
   owner out of her own settings, which is a bigger trust shift than it
   sounds — Ajustes is owner-only today (`app.use('*', requireOwner)`,
   `worker/routes/settings.ts`) precisely because a seller isn't supposed to
   change store-level configuration.

Whichever shape wins, the design constraint is the same one the double-entry
fix in part 1.2 exists for: **two people must never be locked out at once**.
A design that lets the owner and the sole seller each hold the other's only
key back in is worth checking against that before anything else.
