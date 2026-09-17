ALTER TABLE user_settings ADD COLUMN last_used_notification_home TEXT NOT NULL DEFAULT '{"mode":"none","templateId":null,"offsets":[]}';
ALTER TABLE user_settings ADD COLUMN last_used_notification_work TEXT NOT NULL DEFAULT '{"mode":"none","templateId":null,"offsets":[]}';

INSERT INTO app_foundation_meta (key, value)
VALUES ('m15-event-last-used-notification', 'category-scoped-event-notification-preferences');
