# ShopBGRemover

AI product-image background removal and batch export for e-commerce sellers.

## Product source of truth

Read `docs/PRODUCT-SPEC-AND-PROGRESS.md` before making product, billing,
database, or deployment changes. It records the approved requirements and the
actual implementation/deployment status.

## Canonical production architecture

- Frontend: static HTML pages deployed to Cloudflare Pages. The English source
  pages live at the repository root; localized pages live in `de/`, `es/`,
  `fr/`, and `pt-br/`.
- API: `worker/index.js`, deployed as the `shopbgremover-api` Cloudflare Worker.
- Database: Cloudflare D1 `shopbgremover-db`.
- AI background removal: fal.ai BiRefNet.
- Authentication: Google OAuth and email OTP through the Worker.
- Payment: PayPal order capture. The current subscription-labelled UI is legacy
  behavior and is scheduled to be replaced by one-time credit packs.

The `app/` Next.js routes, `functions/` Pages Functions, root `schema.sql`, and
`public/` copies are legacy implementations or build-era compatibility files.
Do not change or deploy them as the production API without an explicit
migration plan.

## Database

- Canonical current schema: `worker/schema.sql`
- Production migration record: `worker/migrations/README.md`
- Wrangler migration directory: `worker/migrations/`

The production database already contains real users, orders, and credit
balances. Remote migrations must go through the guarded command below:

```bash
npm run d1:migrate:remote
```

That command first performs a full production export, restores it into a
temporary SQLite database, checks integrity, records the current D1 Time Travel
bookmark and SHA-256, and only then lists and applies remote migrations. It
aborts before migration if any backup or restore validation step fails.

Backups default to `~/.shopbgremover-backups` with directory mode `700` and file
mode `600`. Override the destination with `SHOPBGREMOVER_BACKUP_DIR` when
needed. To create and verify a backup without applying migrations:

```bash
npm run d1:backup
```

Do not run `wrangler d1 migrations apply --remote` directly.

## Local checks

```bash
npm install
npm test
node --check worker/index.js
git diff --check
```

The Stage 0 suite covers backup gating, production schema, current PayPal order
creation/capture behavior, authenticated and anonymous credit use, and the rule
that fal.ai failures do not deduct credit. It runs on every push and pull
request through `.github/workflows/test.yml`.

The known concurrent PayPal callback risk is intentionally not fixed by this
baseline; Stage 1 must add atomic order claiming and a concurrent regression
test before changing billing behavior.

## Deployment safety

- Never commit API keys, OAuth secrets, JWT secrets, or PayPal secrets.
- Configure Worker secrets interactively with `wrangler secret put`.
- Do not run the legacy `setup-paypal.sh` against production.
- Do not deploy from a dirty worktree.
- Record every completed test and deployment in
  `docs/PRODUCT-SPEC-AND-PROGRESS.md`.
