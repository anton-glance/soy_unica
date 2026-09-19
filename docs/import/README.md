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
node scripts/import/catalog.mjs --fetch --fetch-locations
```

Needs outbound access to `soyunicanovias.com`. The two flags can be run
separately (`--fetch` alone, then `--fetch-locations` alone later, or vice
versa) or together in one invocation — either way both files need to exist
before a plain `node scripts/import/catalog.mjs` will produce a report.

**The flags**

| flag | what it does |
| --- | --- |
| `--fetch` | pages `/wp-json/wc/store/v1/products?per_page=100&page=N` to the end and saves the raw JSON |
| `--fetch-locations` | pages every `tienda/swoof/location-X/` and `tienda/swoof/location-X/product_cat-Y/` listing, for both branches and every category, and saves which permalinks each one names |
| `--categories` | prints the site's category census and what each one is used for, then stops |
| `--images` | also downloads each image and re-encodes it: 1600 px, WebP, <=300 KB, the same limits as the tablet. Images already on disk are left alone, so a re-run is cheap |
| *(no flags)* | re-reads both JSON files already downloaded and regenerates the report and the `.sql`, asking the site for nothing |

### Both branches, from two different sources

The Store API itself carries no branch at all — checked directly against the
raw JSON, `tags` is empty on every product, permalinks encode category rather
than branch (`producto/vestidos-de-novia/corte-princesa/hanna`), and none of
the categories names one either. The only place the branch shows up is the
site's own **SWOOF-filtered listing pages** — the same filter a bride uses to
pick her city. `--fetch-locations` pages through those, for both branches, and
matches the permalinks it finds there against each product's own permalink
from the Store API.

A product the site lists for only one branch produces one row, there. A
product it lists for **both** produces **two independent rows**, one per
store — this is deliberate duplication, the owner's own decided architecture:
the two branches are physically separate, and from the moment they're
written neither row is linked back to the other. An edit to the Monterrey row
— price, status, photos — never touches the CDMX one.

That duplication is also why the site hides the price on a shared model in
the first place: so a bride in one city can't compare it against the other.
The importer follows the same rule. Where the site *does* publish a price, both
branches get that same number; where it publishes none, both come in flagged
at zero and the owner sets each branch's real price by hand — from there the
two are allowed to differ.

A product **neither** listing ever names is not guessed into a branch: it's
held out of the `.sql` entirely and listed in its own section of the report,
for a person to place by hand.

Two independent checks run per branch: the un-filtered `location-X/` listing
on its own, and the sum of every `location-X/product_cat-Y/` listing. They
should describe exactly the same set of products; the report says so, and
when they disagree neither side is trusted over the other — both go into the
union, and the disagreement is called out so it can be looked into.

What the categories *do* carry reliably: whether something is a dress or an
accessory, its cut, whether it's on liquidation, the "Bridal Sale -20%"
promotion, and rentals (out of scope, excluded). Run `--categories` to see the
site's current census matched against what each category feeds — kind, cut,
condition, a note, or an exclusion:

```
node scripts/import/catalog.mjs --categories
```

The patterns that decide this live in `ACCESSORY_CATEGORIES`, `CUT_CATEGORIES`,
`LIQUIDATION_CATEGORY`, `PROMO_CATEGORY` and `RENTAL_CATEGORY` in
`scripts/import/map-product.mjs`, checked against the real census. If the site
adds a new category, `--categories` prints it as `— not used` and it is worth a
look before assuming it doesn't matter.

**What it writes**

| file | what it is |
| --- | --- |
| `docs/import/catalog-raw.json` | the site's raw Store API response, untouched |
| `docs/import/locations-raw.json` | every SWOOF listing fetched, per branch and per category, with the site's own reported count next to what was actually found |
| `docs/import/catalog.md` | **the report to read** |
| `docs/import/catalog.sql` | the `INSERT`s, to apply — rows for both branches in one file |
| `docs/import/catalog-images/` | the re-encoded `.webp` images, one copy regardless of how many branches a product lands in |
| `docs/import/catalog-r2.tsv` | `localpath<TAB>r2key`, one line per upload — a shared model's photos appear twice, once per branch's own copy |

### What to check in the report before applying

1. **Where the branch comes from.** Per branch: what the direct listing found
   against what the site itself claims, and whether it agrees with the sum
   of every category. A branch showing "site says" much higher than "found"
   means pagination stopped early — a real bug, not a rounding difference.
2. **Per branch.** Rows, how many are shared with the other branch, how many
   are flagged for a missing price, and the catalog value — each broken out
   separately for Monterrey and CDMX.
3. **No branch found.** Products neither SWOOF listing ever named. Not
   imported into either store; check these by hand and re-run once the site
   itself says where they belong.
4. **What the categories are used for.** The site's current census against
   kind/cut/condition/note/exclusion. A category reading `— not used` that
   looks like it should mean something is worth a second look.
5. **Excluded — rentals.** Out of scope for this shop's inventory, listed so
   nobody wonders where they went.
6. **Flagged for review.** Rows missing a price, a code, or with no category at
   all to read kind/cut/condition off. These are *not* rejections: they are
   imported with everything the site does give and land under the **Por
   verificar** chip in Inventario with the missing fields marked. Nothing is
   guessed. A missing price is not broken data here — see above. The
   `category` reason gets special mention: it is not one of the fields the
   app's own `needs_review` recompute tracks, so check those rows by hand
   before anyone edits and saves them — see below.
7. **Rejected.** Only products the site gives no name for. If this list is long,
   something changed on the site and is worth looking at first.
8. **Duplicate codes.** The code is unique per branch, not globally — a shared
   model colliding with itself across branches is expected and not listed
   here. Only a genuine collision *within* one branch shows up, and only the
   first row for that branch is written.
9. **Codes.** How many codes came from the SKU, from the model name, and from a
   `s/n-` placeholder. The SKU count should land near the owner's own numbering
   already in the payment ledger. A large placeholder count means the site lost
   its SKUs.
10. **Promotion note.** How many rows carry "Bridal Sale -20%". It never touches
    price or condition — only a note, for the owner to act on or ignore.
11. **Images that could not be downloaded**, with the reason.

### Applying it

**Local first, always:**

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/catalog.sql
```

Images go to R2 separately, driven by the manifest:

```
while IFS=$'\t' read -r local key; do
  npx wrangler r2 object put "soy-unica-files/$key" --file "$local" \
    --content-type image/webp --local
done < docs/import/catalog-r2.tsv
```

Items come in with `INSERT OR IGNORE`: **a code that already exists, in that
branch, is left alone.** It can be re-applied without duplicating anything,
and without undoing an edit she has since made.

For the production run, see **[docs/DEPLOY.md](../DEPLOY.md) §6 and §7**, which
has the same steps with `--remote` and without `--local`.

---

## 1a · Fixing the mty-only mistake already on production

The very first version of this importer had no branch signal at all and put
every product it found into `mty` — including everything the site only ever
listed for CDMX. That already shipped. This is a **one-time cleanup**, not
part of the regular importer:

```
node scripts/import/fix-mty-cdmx-only.mjs
```

Needs `docs/import/catalog-raw.json` and `docs/import/locations-raw.json`
already fetched (§1 above — run `--fetch --fetch-locations` first if this is
the first time). Writes `docs/import/fix-mty-cdmx-only.md` (the report) and
`docs/import/fix-mty-cdmx-only.sql` (two `SELECT` previews and a guarded
`DELETE`, in that order).

**Never touches:**

- any of the 16 rows `db/migrations/0002_seed.sql` ships with, by their exact
  code, whatever the location data says about them;
- any row this importer didn't write (matched on its own `importado del
  sitio` marker in `notes`);
- any row currently held by a kiosk session, currently attached to a
  contract, or that ever appeared in `contract_items`, `session_selections`
  or `session_favorites` — a catalog mistake is not a reason to unwrite a
  real sale or a real bride's favorites.

Run the first `SELECT` in the `.sql` file to see exactly what the `DELETE`
below it would remove, and the second to see what matched the CDMX-only list
but is being left alone, and why — read both before running the `DELETE`.

### Applying it

Same rule as everything else here — **local first, always:**

```
npx wrangler d1 execute soy-unica --local --persist-to .wrangler/state \
  --file docs/import/fix-mty-cdmx-only.sql
```

The output shows both `SELECT` results before the `DELETE` runs. For the
production run, `--remote` in place of `--local --persist-to .wrangler/state`
— see **[docs/DEPLOY.md](../DEPLOY.md)** for the account this needs to be run
under.

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
1. catalog  --categories → --fetch --fetch-locations --images  → review → apply
2. pagos    --items="$ITEMS"                                   → review → apply
```

`fix-mty-cdmx-only.mjs` (§1a) is separate from this order: it's a one-time
correction for what's already live, not a step in a fresh import, and can be
run whenever `catalog-raw.json` and `locations-raw.json` are on disk.

The ledger report says, under "Fragmentos de producto", how many tied and how
many stayed as text. That pair of numbers is how you check the order was kept.

---

## Production

None of this is applied to a remote database until the reports have been
reviewed. When they have, it is the same command with `--remote` in place of
`--local --persist-to`:

```
npx wrangler d1 execute soy-unica --remote --file docs/import/catalog.sql
npx wrangler d1 execute soy-unica --remote --file docs/import/fix-mty-cdmx-only.sql
```
