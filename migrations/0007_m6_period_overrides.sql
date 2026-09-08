PRAGMA foreign_keys = OFF;

CREATE TABLE event_occurrence_overrides_m7 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('modified', 'cancelled')),
  title TEXT,
  category TEXT CHECK (category IS NULL OR category IN ('home', 'work')),
  place TEXT,
  memo TEXT,
  timing_type TEXT CHECK (timing_type IS NULL OR timing_type IN ('scheduled', 'period')),
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

INSERT INTO event_occurrence_overrides_m7 (
  id, user_id, event_id, occurrence_key, override_type, title, category, place, memo,
  timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type,
  period_anchor_date, period_start_date, period_end_date, deadline_time, patch_json,
  created_at, updated_at
)
SELECT
  id, user_id, event_id, occurrence_key, override_type, title, category, place, memo,
  timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type,
  period_anchor_date, period_start_date, period_end_date, deadline_time, patch_json,
  created_at, updated_at
FROM event_occurrence_overrides;

DROP TABLE event_occurrence_overrides;
ALTER TABLE event_occurrence_overrides_m7 RENAME TO event_occurrence_overrides;

CREATE INDEX IF NOT EXISTS idx_event_overrides_user_event ON event_occurrence_overrides(user_id, event_id);

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m6-period-overrides', 'allow-period-occurrence-patches');
