# Lo que no se hizo en este paso, y por qué

## 1. Bloqueado: faltan tres de los cuatro documentos de origen

El encargo empieza con «lee los cuatro archivos de `docs/`». Al construir esto,
el repositorio estaba vacío y sólo se pudo alcanzar la hoja de cálculo del
libro de pagos. Estos tres nunca llegaron:

| Archivo | Para qué era | Qué quedó en su lugar |
| --- | --- | --- |
| `prototype.html` | El sistema de diseño: paleta, tipografía, espacios, tamaños de toque, formas y textos en español. Se extrae literal a `src/styles/tokens.css`. | `src/styles/tokens.css` con valores provisionales, bajo un encabezado que lo dice. Los **nombres** de los tokens ya son los definitivos y ningún otro archivo trae un color, un tamaño de letra ni un espacio escrito a mano: reemplazar el sistema de diseño es cambiar el lado derecho de las declaraciones de ese archivo. No se rediseñó nada. |
| `contrato_de_novia_nov_2024.docx` | La plantilla del contrato, palabra por palabra, con cada blanco vuelto `{{marcador}}`. | Una plantilla provisional en `0002_seed.sql` que ya usa **todos** los marcadores del encargo. Se sustituye desde **Ajustes → Plantilla del contrato**, con vista previa en vivo y sin tocar código. |
| `medidas_soy_unica_mty.docx` | El formato real de medidas, reproducido tal cual. | `src/screens/PrintMedidas.tsx` con una hoja Carta vertical, folio en 18 pt, datos de la novia impresos, **todos** los campos de medida en blanco, el bloque de ajustes, el bloque de entrega y los tres bloques de firma. La lista y el orden de los campos son provisionales; el resto de la hoja no. |

Nada más del sistema depende de esos tres archivos: el esquema, el Worker, las
reglas, los cuatro módulos, la impresión y las pruebas están completos.

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
- **Los cuatro planes.** El encargo nombra el de 100 % y el de 50/50; los de
  tres y seis meses se propusieron con rangos de precio y descuentos que la
  dueña debe confirmar en Ajustes.
- **Los cargos con rango** (bastilla 500–2000, mangas 300–500, hombros
  500–1000, crinolina 500–1200) se sembraron con el piso del rango, y el rango
  quedó en el nombre, que es como lo cotiza la vendedora.
- **Existencias de la semilla.** Doce vestidos y cuatro accesorios de Monterrey
  con su nomenclatura real, marcados como provisionales: son un relleno hasta
  que estén las existencias del prototipo.
- **`photo_url` en la importación CSV.** La columna se valida y el enlace se
  guarda en las notas del artículo, pero la foto todavía no se descarga.
- **Archivador de Google Drive.** No existe. Con
  `archive_before_delete` encendido, el borrado por retención se niega y dice
  por qué, que es el comportamiento correcto mientras tanto.
