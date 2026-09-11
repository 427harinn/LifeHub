import type { MoneyCategory, MoneyType } from "../types";
import { moneyCategoryColorKey } from "../../lib/money-category-colors";

type MoneyCategoryRow = {
  id: string; user_id: string; type: MoneyType; name: string; color_key: string | null;
  sort_order: number; active: number; created_at: string; updated_at: string;
};

const select = "id, user_id, type, name, color_key, sort_order, active, created_at, updated_at";
const toCategory = (row: MoneyCategoryRow): MoneyCategory => ({
  id: row.id, userId: row.user_id, type: row.type, name: row.name, colorKey: row.color_key ?? moneyCategoryColorKey({ id: row.id, name: row.name }),
  sortOrder: row.sort_order, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at
});

export class MoneyCategoryRepository {
  constructor(private readonly db: D1Database) {}

  async ensureForUser(userId: string, now: string): Promise<void> {
    const defaults: Array<[MoneyType, string, number]> = [
      ["expense", "食費", 0], ["expense", "日用品", 1], ["expense", "固定費", 2], ["expense", "交通", 3],
      ["expense", "医療", 4], ["expense", "娯楽", 5], ["expense", "その他", 6],
      ["income", "給料", 0], ["income", "臨時収入", 1], ["income", "その他", 2]
    ];
    await this.db.batch(defaults.map(([type, name, sortOrder]) => this.db.prepare(
      "INSERT OR IGNORE INTO money_categories (id, user_id, type, name, color_key, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).bind(crypto.randomUUID(), userId, type, name, moneyCategoryColorKey({ name }), sortOrder, now, now)));
  }

  async list(userId: string, type?: MoneyType, includeInactive = false): Promise<MoneyCategory[]> {
    const conditions = ["user_id = ?"]; const binds: unknown[] = [userId];
    if (type) { conditions.push("type = ?"); binds.push(type); }
    if (!includeInactive) conditions.push("active = 1");
    const result = await this.db.prepare(`SELECT ${select} FROM money_categories WHERE ${conditions.join(" AND ")} ORDER BY type, sort_order, name`).bind(...binds).all<MoneyCategoryRow>();
    return result.results.map(toCategory);
  }

  async getById(userId: string, id: string): Promise<MoneyCategory | null> {
    const row = await this.db.prepare(`SELECT ${select} FROM money_categories WHERE id = ? AND user_id = ?`).bind(id, userId).first<MoneyCategoryRow>();
    return row ? toCategory(row) : null;
  }

  async create(userId: string, input: { type: MoneyType; name: string; colorKey: string | null; sortOrder: number }, now: string): Promise<MoneyCategory> {
    const id = crypto.randomUUID();
    await this.db.prepare("INSERT INTO money_categories (id, user_id, type, name, color_key, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").bind(id, userId, input.type, input.name, input.colorKey, input.sortOrder, now, now).run();
    const created = await this.getById(userId, id); if (!created) throw new Error("MoneyCategory could not be created"); return created;
  }

  async update(userId: string, id: string, input: { name?: string; colorKey?: string | null; sortOrder?: number }, now: string): Promise<MoneyCategory | null> {
    const current = await this.getById(userId, id); if (!current) return null;
    await this.db.prepare("UPDATE money_categories SET name = ?, color_key = ?, sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(input.name ?? current.name, input.colorKey === undefined ? current.colorKey : input.colorKey, input.sortOrder ?? current.sortOrder, now, id, userId).run();
    return this.getById(userId, id);
  }

  async deactivate(userId: string, id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE money_categories SET active = 0, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1").bind(now, id, userId).run(); return Boolean(result.meta.changes);
  }
}
