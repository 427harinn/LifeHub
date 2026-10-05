CREATE TABLE IF NOT EXISTS notification_summary_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('morning', 'evening')),
  local_date TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_summary_jobs_dedupe
  ON notification_summary_jobs(user_id, summary_type, local_date);

CREATE INDEX IF NOT EXISTS idx_notification_summary_jobs_due
  ON notification_summary_jobs(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notification_summary_jobs_user_pending
  ON notification_summary_jobs(user_id, status);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m17-notification-summary-jobs', 'precomputed-summary-notification-jobs');
