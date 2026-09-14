CREATE TABLE IF NOT EXISTS user_migrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('locked', 'awaiting_restore', 'restoring', 'restore_verified', 'completed', 'error_recoverable')),
  backup_checksum TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  restored_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  cleanup_completed INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_completed IN (0, 1)),
  UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_migrations_user_started
  ON user_migrations(user_id, started_at DESC);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m13-backup-device-migration', 'versioned-json-export-restore');
