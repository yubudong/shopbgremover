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
balances. Always take a production backup and test migrations against a copy
before applying a new remote migration.

## Local checks

```bash
node --check worker/index.js
git diff --check
```

There is not yet a complete automated test suite. Payment, credit, and schema
changes must add focused tests before deployment.

## Deployment safety

- Never commit API keys, OAuth secrets, JWT secrets, or PayPal secrets.
- Configure Worker secrets interactively with `wrangler secret put`.
- Do not run the legacy `setup-paypal.sh` against production.
- Do not deploy from a dirty worktree.
- Record every completed test and deployment in
  `docs/PRODUCT-SPEC-AND-PROGRESS.md`.
