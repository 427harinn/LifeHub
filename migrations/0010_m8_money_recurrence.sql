CREATE INDEX IF NOT EXISTS idx_money_items_user_recurrence
  ON money_items(user_id, recurrence_rule_id);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m8-money-recurrence', 'shared-recurrence-rules-and-projection');
