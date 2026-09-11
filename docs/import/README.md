# Imports

Two importers, in `scripts/import/`. **Neither writes to any database.** Each
produces a Markdown report and a `.sql` file; applying it is a separate command
you run yourself. That is the whole safety mechanism: the only way any of this
touches a database is for a person to apply it on purpose, and the report exists
so that person knows what they are applying.

Everything they generate lands in this folder, `docs/import/`. The catalog's
output is gitignored on purpose: it is built from the live site on your machine,
and a `catalog.sql` built from test fixtures must never be mistakable for the
real thing. The ledger's `pagos.md` and `pagos.sql` are committed, because they
came from the real spreadsheet and were reviewed row by row in the repository.

---

## 1 · The website catalog

### Downloading it

```
node scripts/import/catalog.mjs --fetch
```

Needs outbound access to `soyunicanovias.com`.

**The flags**

| flag | what it does |
| --- | --- |
| `--fetch` | pages `/wp-json/wc/store/v1/products?per_page=100&page=N` to the end and saves the raw JSON |
| `--categories` | prints the site's category census and which branch each maps to, then stops |
| `--images` | also downloads each image and re-encodes it: 1600 px, WebP, <=300 KB, the same limits as the tablet. Images already on disk are left alone, so a re-run is cheap |
| *(no flags)* | re-reads the JSON already downloaded and regenerates the report and the `.sql`, asking the site for nothing |

### Check the branch split before anything else

```
node scripts/import/catalog.mjs --categories
```

The site runs two catalogs. The same model appears in both at different prices,
and CDMX carries premium dresses Monterrey does not, so the importer reads each
product's categories and writes it into `mty`, `cdmx`, or both — each with that
branch's own price.

The patterns that decide this live in `STORE_RULES` in
`scripts/import/map-product.mjs`. They were written without ever seeing the
site. Any category that should be CDMX and prints `— (falls back to mty)` means
a pattern is missing and the whole CDMX catalog would land in Monterrey. Edit
`STORE_RULES`, re-run `--categories`, repeat until every row reads the branch
you expect.

**What it writes**

| file | what it is |
| --- | --- |
| `docs/import/catalog-raw.json` | the site's raw response, untouched |
| `docs/import/catalog.md` | **the report to read** |
| `docs/import/catalog.sql` | the `INSERT`s, to apply |
| `docs/import/catalog-images/` | the re-encoded `.webp` images |
| `docs/import/catalog-r2.tsv` | `localpath<TAB>r2key`, one line per upload |

### What to check in the report before applying

1. **By branch.** Row counts and catalog value per branch. If CDMX is zero, the
   category patterns did not match — go back to `--categories`.
2. **The same model in both branches.** Each branch's code and price for the
   same dress. A `$0.00` row is one she leaves unpriced on purpose; it comes in
   flagged and cannot be sold until it has a price.
3. **Flagged for review.** Rows missing a price or a code. These are *not*
   rejections: they are imported with everything the site does give and land
   under the **Por verificar** chip in Inventario with the missing fields
   marked. Nothing is guessed.
4. **Rejected.** Only products the site gives no name for. If this list is long,
   something changed on the site and is worth looking at first.
5. **Duplicate codes.** The code is unique per branch, so only the first of each
   clash is written. Check the one that stays is the right one: that is what the
   seller will type to search.
6. **Codes.** How many codes came from the SKU, from the model name, and from a
   `s/n-` placeholder. A large placeholder count means the site lost its SKUs.
7. **Images that could not be downloaded**, with the reason.

### Applying it

**Local first, always:**

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/catalog.sql
```

Images go to R2 separately, driven by the manifest so each one lands under the
right branch's key:

```
while IFS=$'\t' read -r local key; do
  npx wrangler r2 object put "soy-unica-files/$key" --file "$local" \
    --content-type image/webp --local
done < docs/import/catalog-r2.tsv
```

Items come in with `INSERT OR IGNORE`: **a code that already exists is left
alone.** It can be re-applied without duplicating anything, and without undoing
an edit she has since made. What it will *not* do is move a row that went to the
wrong branch — delete those by hand first if it comes to that.

For the production run, see **[docs/DEPLOY.md](../DEPLOY.md) §6 and §7**, which
has the same steps with `--remote` and without `--local`.

---

## 2 · The 2026 contracts from the payments ledger

### Generating it

It needs the current catalog to tie product fragments to an item, so the catalog
is passed in on a flag:

```
ITEMS=$(npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --json --command "SELECT id, code, name, kind FROM items WHERE store_id='mty'" \
  | tail -n +2 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))")

node scripts/import/pagos.mjs --items="$ITEMS"
```

Without `--items` it still runs, but no fragment ties to anything and everything
stays as text.

**What it writes**

| file | what it is |
| --- | --- |
| `docs/import/pagos.md` | **the report to read** |
| `docs/import/pagos.sql` | the `INSERT`s, to apply |
| `docs/import/pendientes.html` | **the sheet to print**: the rejected rows, with every raw cell and ruled blanks for what is missing |
| `docs/import/pagos.json` | the same thing raw, for looking at with another tool |

### What to check in the report before applying

1. **Rejected.** These do not reach the `.sql`: they are missing something that
   cannot be deduced. Open `docs/import/pendientes.html` in a browser and print
   it — it fits on one page — for the owner to fill the blanks in by hand; those
   are then captured in the system like any other contract. **Watch the live
   receivables**: the sheet boxes anyone who has already paid and has no total
   recorded.
2. **Dropped duplicates.** One capture is kept from each pair. The table shows
   both totals, so a row where the kept one is wrong is visible at a glance.
3. **Decisions made by hand.** The ones the owner has already decided, each with
   its reason. They live in the `MANUAL` table in
   `scripts/import/parse-pagos.mjs`: changing your mind about any one of them is
   changing one line and regenerating.
4. **Possible duplicates that did not merge on their own.** Names one or two
   letters apart on the same date. While they are there they are **imported
   twice**, until they go into the `MANUAL` table.
5. **The $100 remainder.** Thirteen contracts with exactly one hundred pesos
   paid over. Until it is confirmed what that is, they stay as they are, with no
   invented line item.
6. **Fragments that did not tie.** Kept as text. A lot of them means the catalog
   is not imported yet: import the catalog first and regenerate this.

### Applying it

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/pagos.sql
```

**Careful:** unlike the catalog, this is **not** repeatable. Each run inserts
new customers and contracts with new folios. To redo it, delete what was
imported first:

```sql
DELETE FROM contracts WHERE imported = 1;              -- takes its lines and payments with it
DELETE FROM customers WHERE source = 'pagos.xlsx';
```

This is why the ledger import is **not** part of the first deploy. See
`docs/DEPLOY.md` §10.

---

## The order matters

The catalog goes **first**. The ledger import ties each product fragment —
`p139`, `mantilla 045`, `crinolina 6 aros` — against `items.code`, and with only
the seed's placeholder catalog almost none of them find their item.

```
1. catalog  --categories → --fetch --images  → review → apply
2. pagos    --items="$ITEMS"                 → review → apply
```

The ledger report says, under "Fragmentos de producto", how many tied and how
many stayed as text. That pair of numbers is how you check the order was kept.

---

## Production

None of this is applied to a remote database until both reports have been
reviewed. When they have, it is the same command with `--remote` in place of
`--local --persist-to`:

```
npx wrangler d1 execute soy-unica --remote --file docs/import/catalog.sql
```
