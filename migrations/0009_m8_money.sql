CREATE TABLE IF NOT EXISTS money_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  name TEXT NOT NULL,
  color_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, type, name)
);

CREATE INDEX IF NOT EXISTS idx_money_categories_user_type_active
  ON money_categories(user_id, type, active, sort_order, name);

CREATE TABLE IF NOT EXISTS money_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  title TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES money_categories(id),
  planned_amount INTEGER NOT NULL CHECK (planned_amount > 0),
  date TEXT NOT NULL,
  time TEXT,
  recurrence_rule_id TEXT,
  memo TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_items_user_date
  ON money_items(user_id, date, active, deleted_at);

CREATE INDEX IF NOT EXISTS idx_money_items_user_updated
  ON money_items(user_id, updated_at DESC, created_at DESC);

INSERT OR IGNORE INTO app_foundation_meta (key, value)
VALUES ('m8-money', 'single-planned-expense-income');
