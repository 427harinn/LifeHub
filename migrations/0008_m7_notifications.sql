CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  disabled_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_enabled
  ON push_subscriptions(user_id, enabled, disabled_at);

CREATE TABLE IF NOT EXISTS event_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes >= 0 AND offset_minutes <= 525600),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS idx_event_notifications_user_event
  ON event_notifications(user_id, event_id, sort_order);

CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_category TEXT CHECK (target_category IS NULL OR target_category IN ('home', 'work')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_user_active
  ON notification_templates(user_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_template_offsets (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes >= 0 AND offset_minutes <= 525600),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (template_id, offset_minutes)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('event', 'morning_summary', 'evening_summary')),
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  occurrence_key TEXT,
  event_notification_id TEXT REFERENCES event_notifications(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  sent_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
  ON notification_deliveries(status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_scheduled
  ON notification_deliveries(user_id, scheduled_for);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m7-notifications', 'personal-web-push-event-summary-template-delivery');
