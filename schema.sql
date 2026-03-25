-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- User credits table
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  credits INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Processing history table
CREATE TABLE IF NOT EXISTS processing_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  download_url TEXT,
  settings_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
