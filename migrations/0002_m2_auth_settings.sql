CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS lifehub_user_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  migration_state TEXT NOT NULL DEFAULT 'active' CHECK (migration_state IN ('active', 'migration_locked')),
  migration_started_at TEXT,
  migration_backup_checksum TEXT,
  migration_backup_created_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  week_starts_on INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  morning_summary_enabled INTEGER NOT NULL DEFAULT 1 CHECK (morning_summary_enabled IN (0, 1)),
  morning_summary_time TEXT NOT NULL DEFAULT '09:00',
  evening_summary_enabled INTEGER NOT NULL DEFAULT 1 CHECK (evening_summary_enabled IN (0, 1)),
  evening_summary_time TEXT NOT NULL DEFAULT '21:00',
  period_default_deadline_time TEXT NOT NULL DEFAULT '21:00',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m2-auth-settings-navigation', 'auth/settings/navigation-shell');
