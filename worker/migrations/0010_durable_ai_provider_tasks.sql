ALTER TABLE ai_tasks ADD COLUMN provider_request_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN provider_submitted_at INTEGER;

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
