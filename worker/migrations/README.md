# D1 migration baseline

Production database: `shopbgremover-db`

The production `d1_migrations` table contains two historical migrations that
were applied before migration SQL was added to Git:

| ID | Name | Applied at (UTC) |
|---:|---|---|
| 1 | `0001_billing_model_upgrade.sql` | 2026-06-22 04:14:35 |
| 2 | `0002_sso_codes.sql` | 2026-06-22 04:31:34 |

Their original SQL files are not present in Git and cannot be recovered from
the D1 migration table. Do not fabricate or replay approximations against
production.

Tracked migrations applied afterward:

| ID | Name | Applied |
|---:|---|---|
| 3 | `0003_unified_credit_billing.sql` | 2026-07-23 |
| 4 | `0004_voucher_cards.sql` | 2026-07-24 |
| 5 | `0005_referral_foundation.sql` | 2026-07-24 |
| 6 | `0006_referral_reward_idempotency.sql` | 2026-07-24 |
| 7 | `0007_voucher_dispute_reversal.sql` | 2026-07-24 |
| 8 | `0008_referral_risk_review.sql` | 2026-07-24 |
| 9 | `0009_referral_reward_observation.sql` | 2026-07-24 |

The resulting production structure is maintained in `../schema.sql`. For a
fresh database, initialize from that schema baseline. Future production changes
must:

1. start with migration number `0010`;
2. be tested against a copy of production data;
3. include rollback or forward-repair notes;
4. be applied with `npm run d1:migrate:remote`, which aborts unless a fresh
   export passes local restore and integrity validation;
5. be recorded in `docs/PRODUCT-SPEC-AND-PROGRESS.md`.

Use `npm run d1:backup` when a verified backup is needed without applying
migrations. The backup SQL and metadata are stored outside the repository in
`~/.shopbgremover-backups` by default.
