CREATE TABLE IF NOT EXISTS app_foundation_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('milestone', 'm1-application-foundation');
