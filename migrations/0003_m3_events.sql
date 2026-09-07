CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('home', 'work')),
  title TEXT NOT NULL,
  place TEXT,
  memo TEXT,
  timing_type TEXT NOT NULL CHECK (timing_type IN ('scheduled')),
  all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  start_date TEXT NOT NULL,
  start_time TEXT,
  end_date TEXT NOT NULL,
  end_time TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_user_dates ON events(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_user_updated ON events(user_id, updated_at DESC);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m3-single-scheduled-event', 'event-crud-scheduled-only');
