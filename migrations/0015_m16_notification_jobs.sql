CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  occurrence_key TEXT,
  event_notification_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_dedupe
  ON notification_jobs(event_notification_id, COALESCE(occurrence_key, ''), scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_due
  ON notification_jobs(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_user_event_pending
  ON notification_jobs(user_id, event_id, status);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m16-notification-jobs', 'preprojected-event-notification-jobs');
