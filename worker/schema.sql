-- ShopBGRemover production schema baseline.
-- Synced from the remote D1 sqlite_master on 2026-07-23.
--
-- This is the canonical schema for a fresh database. Production already has
-- real data and two historical migration records; do not reapply this file to
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
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT,
  received_at INTEGER DEFAULT (unixepoch())
);
