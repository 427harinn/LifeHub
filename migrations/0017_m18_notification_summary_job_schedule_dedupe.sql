DROP INDEX IF EXISTS idx_notification_summary_jobs_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_summary_jobs_schedule_dedupe
  ON notification_summary_jobs(user_id, summary_type, local_date, scheduled_for);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m18-notification-summary-job-schedule-dedupe', 'allow-rescheduled-summary-jobs');
