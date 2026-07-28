-- Private LaMa task chain. This migration is additive and does not change
-- fal.ai background-removal billing tables.

CREATE TABLE IF NOT EXISTS inpaint_batches (
  id TEXT PRIMARY KEY,
  client_batch_id TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  user_id TEXT,
  guest_device_hash TEXT,
  guest_ip_hash TEXT,
  product_day TEXT NOT NULL,
  task_count INTEGER NOT NULL CHECK (task_count BETWEEN 1 AND 50),
  uploaded_count INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_count BETWEEN 0 AND 50),
  succeeded_count INTEGER NOT NULL DEFAULT 0 CHECK (succeeded_count BETWEEN 0 AND 50),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count BETWEEN 0 AND 50),
  mask_spec_json TEXT NOT NULL,
  mask_spec_hash TEXT NOT NULL,
  mode_at_creation TEXT NOT NULL
    CHECK (mode_at_creation IN ('admin_free', 'public_free')),
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN (
      'creating', 'queued', 'processing', 'succeeded',
      'partial', 'failed', 'cancelled'
    )),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  UNIQUE (owner_key, client_batch_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inpaint_batches_one_active_owner
ON inpaint_batches(owner_key)
WHERE status IN ('creating', 'queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_inpaint_batches_guest_day
ON inpaint_batches(guest_device_hash, product_day, created_at);

CREATE INDEX IF NOT EXISTS idx_inpaint_batches_status_updated
ON inpaint_batches(status, updated_at);

CREATE TABLE IF NOT EXISTS inpaint_tasks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  product_day TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
  status TEXT NOT NULL DEFAULT 'awaiting_upload'
    CHECK (status IN (
      'awaiting_upload', 'queued', 'processing',
      'succeeded', 'failed', 'cancelled'
    )),
  image_key TEXT,
  mask_key TEXT,
  result_key TEXT,
  image_sha256 TEXT,
  mask_sha256 TEXT,
  image_mime TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_code TEXT,
  error_detail TEXT,
  lease_expires_at INTEGER,
  result_expires_at INTEGER,
  result_acknowledged_at INTEGER,
  result_expired_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  UNIQUE (batch_id, position),
  FOREIGN KEY (batch_id) REFERENCES inpaint_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inpaint_tasks_owner_created
ON inpaint_tasks(owner_key, created_at);

CREATE INDEX IF NOT EXISTS idx_inpaint_tasks_owner_day
ON inpaint_tasks(owner_key, product_day, status);

CREATE INDEX IF NOT EXISTS idx_inpaint_tasks_queue
ON inpaint_tasks(status, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_inpaint_tasks_result_expiry
ON inpaint_tasks(result_expires_at)
WHERE result_key IS NOT NULL;
