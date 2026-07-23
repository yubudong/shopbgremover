-- Stage 1: one-time credit packs, auditable credit buckets, task idempotency,
-- and payment/refund metadata.
--
-- Existing aggregate balances have mixed historical origins. Preserve them as
-- permanent "legacy" grants instead of guessing whether each credit was free,
-- subscription, or pay-as-you-go.

ALTER TABLE orders ADD COLUMN base_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN bonus_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE orders ADD COLUMN paypal_capture_id TEXT;
ALTER TABLE orders ADD COLUMN paypal_payer_id TEXT;
ALTER TABLE orders ADD COLUMN completed_at INTEGER;
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE orders ADD COLUMN refund_amount TEXT;
ALTER TABLE orders ADD COLUMN failure_detail TEXT;

UPDATE orders
SET base_credits = credits
WHERE base_credits = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_capture_id
ON orders(paypal_capture_id)
WHERE paypal_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_status
ON orders(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS credit_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credit_type TEXT NOT NULL
    CHECK (credit_type IN ('paid', 'free', 'referral', 'promotion', 'legacy')),
  granted_credits INTEGER NOT NULL CHECK (granted_credits >= 0),
  remaining_credits INTEGER NOT NULL
    CHECK (remaining_credits >= 0 AND remaining_credits <= granted_credits),
  order_id TEXT,
  related_user_id TEXT,
  expires_at INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (related_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_grants_spend
ON credit_grants(user_id, remaining_credits, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_grants_order
ON credit_grants(order_id);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta != 0),
  balance_type TEXT NOT NULL
    CHECK (balance_type IN ('paid', 'free', 'referral', 'promotion', 'legacy')),
  reason TEXT NOT NULL,
  grant_id TEXT,
  order_id TEXT,
  task_id TEXT,
  related_user_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reversal_of TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (grant_id) REFERENCES credit_grants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (related_user_id) REFERENCES users(id),
  FOREIGN KEY (reversal_of) REFERENCES credit_ledger(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
ON credit_ledger(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_order
ON credit_ledger(order_id);

CREATE TABLE IF NOT EXISTS ai_tasks (
  task_id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  user_id TEXT,
  guest_device_hash TEXT,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  result_url TEXT,
  charge_ledger_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (charge_ledger_id) REFERENCES credit_ledger(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_tasks_owner_created
ON ai_tasks(owner_key, created_at);

CREATE TABLE IF NOT EXISTS guest_usage (
  device_hash TEXT PRIMARY KEY,
  last_ip_hash TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 3),
  linked_user_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (linked_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS guest_ip_usage (
  ip_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 3),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_free_entitlements (
  user_id TEXT PRIMARY KEY,
  lifetime_limit INTEGER NOT NULL DEFAULT 10 CHECK (lifetime_limit = 10),
  guest_uses_applied INTEGER NOT NULL DEFAULT 0
    CHECK (guest_uses_applied BETWEEN 0 AND 3),
  issued_credits INTEGER NOT NULL DEFAULT 0
    CHECK (issued_credits BETWEEN 0 AND 10),
  issued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE webhook_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received';
ALTER TABLE webhook_events ADD COLUMN resource_id TEXT;
ALTER TABLE webhook_events ADD COLUMN payload_hash TEXT;
ALTER TABLE webhook_events ADD COLUMN processed_at INTEGER;
ALTER TABLE webhook_events ADD COLUMN error TEXT;

INSERT OR IGNORE INTO credit_grants (
  id,
  user_id,
  credit_type,
  granted_credits,
  remaining_credits,
  idempotency_key
)
SELECT
  'legacy-opening:' || user_id,
  user_id,
  'legacy',
  credits,
  credits,
  'legacy-opening:' || user_id
FROM user_credits
WHERE credits > 0;

-- Existing accounts already received credits under the legacy model. Mark the
-- lifetime registration entitlement as handled so deployment cannot grant a
-- second signup bonus. New accounts are issued 10 minus their guest usage by
-- the Worker.
INSERT OR IGNORE INTO user_free_entitlements (
  user_id,
  lifetime_limit,
  guest_uses_applied,
  issued_credits
)
SELECT user_id, 10, 0, 0
FROM user_credits;

INSERT OR IGNORE INTO credit_ledger (
  id,
  user_id,
  delta,
  balance_type,
  reason,
  grant_id,
  idempotency_key
)
SELECT
  'legacy-opening:' || user_id,
  user_id,
  credits,
  'legacy',
  'legacy_opening_balance',
  'legacy-opening:' || user_id,
  'legacy-opening:' || user_id
FROM user_credits
WHERE credits > 0;
