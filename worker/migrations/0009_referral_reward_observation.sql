CREATE TABLE referral_reward_holds (
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

CREATE INDEX idx_referral_reward_holds_due
ON referral_reward_holds(status, release_at);

CREATE INDEX idx_referral_reward_holds_referrer_status
ON referral_reward_holds(referrer_user_id, status, release_at);

-- Additive forward repair: old Workers ignore this table. Wrangler records the
-- migration only after all statements succeed, so interrupted applications can
-- be safely retried through the protected migration wrapper.
