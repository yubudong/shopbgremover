-- ShopBGRemover production schema baseline.
-- Includes tracked migrations through 0009_referral_reward_observation.sql.
--
-- This is the canonical schema for a fresh database. Production already has
-- real data and migration records; do not reapply this file to
-- production as a migration.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  credits INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  sub_credits INTEGER NOT NULL DEFAULT 0,
  payg_credits INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  sub_reset_at INTEGER,
  plan_renews_at INTEGER,
  bg_day TEXT,
  bg_day_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS processing_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  settings_json TEXT,
  site TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  base_credits INTEGER NOT NULL DEFAULT 0,
  bonus_credits INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  paypal_capture_id TEXT,
  paypal_payer_id TEXT,
  completed_at INTEGER,
  refunded_at INTEGER,
  refund_amount TEXT,
  failure_detail TEXT,
  payment_method TEXT NOT NULL DEFAULT 'paypal',
  voucher_card_id TEXT,
  referral_processed_at INTEGER,
  is_first_qualified_purchase INTEGER NOT NULL DEFAULT 0,
  referrer_user_id_snapshot TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_capture_id
ON orders(paypal_capture_id)
WHERE paypal_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_status
ON orders(user_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_voucher_card_id
ON orders(voucher_card_id)
WHERE voucher_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referral_processing
ON orders(user_id, referral_processed_at, completed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_first_qualified_purchase
ON orders(user_id)
WHERE is_first_qualified_purchase = 1;

CREATE TABLE IF NOT EXISTS free_usage (
  ip TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  bg_day TEXT,
  bg_day_count INTEGER NOT NULL DEFAULT 0,
  bg_month TEXT,
  bg_month_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_otps (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sso_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS subscriptions (
  paypal_sub_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Kept for historical audit only. The current product does not sell or renew
-- subscriptions.

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  resource_id TEXT,
  payload_hash TEXT,
  processed_at INTEGER,
  error TEXT,
  received_at INTEGER DEFAULT (unixepoch())
);

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
  provider_request_id TEXT,
  provider_submitted_at INTEGER,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_tasks_provider_request
ON ai_tasks(provider_request_id)
WHERE provider_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guest_ai_charges (
  task_id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (task_id) REFERENCES ai_tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_ai_charges_device_created
ON guest_ai_charges(device_hash, created_at);

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
  dispute_status TEXT NOT NULL DEFAULT 'none'
    CHECK (dispute_status IN ('none', 'reversed')),
  disputed_at INTEGER,
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

CREATE TABLE IF NOT EXISTS voucher_disputes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  reversed_paid_credits INTEGER NOT NULL DEFAULT 0
    CHECK (reversed_paid_credits >= 0),
  reversed_promotion_credits INTEGER NOT NULL DEFAULT 0
    CHECK (reversed_promotion_credits >= 0),
  reversed_referral_credits INTEGER NOT NULL DEFAULT 0
    CHECK (reversed_referral_credits >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (card_id) REFERENCES voucher_cards(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_disputes_created
ON voucher_disputes(created_at);

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  owner_ip_hash TEXT,
  owner_device_hash TEXT,
  fingerprint_updated_at INTEGER,
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

CREATE TABLE IF NOT EXISTS referral_reward_reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  relationship_id TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  pending_promotion_credits INTEGER NOT NULL DEFAULT 0
    CHECK (pending_promotion_credits >= 0),
  pending_referral_credits INTEGER NOT NULL DEFAULT 0
    CHECK (pending_referral_credits >= 0),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_reasons_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (relationship_id) REFERENCES referrals(id),
  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_reviews_status_created
ON referral_reward_reviews(status, created_at);

CREATE INDEX IF NOT EXISTS idx_referral_reward_reviews_referrer_status
ON referral_reward_reviews(referrer_user_id, status, created_at);

CREATE TABLE IF NOT EXISTS referral_reward_holds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  relationship_id TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  pending_promotion_credits INTEGER NOT NULL DEFAULT 0
    CHECK (pending_promotion_credits >= 0),
  pending_referral_credits INTEGER NOT NULL DEFAULT 0
    CHECK (pending_referral_credits >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'released', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'automatic'
    CHECK (source IN ('automatic', 'risk_approved')),
  release_at INTEGER NOT NULL,
  released_at INTEGER,
  cancelled_at INTEGER,
  cancellation_reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (relationship_id) REFERENCES referrals(id),
  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_holds_due
ON referral_reward_holds(status, release_at);

CREATE INDEX IF NOT EXISTS idx_referral_reward_holds_referrer_status
ON referral_reward_holds(referrer_user_id, status, release_at);
