-- Privacy-minimal, first-party product analytics.
--
-- Browser events contain only allowlisted milestones and coarse attributes.
-- Image data, file names, object keys, email addresses, full referrers, and
-- raw IP addresses must never be written here. Server-authoritative LaMa,
-- background-removal, order, and voucher metrics remain in their existing
-- business tables.

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  event_name TEXT NOT NULL
    CHECK (event_name IN (
      'page_view',
      'workspace_view',
      'file_selected',
      'tool_open',
      'tool_started',
      'result_ready',
      'result_downloaded',
      'pricing_view',
      'xianyu_clicked'
    )),
  tool_id TEXT NOT NULL DEFAULT ''
    CHECK (tool_id IN (
      '',
      'workspace',
      'inpaint',
      'remove_bg',
      'compose',
      'zip',
      'pricing'
    )),
  page_group TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT 'guest'
    CHECK (actor_type IN ('guest', 'user', 'admin')),
  device_type TEXT NOT NULL DEFAULT ''
    CHECK (device_type IN ('', 'desktop', 'tablet', 'mobile')),
  language TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  file_count INTEGER CHECK (file_count BETWEEN 0 AND 50),
  size_bucket TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER CHECK (duration_ms BETWEEN 0 AND 3600000),
  status_code INTEGER CHECK (status_code BETWEEN 100 AND 599),
  error_code TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
ON analytics_events(event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tool_created
ON analytics_events(tool_id, event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session_created
ON analytics_events(session_hash, created_at);

-- Ten-minute, HMAC-derived IP buckets protect the public collection endpoint.
-- Rows are operational rate-limit state, not visitor analytics, and are
-- deleted after the bucket expires.
CREATE TABLE IF NOT EXISTS analytics_rate_limits (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_analytics_rate_limits_updated
ON analytics_rate_limits(updated_at);
