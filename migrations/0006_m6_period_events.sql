PRAGMA foreign_keys = OFF;

CREATE TABLE events_m6 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('home', 'work')),
  title TEXT NOT NULL,
  place TEXT,
  memo TEXT,
  timing_type TEXT NOT NULL CHECK (timing_type IN ('scheduled', 'period')),
  all_day INTEGER CHECK (all_day IS NULL OR all_day IN (0, 1)),
  start_date TEXT,
  start_time TEXT,
  end_date TEXT,
  end_time TEXT,
  period_window_type TEXT CHECK (period_window_type IS NULL OR period_window_type IN ('this_week', 'this_month', 'custom_range')),
  period_anchor_date TEXT,
  period_start_date TEXT,
  period_end_date TEXT,
  deadline_time TEXT,
  recurrence_rule_id TEXT REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO events_m6 (id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at)
SELECT id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, NULL, NULL, NULL, NULL, NULL, recurrence_rule_id, active, deleted_at, created_at, updated_at
FROM events;

DROP TABLE events;
ALTER TABLE events_m6 RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_user_dates ON events(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_user_updated ON events(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_recurrence ON events(user_id, recurrence_rule_id);
CREATE INDEX IF NOT EXISTS idx_events_user_period ON events(user_id, period_window_type, period_anchor_date, period_start_date, period_end_date);

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m6-period-events', 'period-event-model-and-projection');
