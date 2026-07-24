-- Stage 3 MVP foundation: Xianyu voucher batches, one-time cards, redemption
-- rate limits, and administrator audit events.
--
-- Forward-repair notes:
-- - This migration is additive and does not delete or rewrite existing orders.
-- - Existing orders are classified as PayPal orders by the new default.
-- - If deployment must be rolled back, the previous Worker ignores these
--   columns and tables. Keep the data for audit instead of dropping it.

ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'paypal';
ALTER TABLE orders ADD COLUMN voucher_card_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_voucher_card_id
ON orders(voucher_card_id)
WHERE voucher_card_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS voucher_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_credits INTEGER NOT NULL CHECK (base_credits IN (100, 300, 1000)),
  face_value_minor INTEGER NOT NULL CHECK (face_value_minor > 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  sales_channel TEXT NOT NULL DEFAULT 'xianyu',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'void')),
  expires_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS voucher_cards (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  code_prefix TEXT NOT NULL,
  code_last4 TEXT NOT NULL,
  base_credits INTEGER NOT NULL CHECK (base_credits IN (100, 300, 1000)),
  face_value_minor INTEGER NOT NULL CHECK (face_value_minor > 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'reserved', 'delivered', 'redeemed', 'void', 'expired')),
  sales_channel TEXT NOT NULL DEFAULT 'xianyu',
  sales_order_ref TEXT,
  sales_note TEXT,
  reserved_at INTEGER,
  delivered_at INTEGER,
  redeemed_by TEXT,
  redeemed_at INTEGER,
  redeem_order_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (batch_id) REFERENCES voucher_batches(id),
  FOREIGN KEY (redeemed_by) REFERENCES users(id),
  FOREIGN KEY (redeem_order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_cards_batch
ON voucher_cards(batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_voucher_cards_status_created
ON voucher_cards(status, created_at);

CREATE INDEX IF NOT EXISTS idx_voucher_cards_sales_order
ON voucher_cards(sales_channel, sales_order_ref);

CREATE INDEX IF NOT EXISTS idx_voucher_cards_lookup
ON voucher_cards(code_prefix, code_last4);

CREATE TABLE IF NOT EXISTS voucher_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  code_fingerprint TEXT,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_attempts_user_created
ON voucher_attempts(user_id, success, created_at);

CREATE INDEX IF NOT EXISTS idx_voucher_attempts_ip_created
ON voucher_attempts(ip_hash, success, created_at);

CREATE TABLE IF NOT EXISTS voucher_admin_audit (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  batch_id TEXT,
  card_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (admin_user_id) REFERENCES users(id),
  FOREIGN KEY (batch_id) REFERENCES voucher_batches(id),
  FOREIGN KEY (card_id) REFERENCES voucher_cards(id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_admin_audit_created
ON voucher_admin_audit(created_at);

CREATE INDEX IF NOT EXISTS idx_voucher_admin_audit_card
ON voucher_admin_audit(card_id, created_at);
