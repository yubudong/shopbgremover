# 0001 billing model upgrade — historical record

- Production migration name: `0001_billing_model_upgrade.sql`
- Applied at: 2026-06-22 04:14:35 UTC
- Original SQL status: unavailable in Git
- Action in Stage 0: recorded only; not reapplied

The resulting production schema includes subscription/pay-as-you-go credit
columns on `user_credits`, extended free-usage counters, a `subscriptions`
table, and a `webhook_events` table. See `../schema.sql` for the exact resulting
table definitions observed on 2026-07-23.
