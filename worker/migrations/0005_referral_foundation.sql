-- Stage 2 foundation: referral codes, immutable referral relationships, and
-- order snapshots used by later reward processing.
--
-- This migration is additive. Existing users are not assigned referrers and
-- existing orders keep their current payment and credit state.

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_status
ON referral_codes(status, created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'link'
    CHECK (source IN ('link', 'voucher')),
  status TEXT NOT NULL DEFAULT 'bound'
    CHECK (status IN ('bound', 'qualified', 'rejected', 'reversed')),
  bound_at INTEGER NOT NULL DEFAULT (unixepoch()),
  first_paid_order_id TEXT,
  first_paid_at INTEGER,
  created_ip_hash TEXT,
  created_device_hash TEXT,
  risk_status TEXT NOT NULL DEFAULT 'normal'
    CHECK (risk_status IN ('normal', 'review', 'rejected')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (referrer_user_id <> referred_user_id),
  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id),
  FOREIGN KEY (referral_code) REFERENCES referral_codes(code),
  FOREIGN KEY (first_paid_order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
ON referrals(referrer_user_id, status, created_at);

ALTER TABLE orders
ADD COLUMN referral_processed_at INTEGER;

ALTER TABLE orders
ADD COLUMN is_first_qualified_purchase INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN referrer_user_id_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_referral_processing
ON orders(user_id, referral_processed_at, completed_at);
