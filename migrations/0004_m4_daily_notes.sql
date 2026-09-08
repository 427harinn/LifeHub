CREATE TABLE IF NOT EXISTS daily_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_user_date ON daily_notes(user_id, date);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m4-calendar-daily', 'calendar-daily-projection-and-notes');
