CREATE TABLE IF NOT EXISTS money_occurrence_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  money_item_id TEXT NOT NULL REFERENCES money_items(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('modified', 'cancelled')),
  type TEXT CHECK (type IS NULL OR type IN ('expense', 'income')),
  title TEXT,
  category_id TEXT,
  planned_amount INTEGER CHECK (planned_amount IS NULL OR planned_amount > 0),
  date TEXT,
  memo TEXT,
  patch_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (money_item_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_money_overrides_user_item
  ON money_occurrence_overrides(user_id, money_item_id, occurrence_key);

CREATE TABLE IF NOT EXISTS money_occurrence_settlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  money_item_id TEXT NOT NULL REFERENCES money_items(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('actual', 'estimated_actual')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  finalized_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- When an estimated value is replaced by an actual, retain it so cancelling
  -- the actual can restore the historical fixed amount without using a later
  -- series definition.
  estimated_amount INTEGER CHECK (estimated_amount IS NULL OR estimated_amount > 0),
  UNIQUE (money_item_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_money_settlements_user_item
  ON money_occurrence_settlements(user_id, money_item_id, occurrence_key);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m9-money-occurrence', 'override-settlement-projection');
