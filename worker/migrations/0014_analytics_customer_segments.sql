-- Privacy-preserving customer segmentation for first-party analytics.
--
-- Analytics events continue to avoid email addresses and raw user IDs. Signed-in
-- events carry only a keyed, irreversible account hash. The matching hash is
-- stored on the existing account row so the protected admin endpoint can join
-- active-account summaries without exposing identifiers in the event table.
--
-- Existing events are classified from their coarse actor_type. Historical
-- signed-in events cannot be separated into registered/recharged because they
-- predate the account hash, so they remain "registered". Admin events are
-- explicitly marked "internal" and are excluded from customer reports.

ALTER TABLE users
ADD COLUMN analytics_hash TEXT;

ALTER TABLE analytics_events
ADD COLUMN account_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE analytics_events
ADD COLUMN audience_type TEXT NOT NULL DEFAULT 'anonymous'
  CHECK (audience_type IN ('anonymous', 'registered', 'recharged', 'internal'));

UPDATE analytics_events
SET audience_type = CASE actor_type
  WHEN 'admin' THEN 'internal'
  WHEN 'user' THEN 'registered'
  ELSE 'anonymous'
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_analytics_hash
ON users(analytics_hash)
WHERE analytics_hash IS NOT NULL AND analytics_hash != '';

CREATE INDEX IF NOT EXISTS idx_analytics_events_audience_created
ON analytics_events(audience_type, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_account_created
ON analytics_events(account_hash, created_at)
WHERE account_hash != '';

-- Forward repair: this migration is additive. If application is interrupted,
-- Wrangler records it only after all statements succeed; rerun the protected
-- migration command. The added columns are intentionally retained on rollback
-- because older Worker versions ignore them and their defaults are safe.
