import type { RecurrenceFrequency, RecurrenceRule, RecurrenceRuleInput } from "../types";

type RuleRow = {
  id: string;
  user_id: string;
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: string | null;
  day_of_month: number | null;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
};

const toRule = (row: RuleRow): RecurrenceRule => ({
  id: row.id,
  userId: row.user_id,
  frequency: row.frequency,
  interval: row.interval,
  weekdays: row.weekdays ? JSON.parse(row.weekdays) as number[] : null,
  dayOfMonth: row.day_of_month,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class RecurrenceRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, input: RecurrenceRuleInput, now: string): Promise<RecurrenceRule> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO recurrence_rules (id, user_id, frequency, interval, weekdays, day_of_month, starts_on, ends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, input.frequency, input.interval, input.weekdays ? JSON.stringify(input.weekdays) : null, input.dayOfMonth, input.startsOn, input.endsOn, now, now).run();
    const rule = await this.getById(userId, id);
    if (!rule) throw new Error("RecurrenceRule could not be created");
    return rule;
  }

  async getById(userId: string, id: string): Promise<RecurrenceRule | null> {
    const row = await this.db.prepare("SELECT id, user_id, frequency, interval, weekdays, day_of_month, starts_on, ends_on, created_at, updated_at FROM recurrence_rules WHERE id = ? AND user_id = ?").bind(id, userId).first<RuleRow>();
    return row ? toRule(row) : null;
  }

  async update(userId: string, id: string, input: RecurrenceRuleInput, now: string): Promise<RecurrenceRule | null> {
    const result = await this.db.prepare(
      "UPDATE recurrence_rules SET frequency = ?, interval = ?, weekdays = ?, day_of_month = ?, starts_on = ?, ends_on = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(input.frequency, input.interval, input.weekdays ? JSON.stringify(input.weekdays) : null, input.dayOfMonth, input.startsOn, input.endsOn, now, id, userId).run();
    if (!result.meta.changes) return null;
    return this.getById(userId, id);
  }
}
