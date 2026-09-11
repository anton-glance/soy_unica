# Soy Única Novias

Sistema de la tienda: kiosko de venta, inventario, pagos y gastos. Un Worker de
Cloudflare con Hono sobre D1 y R2, y una aplicación de Vite + React 19. Sin ORM,
sin librería de componentes, sin dependencias de ejecución más allá de Hono y
React.

Todo el dinero es entero en centavos. Las fechas de calendario son `YYYY-MM-DD`
y las marcas de tiempo ISO. El formato ocurre sólo en la orilla: pantalla e
impresión.

---

## Desarrollo local

No hace falta cuenta de Cloudflare ni conexión: D1 y R2 corren locales y
persisten en `.wrangler/state`.

```bash
npm install
npm run db:reset   # borra el estado local, migra, siembra e imprime los NIP
npm run dev        # Worker en 8790 + Vite en 5180
```

Abre <http://localhost:5180>. Vite manda todo `/api` al Worker en 8790. Los
puertos 3000 y 3100 están ocupados en las máquinas de la tienda, por eso estos.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Levanta el Worker y la aplicación juntos |
| `npm run db:reset` | Estado local desde cero: migraciones + semilla |
| `npm run db:migrate` | Sólo aplica migraciones pendientes |
| `npm run typecheck` | `tsc -b` sobre la app, el Worker y las pruebas |
| `npm run lint` | ESLint |
| `npm test` | Vitest: unitarias + integración contra el Worker real |
| `npm run build` | Compila la aplicación a `dist/` |

### NIP de la semilla

| Sucursal | Rol | NIP |
| --- | --- | --- |
| Monterrey | Dueña | `4242` |
| Monterrey | Vendedora | `1111` |
| CDMX | Dueña | `4242` |
| CDMX | Vendedora | `2222` |

**Cámbialos en Ajustes antes de usar el sistema en la tienda.** `npm run db:reset`
los vuelve a imprimir con el mismo recordatorio.

---

## Recorrido de aceptación

Este recorrido es el criterio de aceptación y está automatizado en
`tests/flow.test.ts`, que lo corre completo contra el Worker real con `npm test`.
Para hacerlo a mano, con `npm run dev` levantado:

1. **Monterrey → Vendedora → NIP 1111 → Nueva sesión.**
2. Marca como favorito **un vestido único** (por ejemplo `p139`) y **un modelo
   por pedido** (`madelyn`).
3. En **otro navegador** entra igual y abre una sesión: el vestido único se ve
   apagado con «La está viendo otra clienta», sigue visible y tocable; el modelo
   por pedido no se apaga, porque dos novias pueden encargar el mismo.
4. Elige el vestido único. El otro apartado se suelta y se emite el folio, que a
   partir de aquí sale impreso en todas las hojas.
5. Captura los datos de la novia. Los cuatro son obligatorios: la fecha del
   evento decide qué planes caben.
6. **Imprime medidas.** Carta vertical, folio arriba a la derecha en 18 pt, dos
   copias, todos los campos de medida en blanco.
7. Sube la foto de la hoja firmada. Sin ella no se avanza.
8. Escoge el plan. Sólo aparecen los que caben por precio, por meses y —si hay
   fecha— por el mínimo de días antes de la boda. El calendario se ve antes de
   guardarse.
9. **Imprime el contrato** en el reverso de las mismas dos hojas.
10. Intenta activar el contrato sin la foto del contrato firmado: se niega en
    español. Sube la foto y actívalo: queda `active`, el vestido queda
    `reserved` y desaparece del kiosko del otro navegador.
11. Registra un abono **menor** a la parcialidad que toca: el saldo, el
    remanente de esa parcialidad y el calendario quedan correctos, y el plan
    acordado no se mueve.
12. Cierra la sesión como **vendida**, con el NIP de la vendedora.
13. Entra como **Dueña con 4242** y comprueba el vestido, el contrato, los
    abonos, los documentos, la bitácora, la tarjeta de almacenamiento y la
    revisión de retención.
14. Abre una **segunda sesión**, imprime medidas y ciérrala como **perdida**:
    pide confirmar que destruiste las hojas firmadas, el registro se queda como
    `cancelled` con el nombre y el teléfono de la novia, y su folio no se
    reutiliza.

---

## Estructura

```
src/            Aplicación React (pantallas, componentes, lib, estilos)
worker/         index.ts, /routes, /lib
db/migrations/  0001_init.sql, 0002_seed.sql
docs/           Documentos de origen y lo que falta (NEXT.md)
tests/          Unitarias e integración
```

### La tableta es de la novia hasta que deja de serlo

El kiosco es la única pantalla que la novia toca, y no tiene ni un camino al
contrato. Puede ver vestidos, marcarlos y pedir pasar al probador. De ahí sale
un aviso —«Pásale la tablet a la vendedora»— y el NIP de la vendedora, que se
comprueba **en el servidor**, no sólo en la pantalla. Sólo después de ese NIP
aparecen los datos de la novia y todo lo que sigue.

El identificador de la sesión de venta vive en `localStorage`, por navegador
(`su:session`). Sobrevive a un reinicio de la base, así que si algún día se
restaura un respaldo el id guardado ya no existirá del otro lado: cuando eso
pasa, la aplicación lo descarta y abre una sesión nueva sola. Un 401 de verdad
—la cookie vencida— devuelve a la pantalla de sucursal y rol.

### Cómo se defiende el sistema

Todas las reglas viven en el Worker y responden 409 con un mensaje en español
que dice qué hacer:

- La sucursal y el rol vienen de la cookie firmada. Ninguna ruta los acepta del
  cuerpo ni de la query.
- Las vendedoras sólo insertan y consultan. No hay `PATCH` ni `DELETE` genérico
  alcanzable con su token; los cambios de estado pasan por endpoints con nombre
  que validan el estado de origen.
- Un pago no se escribe sin comprobante. El pago, sus archivos y el recálculo
  del saldo van en un solo batch.
- `ready` se deriva de la costura terminada más saldo en cero; `sold` sólo se
  alcanza por la entrega.
- Los pagos sólo se agregan: corregir es cancelar con motivo (dueña) más un
  abono nuevo, y el renglón cancelado se queda a la vista.
- Los folios se emiten una vez y jamás se reutilizan.
- La retención se niega a borrar con saldo abierto, dentro de los 12 meses
  posteriores a la entrega, o con archivo-antes-de-borrar encendido y nada
  archivado.

---

## Primera vez en Cloudflare

Todavía **no está desplegado**. Cuando toque:

```bash
npx wrangler login

# 1. Base de datos. Copia el database_id que imprime a wrangler.toml.
npx wrangler d1 create soy-unica

# 2. Bucket de archivos.
npx wrangler r2 bucket create soy-unica-files

# 3. Migraciones y semilla en la base remota.
npx wrangler d1 migrations apply soy-unica --remote

# 4. Secreto de sesión. Genera uno largo y al azar; NO reutilices el de local.
npx wrangler secret put JWT_SECRET

# 5. Compila y publica (Worker + archivos estáticos).
npm run build
npx wrangler deploy
```

Queda en `https://soy-unica.<subdominio-de-tu-cuenta>.workers.dev`.

Entra de inmediato a **Ajustes → NIP** y cambia los cuatro NIP de la semilla.

En local el secreto sale de `.dev.vars`, que `npm run dev` crea desde
`.dev.vars.example` si falta. `.dev.vars` está en `.gitignore` y nunca debe
subirse.

---

## El sistema de diseño

`src/styles/tokens.css` está extraído literalmente de `docs/prototype.html`, el
prototipo aprobado, con sus mismos nombres de token y su paleta clara y oscura.
`src/styles/base.css` es su capa de componentes, con sus mismas clases, para que
el marcado de la aplicación y el del prototipo se lean igual. Las dos
tipografías del prototipo —Jost y Prata— van empaquetadas en
`src/assets/fonts/`: la tienda se ve igual aunque se caiga el internet del
local.

Si el prototipo cambia, `tokens.css` es lo único que se vuelve a extraer.

Las dos hojas impresas salen de los documentos reales: la de medidas reproduce
`docs/medidas_soy_unica_mty.docx` con sus tres bloques de firma, y el contrato
es `docs/contrato_de_novia_nov_2024.docx` palabra por palabra, guardado en
`stores.contract_template` y editable en Ajustes. Cada copia cabe en una página,
porque el contrato se imprime al reverso de las mismas dos hojas de medidas.

El logo vive en `docs/brand/logo-transparente.png` y sus dos variantes de
paleta en `src/assets/brand/`: tinta para fondos claros —incluido el papel— y
crema para fondos oscuros.

### Una casilla que hay que desmarcar una sola vez

El tamaño y los márgenes de la hoja los fija la aplicación (`@page`), así que
la vendedora no tiene que tocar «escala» ni «márgenes» en el diálogo de
impresión. Lo único que el navegador no deja controlar desde la página es su
propio encabezado y pie —la fecha, la dirección y el número de página que
Chrome añade arriba y abajo.

**La primera vez que se imprima desde la tableta de la tienda**, en el diálogo
de impresión de Chrome hay que abrir «Más configuraciones» y desmarcar
**«Encabezados y pies de página»**. Chrome lo recuerda para las siguientes
impresiones; no hay que repetirlo cada vez.

## Lo que falta

`docs/NEXT.md` lleva la lista de lo que se dejó fuera a propósito en este paso,
lo que el prototipo dibuja y todavía no existe, y un desajuste que vale la pena
revisar: los planes de pago sembrados no son los tres que nombra el contrato
real.
