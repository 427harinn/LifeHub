CREATE TABLE IF NOT EXISTS recurrence_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval INTEGER NOT NULL CHECK (interval >= 1),
  weekdays TEXT,
  day_of_month INTEGER CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE events ADD COLUMN recurrence_rule_id TEXT REFERENCES recurrence_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS event_occurrence_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('modified', 'cancelled')),
  title TEXT,
  category TEXT CHECK (category IS NULL OR category IN ('home', 'work')),
  place TEXT,
  memo TEXT,
  timing_type TEXT CHECK (timing_type IS NULL OR timing_type IN ('scheduled')),
  all_day INTEGER CHECK (all_day IS NULL OR all_day IN (0, 1)),
  start_date TEXT,
  start_time TEXT,
  end_date TEXT,
  end_time TEXT,
  period_window_type TEXT,
  period_anchor_date TEXT,
  period_start_date TEXT,
  period_end_date TEXT,
  deadline_time TEXT,
  patch_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_recurrence_rules_user ON recurrence_rules(user_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_events_user_recurrence ON events(user_id, recurrence_rule_id);
CREATE INDEX IF NOT EXISTS idx_event_overrides_user_event ON event_occurrence_overrides(user_id, event_id);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m5-scheduled-recurrence', 'projection-and-occurrence-overrides');
