# D1 migration baseline

Production database: `shopbgremover-db`

The production `d1_migrations` table contains two migrations that were applied
before migration SQL was added to Git:

| ID | Name | Applied at (UTC) |
|---:|---|---|
| 1 | `0001_billing_model_upgrade.sql` | 2026-06-22 04:14:35 |
| 2 | `0002_sso_codes.sql` | 2026-06-22 04:31:34 |

Their original SQL files are not present in Git and cannot be recovered from
the D1 migration table. Do not fabricate or replay approximations against
production.

The resulting production structure was captured in `../schema.sql` on
2026-07-23. For a fresh database, initialize from that schema baseline. Future
production changes must:

1. start with migration number `0003`;
2. be tested against a copy of production data;
3. include rollback or forward-repair notes;
4. be applied with `npm run d1:migrate:remote`, which aborts unless a fresh
   export passes local restore and integrity validation;
5. be recorded in `docs/PRODUCT-SPEC-AND-PROGRESS.md`.

Use `npm run d1:backup` when a verified backup is needed without applying
migrations. The backup SQL and metadata are stored outside the repository in
`~/.shopbgremover-backups` by default.

No migration in this directory has been applied by the current Stage 0 work.
