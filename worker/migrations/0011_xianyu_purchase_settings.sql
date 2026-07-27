-- Administrator-managed public purchase links for the Chinese Xianyu voucher
-- flow. Values are not secrets; every change is recorded in an append-only
-- audit row before the current setting is replaced.

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS site_setting_audit (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL,
  previous_value_json TEXT,
  new_value_json TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_site_setting_audit_key_created
ON site_setting_audit(setting_key, created_at);
