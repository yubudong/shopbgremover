-- Add an append-only, administrator-controlled reversal record for redeemed
-- vouchers. The original voucher lifecycle status remains "redeemed"; the
-- separate dispute status records the later Xianyu dispute outcome.

ALTER TABLE voucher_cards
ADD COLUMN dispute_status TEXT NOT NULL DEFAULT 'none'
  CHECK (dispute_status IN ('none', 'reversed'));

ALTER TABLE voucher_cards
ADD COLUMN disputed_at INTEGER;

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

