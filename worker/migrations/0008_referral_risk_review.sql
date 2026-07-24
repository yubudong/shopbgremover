ALTER TABLE referral_codes ADD COLUMN owner_ip_hash TEXT;
ALTER TABLE referral_codes ADD COLUMN owner_device_hash TEXT;
ALTER TABLE referral_codes ADD COLUMN fingerprint_updated_at INTEGER;

CREATE TABLE referral_reward_reviews (
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

CREATE INDEX idx_referral_reward_reviews_status_created
ON referral_reward_reviews(status, created_at);

CREATE INDEX idx_referral_reward_reviews_referrer_status
ON referral_reward_reviews(referrer_user_id, status, created_at);

-- Forward repair: the migration is additive. If deployment is interrupted,
-- rerun through Wrangler migrations; it records the file only after success.
-- Rollback is intentionally not automated because dropping columns in SQLite
-- would require rebuilding referral_codes. Old Workers ignore the new fields.
