import type { MoneyOccurrenceSettlement, MoneySettlementStatus } from "../types";

type SettlementRow = {
  id: string;
  user_id: string;
  money_item_id: string;
  occurrence_key: string;
  status: MoneySettlementStatus;
  amount: number;
  finalized_at: string;
  updated_at: string;
  estimated_amount: number | null;
};

const toSettlement = (row: SettlementRow): MoneyOccurrenceSettlement => ({
  id: row.id,
  userId: row.user_id,
  moneyItemId: row.money_item_id,
  occurrenceKey: row.occurrence_key,
  status: row.status,
  amount: row.amount,
  finalizedAt: row.finalized_at,
  updatedAt: row.updated_at,
  estimatedAmount: row.estimated_amount
});

const select = "id, user_id, money_item_id, occurrence_key, status, amount, finalized_at, updated_at, estimated_amount";

export class MoneyOccurrenceSettlementRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string, moneyItemId: string, occurrenceKey: string): Promise<MoneyOccurrenceSettlement | null> {
    const row = await this.db.prepare(`SELECT ${select} FROM money_occurrence_settlements WHERE user_id = ? AND money_item_id = ? AND occurrence_key = ?`).bind(userId, moneyItemId, occurrenceKey).first<SettlementRow>();
    return row ? toSettlement(row) : null;
  }

  async listForUser(userId: string): Promise<MoneyOccurrenceSettlement[]> {
    const result = await this.db.prepare(`SELECT ${select} FROM money_occurrence_settlements WHERE user_id = ? ORDER BY occurrence_key`).bind(userId).all<SettlementRow>();
    return result.results.map(toSettlement);
  }

  async upsert(userId: string, moneyItemId: string, occurrenceKey: string, status: MoneySettlementStatus, amount: number, now: string): Promise<MoneyOccurrenceSettlement> {
    const existing = await this.get(userId, moneyItemId, occurrenceKey);
    const estimatedAmount = existing?.status === "estimated_actual" ? existing.amount : existing?.estimatedAmount ?? null;
    const id = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO money_occurrence_settlements (id, user_id, money_item_id, occurrence_key, status, amount, finalized_at, updated_at, estimated_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(money_item_id, occurrence_key) DO UPDATE SET status = excluded.status, amount = excluded.amount, finalized_at = excluded.finalized_at, updated_at = excluded.updated_at, estimated_amount = excluded.estimated_amount`
    ).bind(id, userId, moneyItemId, occurrenceKey, status, amount, now, now, status === "actual" ? estimatedAmount : null).run();
    const saved = await this.get(userId, moneyItemId, occurrenceKey);
    if (!saved) throw new Error("MoneyOccurrenceSettlement could not be saved");
    return saved;
  }

  async deleteActual(userId: string, moneyItemId: string, occurrenceKey: string, now: string): Promise<boolean> {
    const existing = await this.get(userId, moneyItemId, occurrenceKey);
    if (!existing || existing.status !== "actual") return false;
    if (existing.estimatedAmount !== null) {
      await this.db.prepare("UPDATE money_occurrence_settlements SET status = 'estimated_actual', amount = ?, finalized_at = ?, updated_at = ?, estimated_amount = NULL WHERE user_id = ? AND money_item_id = ? AND occurrence_key = ?").bind(existing.estimatedAmount, existing.finalizedAt, now, userId, moneyItemId, occurrenceKey).run();
      return true;
    }
    const result = await this.db.prepare("DELETE FROM money_occurrence_settlements WHERE user_id = ? AND money_item_id = ? AND occurrence_key = ? AND status = 'actual'").bind(userId, moneyItemId, occurrenceKey).run();
    return Boolean(result.meta.changes);
  }
}
