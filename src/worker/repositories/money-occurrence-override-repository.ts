import type { MoneyItemInput, MoneyOccurrenceOverride, MoneyOccurrenceOverrideType } from "../types";

type OverrideRow = {
  id: string;
  user_id: string;
  money_item_id: string;
  occurrence_key: string;
  override_type: MoneyOccurrenceOverrideType;
  patch_json: string | null;
  created_at: string;
  updated_at: string;
};

const toOverride = (row: OverrideRow): MoneyOccurrenceOverride => ({
  id: row.id,
  userId: row.user_id,
  moneyItemId: row.money_item_id,
  occurrenceKey: row.occurrence_key,
  overrideType: row.override_type,
  patch: row.patch_json ? JSON.parse(row.patch_json) as Partial<MoneyItemInput> : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const select = "id, user_id, money_item_id, occurrence_key, override_type, patch_json, created_at, updated_at";

export class MoneyOccurrenceOverrideRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string, moneyItemId: string, occurrenceKey: string): Promise<MoneyOccurrenceOverride | null> {
    const row = await this.db.prepare(`SELECT ${select} FROM money_occurrence_overrides WHERE user_id = ? AND money_item_id = ? AND occurrence_key = ?`).bind(userId, moneyItemId, occurrenceKey).first<OverrideRow>();
    return row ? toOverride(row) : null;
  }

  async listForItem(userId: string, moneyItemId: string): Promise<MoneyOccurrenceOverride[]> {
    const result = await this.db.prepare(`SELECT ${select} FROM money_occurrence_overrides WHERE user_id = ? AND money_item_id = ? ORDER BY occurrence_key`).bind(userId, moneyItemId).all<OverrideRow>();
    return result.results.map(toOverride);
  }

  async upsert(userId: string, moneyItemId: string, occurrenceKey: string, overrideType: MoneyOccurrenceOverrideType, patch: Partial<MoneyItemInput> | null, now: string): Promise<MoneyOccurrenceOverride> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO money_occurrence_overrides (id, user_id, money_item_id, occurrence_key, override_type, type, title, category_id, planned_amount, date, memo, patch_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(money_item_id, occurrence_key) DO UPDATE SET override_type = excluded.override_type, type = excluded.type, title = excluded.title, category_id = excluded.category_id, planned_amount = excluded.planned_amount, date = excluded.date, memo = excluded.memo, patch_json = excluded.patch_json, updated_at = excluded.updated_at`
    ).bind(id, userId, moneyItemId, occurrenceKey, overrideType, patch?.type ?? null, patch?.title ?? null, patch?.categoryId ?? null, patch?.plannedAmount ?? null, patch?.date ?? null, patch?.memo ?? null, patch ? JSON.stringify(patch) : null, now, now).run();
    const saved = await this.get(userId, moneyItemId, occurrenceKey);
    if (!saved) throw new Error("MoneyOccurrenceOverride could not be saved");
    return saved;
  }
}
