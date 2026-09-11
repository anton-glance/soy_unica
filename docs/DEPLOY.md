# Deploying Soy Única to Cloudflare

Everything here is run from a clone of this repository, on a machine logged into
the Cloudflare account `b41f43e44f162196d7b514aa31455fd4`. The commands are
copy-paste ready in that order. Nothing in this file touches the `pagos.xlsx`
ledger: this deploy is **catalog only**.

Wrangler is pinned in `package.json` at `3.x`, and every command below is
written for it. `npx wrangler` uses that pinned copy, so run it from the repo
root and ignore the "update available 4.x" banner. If you do upgrade to 4.x,
the one thing that changes here is R2: `r2 object put` and `get` default to
remote on 3.x and want an explicit `--remote` on 4.x.

---

## First five minutes

Tick these in order. Anything unticked means the tablet will not work.

- [ ] **1.** R2 is enabled on the Cloudflare account (dashboard, needs a payment
      method on file even on the free tier) — [§1](#1-dashboard-first-enable-r2)
- [ ] **2.** `wrangler login` done and the account confirmed — [§2](#2-log-wrangler-in)
- [ ] **3.** D1 database `soy-unica` exists and its id matches `wrangler.toml` — [§3](#3-check-the-database-and-the-bucket)
- [ ] **4.** R2 bucket `soy-unica-files` created — [§3](#3-check-the-database-and-the-bucket)
- [ ] **5.** `JWT_SECRET` secret set, long and random, **not** the local one — [§4](#4-the-session-secret)
- [ ] **6.** Migrations applied `--remote` (this also seeds the demo PINs) — [§5](#5-migrations)
- [ ] **7.** Catalog SQL reviewed, then applied `--remote` — [§6](#6-the-catalog)
- [ ] **8.** Catalog images uploaded to R2 (**no** `--local`) — [§7](#7-the-catalog-images)
- [ ] **9.** `npm run build && npx wrangler deploy` — [§8](#8-build-and-deploy)
- [ ] **10.** URL open on the tablet, and the four seeded PINs changed **before
      anyone else finds it** — [§10](#10-before-this-is-reachable-on-the-internet)

The order matters in one place only: the Worker will boot without R2, the
database or the secret, and then fail on the first login instead of at deploy
time. Steps 1–6 before step 9.

---

## Is it safe to run twice?

| step | repeatable? | what happens on a second run |
|---|---|---|
| `wrangler login` | yes | re-opens the browser, same token |
| `d1 create` / `r2 bucket create` | **no** | errors that the name is taken — harmless, but do not "fix" it by creating a second one under another name |
| `secret put JWT_SECRET` | **no, not safely** | it succeeds, and every tablet is logged out at once because the cookies signed with the old secret stop verifying. Only re-run it deliberately |
| `d1 migrations apply --remote` | yes | already-applied migrations are skipped; wrangler tracks them in `d1_migrations` |
| `d1 execute --file docs/import/catalog.sql --remote` | yes | every statement is `INSERT OR IGNORE`, so rows already carrying that code in that branch are left alone, edits she has made are not overwritten, and nothing is duplicated |
| `r2 object put` | yes | overwrites the object at the same key with identical bytes |
| `npm run build` | yes | rebuilds `dist/` from scratch |
| `wrangler deploy` | yes | publishes a new version; the previous one stays in the dashboard to roll back to |

The two that are not repeatable are both "create once" steps. Nothing in this
file deletes anything.

---

## 1. Dashboard first: enable R2

R2 cannot be enabled from the CLI. `wrangler r2 bucket create` against an
account that has never enabled R2 fails with an authorization error that does
not say why.

1. <https://dash.cloudflare.com> → the account → **R2 Object Storage**.
2. **Enable R2**. It asks for a payment method even though the free tier covers
   this shop by a wide margin — 10 GB of storage, no egress charge. The whole
   catalog re-encoded is well under 1 GB.
3. Wait for the bucket list page to load. That is the confirmation.

While you are in the dashboard, note the account id under **Workers & Pages →
Overview** in the right-hand column and check it against `wrangler.toml`:

```
account_id = "b41f43e44f162196d7b514aa31455fd4"
```

## 2. Log wrangler in

```bash
npx wrangler login
npx wrangler whoami
```

`whoami` must print the same account id as above. If the machine has several
Cloudflare accounts, `account_id` in `wrangler.toml` is what decides, so the
only thing that matters is that the logged-in user can reach that account.

## 3. Check the database and the bucket

The database already exists. Confirm the id matches `wrangler.toml`:

```bash
npx wrangler d1 list
```

`soy-unica` must show `3d740430-898e-4705-90b7-6718aadf7ae5`. If it does not,
put whatever it does show into `wrangler.toml` — do **not** run `d1 create`
again, that would make a second, empty database with the same name.

The bucket does not exist yet:

```bash
npx wrangler r2 bucket create soy-unica-files
npx wrangler r2 bucket list
```

## 4. The session secret

This signs the login cookie. Generate a fresh one; never reuse `.dev.vars`.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npx wrangler secret put JWT_SECRET      # paste it at the prompt
npx wrangler secret list
```

`secret list` prints names only, never values. Keep the secret in a password
manager: re-running `secret put` with a different value signs everyone out.

## 5. Migrations

```bash
npx wrangler d1 migrations apply soy-unica --remote
```

It applies `db/migrations/0001` through `0008` in order and records them in a
`d1_migrations` table, so re-running it is a no-op. It asks for confirmation and
`migrations apply` has no `-y` flag; prefix it with `CI=1` if you are scripting
it, which makes wrangler take the non-interactive path and answer yes.

Two things this step does that are worth knowing:

- `0002_seed.sql` seeds the two branches, the four users with **demo PINs**, the
  payment plans, the surcharges taken from the real contract, and roughly two
  dozen demo dresses. See [§10](#10-before-this-is-reachable-on-the-internet).
- `0008_needs_review.sql` adds the `needs_review` flag the catalog import uses.

Check it landed:

```bash
npx wrangler d1 execute soy-unica --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

## 6. The catalog

The catalog SQL is generated on your machine and is **not** in the repository —
`docs/import/catalog.sql` and `catalog.md` are gitignored, precisely so that
nobody can apply a file built from test fixtures to the real database.

```bash
# Download the catalog (needs outbound access to soyunicanovias.com).
node scripts/import/catalog.mjs --fetch

# What categories does the site actually use, and which branch does each map to?
node scripts/import/catalog.mjs --categories
```

**Read that census before going further.** The branch split is driven by
`STORE_RULES` in `scripts/import/map-product.mjs`, written without ever having
seen the site. Any category that should be CDMX and prints `— (falls back to
mty)` means the pattern needs a line added, and the whole CDMX catalog would
otherwise land in Monterrey. Edit `STORE_RULES`, re-run `--categories`, repeat
until every row reads the branch you expect.

```bash
# Report + SQL + images.
node scripts/import/catalog.mjs --images
```

Now read `docs/import/catalog.md` end to end — particularly **By branch**,
**The same model in both branches** and **Flagged for review**. It is the last
point at which a mistake is free. Then:

```bash
npx wrangler d1 execute soy-unica --remote --file docs/import/catalog.sql
```

`d1 execute` prompts too; add `-y` to skip it once you have read the report.

Count what arrived:

```bash
npx wrangler d1 execute soy-unica --remote \
  --command "SELECT store_id, COUNT(*) AS items, SUM(needs_review) AS por_verificar FROM items GROUP BY store_id"
```

Those numbers must match the **By branch** table in the report. If Monterrey has
everything and CDMX has nothing, the category patterns did not match — fix
`STORE_RULES`, re-run the generator, and apply again. The re-apply is safe:
`INSERT OR IGNORE` will not duplicate the rows that already landed, but note it
also will **not** move a row that went to the wrong branch. Delete those by
hand first if it comes to that.

## 7. The catalog images

`--images` wrote the re-encoded WebP files to `docs/import/catalog-images/` and a
manifest, `docs/import/catalog-r2.tsv`, with one `localpath<TAB>r2key` line per
upload. A dress that appears in both catalogs is uploaded twice, once per branch,
because a `files` row belongs to one branch.

There is **no `--local` flag anywhere in this section.** With `--local`, wrangler
writes to the miniflare directory on your laptop, reports success, and the kiosk
on the tablet shows no photos at all.

```bash
while IFS=$'\t' read -r local key; do
  npx wrangler r2 object put "soy-unica-files/$key" --file "$local" --content-type image/webp
done < docs/import/catalog-r2.tsv
```

That is one CLI invocation per image and it is slow — a few hundred images take
several minutes. Let it finish. Then spot-check:

```bash
wc -l docs/import/catalog-r2.tsv
npx wrangler r2 object get "soy-unica-files/mty/item_photo/mty-101-0.webp" --file /tmp/check.webp
```

(Substitute the first key from your own manifest.) The photos are served through
`/api/files/:id`, which requires a login and checks the branch, so there is no
public URL to test against — the real check is the kiosk in the smoke test.

## 8. Build and deploy

```bash
npm ci
npm run build          # tsc -b && vite build → dist/
npx wrangler deploy
```

`wrangler deploy` uploads the Worker and everything in `dist/`. Static assets
are served by the Worker in production from the `[assets]` block in
`wrangler.toml` — this is not a vite-dev-only arrangement. Verified by running
`wrangler dev` against a real `dist/`: `/` and `/inventario` return the built
`index.html`, `/favicon.ico` returns the icon, `/print/:folio/contrato` falls
through to the SPA, and `/api/*` reaches the Worker rather than being swallowed
by the asset router.

If `wrangler deploy` complains that `dist` is missing, `npm run build` failed —
scroll up for the TypeScript error rather than creating the directory.

## 9. Finding the URL

`wrangler deploy` prints it on the last line:

```
Uploaded soy-unica (x.xx sec)
Published soy-unica (x.xx sec)
  https://soy-unica.<your-subdomain>.workers.dev
```

If you lose it: **Cloudflare dashboard → Workers & Pages → soy-unica**, the URL
is under the worker name. Or:

```bash
npx wrangler deployments list
```

The subdomain is per account and never changes, so once you have the URL it is
the URL. Check it is alive before walking to the tablet:

```bash
curl https://soy-unica.<your-subdomain>.workers.dev/api/health   # {"ok":true}
```

Bookmark it on the tablet's home screen. There is no custom domain yet; that is
a dashboard change (**Workers & Pages → soy-unica → Settings → Domains**) and
needs the DNS for whatever hostname you want.

## 10. Before this is reachable on the internet

Four things, and the first two are not optional.

**The seeded PINs are in this public repository.** `db/migrations/0002_seed.sql`
creates four users: owner and seller in each branch, with PINs `4242` (owner,
both branches), `1111` (Monterrey seller) and `2222` (CDMX seller). The hashes
are committed, which is fine, but the PINs are also written in a comment on the
line above them. **Change all four in Ajustes → NIP the moment you are logged
in, before the URL is shared with anybody.** Until you do, anyone who finds the
URL and has read the repository is the owner of both branches.

**A `*.workers.dev` URL is public and unauthenticated at the edge.** There is no
Cloudflare Access in front of it. The only door is the PIN screen, and:

- a PIN is four to six digits, so a four-digit one is 10,000 guesses;
- `worker/lib/auth.ts` locks a (branch, role) pair for 60 seconds after 5 failed
  attempts in a 10-minute window — that is about 300 guesses an hour, so an
  unattended four-digit PIN falls in a day and a half of steady grinding;
- that lockout is per branch and role, not per attacker, so someone hammering
  `mty/seller` also locks out the real seller for a minute at a time.

Use six digits, not four, and avoid `123456` and the shop's phone number. If the
URL ever gets out, the cheap fix is Cloudflare Access (dashboard, free for up to
50 users) in front of the worker — an email one-time-code on top of the PIN.

**Everything is one database with no staging.** `--remote` is production. There
is no undo on `d1 execute`. Take a backup before anything that is not in this
file:

```bash
npx wrangler d1 export soy-unica --remote --output backup-$(date +%F).sql
```

**The ledger import is deliberately not part of this deploy.** The `pagos.xlsx`
importer is not idempotent — re-running it would double every payment — and five
rejected rows still need the owner's handwriting. Do not apply
`docs/import/pagos.sql` to the remote database. See `docs/import/README.md`.

---

## Smoke test on the tablet

Run this against the deployed URL, on the actual tablet, in this order. Each
step says what "passed" looks like. If one fails, stop — the later steps depend
on it.

**1. Entry: branch, role, PIN**
Open the URL. The branch screen lists Monterrey and CDMX. Pick Monterrey →
Vendedora → PIN pad. Type a wrong PIN: it says `NIP incorrecto.` and does not
say whether it was the branch, the role or the PIN that was wrong. Type the real
one: the four tiles appear. The PIN pad is centred on the screen, not tucked
under the bar.

**2. Kiosk session with real dresses and photos**
Tiles → start a session. The bride's catalog fills with dresses from the import,
**with their photos**, not the placeholder gown drawing. If every card is a
drawing, §7 went to the wrong place — most likely `--local` crept in. Favourite
two or three. Confirm the bride cannot reach a price beyond the catalog, a
contract, or any contract action from this screen.

**3. The seller handover**
Hand the tablet over: the seller's PIN is asked for and is verified on the
server, not just in the screen. The favourites she marked are listed for review.

**4. Selection, and the "Por verificar" guard**
Pick a dress and print a contract — see step 5. Then, in a second session, try
to pick one of the imported dresses that has no price. It must be refused, in
Spanish, telling you to set the price in Inventario first. That refusal comes
from the server: it is the thing standing between a zero price and a contract
printed in zeros.

**5. A contract, printed and photographed**
Complete a selection → bride's data → measurement sheet printed → signed sheet
photographed → terms → payment plan → contract printed. Check on the printed
sheet: the folio appears, the payment schedule has real dates and amounts (not a
blank table), and the dates read as Mexican dates. Photograph the signed
contract into the system.

**6. A payment with a receipt photo**
Register the deposit. Try it once **without** attaching a photo: it must be
refused. Attach the photo and it goes through. The balance drops by the amount
paid.

**7. An expense**
Gastos → new expense with a photo of the receipt. It appears in the list with
the right category and the amount in pesos.

**8. The weekly report**
Reporte. It opens without error and shows this week's sales, payments and
expenses. Sellers must not see costs anywhere on it.

**9. The "Por verificar" filter**
Inventario. A **Por verificar (N)** chip appears with N matching the report's
flagged count. Tap it: only flagged rows, the ones with no price first, with the
missing fields marked `falta`. Open one, fill in the price, save — the chip's
count drops by one and the row leaves the filter. That is the loop she will
actually live in for the first week.

**10. The abandoned-session sweep**
Not testable in five minutes by design: the cron in `wrangler.toml` runs hourly
and releases holds from sessions idle longer than the branch's timeout (four
hours by default). Confirm it is scheduled: **dashboard → soy-unica → Settings →
Trigger Events** must list `0 * * * *`. The first real proof is the morning
after the first tablet is left switched off overnight.
