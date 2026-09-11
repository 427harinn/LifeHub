CREATE TABLE IF NOT EXISTS archive_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  retention_boundary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed')),
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_batches_user_created
  ON archive_batches(user_id, created_at DESC);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m12-local-archive', 'indexeddb-first-archive-confirmation');
