import type { Event, EventCategory, EventInput, EventTimingType } from "../types";

type EventRow = {
  id: string;
  user_id: string;
  category: EventCategory;
  title: string;
  place: string | null;
  memo: string | null;
  timing_type: EventTimingType;
  all_day: number | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  period_window_type: Event["periodWindowType"];
  period_anchor_date: string | null;
  period_start_date: string | null;
  period_end_date: string | null;
  deadline_time: string | null;
  recurrence_rule_id: string | null;
  active: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const eventSelect = "id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at";

const toEvent = (row: EventRow): Event => ({
  id: row.id,
  userId: row.user_id,
  category: row.category,
  title: row.title,
  place: row.place,
  memo: row.memo,
  timingType: row.timing_type,
  allDay: row.all_day === null ? null : row.all_day === 1,
  startDate: row.start_date,
  startTime: row.start_time,
  endDate: row.end_date,
  endTime: row.end_time,
  periodWindowType: row.period_window_type,
  periodAnchorDate: row.period_anchor_date,
  periodStartDate: row.period_start_date,
  periodEndDate: row.period_end_date,
  deadlineTime: row.deadline_time,
  recurrenceRuleId: row.recurrence_rule_id,
  active: row.active === 1,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class EventRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, input: EventInput, recurrenceRuleId: string | null, now: string): Promise<Event> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO events (id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)"
    ).bind(id, userId, input.category, input.title, input.place, input.memo, input.timingType, input.allDay === null ? null : input.allDay ? 1 : 0, input.startDate, input.startTime, input.endDate, input.endTime, input.periodWindowType, input.periodAnchorDate, input.periodStartDate, input.periodEndDate, input.deadlineTime, recurrenceRuleId, now, now).run();
    const created = await this.getById(userId, id);
    if (!created) throw new Error("Event could not be created");
    return created;
  }

  async getById(userId: string, id: string): Promise<Event | null> {
    const row = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL`).bind(id, userId).first<EventRow>();
    return row ? toEvent(row) : null;
  }

  async listForRange(userId: string, startDate: string, endDate: string): Promise<Event[]> {
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE user_id = ? AND active = 1 AND deleted_at IS NULL AND (timing_type = 'period' OR recurrence_rule_id IS NOT NULL OR (start_date <= ? AND end_date >= ?)) ORDER BY COALESCE(start_date, period_start_date, period_anchor_date, '9999-12-31') ASC, COALESCE(start_time, deadline_time, '00:00') ASC, created_at ASC`).bind(userId, endDate, startDate).all<EventRow>();
    return result.results.map(toEvent);
  }

  async recentDefinitions(userId: string, limit: number, category?: EventCategory): Promise<Event[]> {
    const categoryClause = category ? " AND category = ?" : "";
    const bindings = category ? [userId, category, limit] : [userId, limit];
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE user_id = ? AND active = 1 AND deleted_at IS NULL${categoryClause} ORDER BY updated_at DESC, created_at DESC, id ASC LIMIT ?`).bind(...bindings).all<EventRow>();
    return result.results.map(toEvent);
  }

  async searchDefinitions(userId: string, query: string, limit: number, category?: EventCategory): Promise<Event[]> {
    const like = `%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    const categoryClause = category ? " AND category = ?" : "";
    const bindings = category ? [userId, category, like, like, like, like, limit] : [userId, like, like, like, like, limit];
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE user_id = ? AND active = 1 AND deleted_at IS NULL${categoryClause} AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(place, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(memo, '')) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM event_occurrence_overrides WHERE event_occurrence_overrides.user_id = events.user_id AND event_occurrence_overrides.event_id = events.id AND LOWER(COALESCE(event_occurrence_overrides.patch_json, '')) LIKE ? ESCAPE '\\')) ORDER BY updated_at DESC, created_at DESC, id ASC LIMIT ?`).bind(...bindings).all<EventRow>();
    return result.results.map(toEvent);
  }

  async update(userId: string, id: string, input: EventInput, recurrenceRuleId: string | null, now: string): Promise<Event | null> {
    const result = await this.db.prepare(
      "UPDATE events SET category = ?, title = ?, place = ?, memo = ?, timing_type = ?, all_day = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?, period_window_type = ?, period_anchor_date = ?, period_start_date = ?, period_end_date = ?, deadline_time = ?, recurrence_rule_id = ?, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL"
    ).bind(input.category, input.title, input.place, input.memo, input.timingType, input.allDay === null ? null : input.allDay ? 1 : 0, input.startDate, input.startTime, input.endDate, input.endTime, input.periodWindowType, input.periodAnchorDate, input.periodStartDate, input.periodEndDate, input.deadlineTime, recurrenceRuleId, now, id, userId).run();
    if (!result.meta.changes) return null;
    return this.getById(userId, id);
  }

  async softDelete(userId: string, id: string, deletedAt: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE events SET active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL").bind(deletedAt, deletedAt, id, userId).run();
    return Boolean(result.meta.changes);
  }
}
