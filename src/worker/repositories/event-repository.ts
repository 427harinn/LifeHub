import type { Event, EventCategory, EventTimingType, ScheduledEventInput } from "../types";

type EventRow = {
  id: string;
  user_id: string;
  category: EventCategory;
  title: string;
  place: string | null;
  memo: string | null;
  timing_type: EventTimingType;
  all_day: number;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  active: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const eventSelect = "id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, active, deleted_at, created_at, updated_at";

const toEvent = (row: EventRow): Event => ({
  id: row.id,
  userId: row.user_id,
  category: row.category,
  title: row.title,
  place: row.place,
  memo: row.memo,
  timingType: row.timing_type,
  allDay: row.all_day === 1,
  startDate: row.start_date,
  startTime: row.start_time,
  endDate: row.end_date,
  endTime: row.end_time,
  active: row.active === 1,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class EventRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, input: ScheduledEventInput, now: string): Promise<Event> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO events (id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, active, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)"
    ).bind(id, userId, input.category, input.title, input.place, input.memo, input.timingType, input.allDay ? 1 : 0, input.startDate, input.startTime, input.endDate, input.endTime, now, now).run();
    const created = await this.getById(userId, id);
    if (!created) throw new Error("Event could not be created");
    return created;
  }

  async getById(userId: string, id: string): Promise<Event | null> {
    const row = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL`).bind(id, userId).first<EventRow>();
    return row ? toEvent(row) : null;
  }

  async listForRange(userId: string, startDate: string, endDate: string): Promise<Event[]> {
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE user_id = ? AND active = 1 AND deleted_at IS NULL AND start_date <= ? AND end_date >= ? ORDER BY start_date ASC, COALESCE(start_time, '00:00') ASC, created_at ASC`).bind(userId, endDate, startDate).all<EventRow>();
    return result.results.map(toEvent);
  }

  async recentDefinitions(userId: string, limit: number): Promise<Event[]> {
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM events WHERE user_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC LIMIT ?`).bind(userId, limit).all<EventRow>();
    return result.results.map(toEvent);
  }

  async update(userId: string, id: string, input: ScheduledEventInput, now: string): Promise<Event | null> {
    const result = await this.db.prepare(
      "UPDATE events SET category = ?, title = ?, place = ?, memo = ?, timing_type = ?, all_day = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL"
    ).bind(input.category, input.title, input.place, input.memo, input.timingType, input.allDay ? 1 : 0, input.startDate, input.startTime, input.endDate, input.endTime, now, id, userId).run();
    if (!result.meta.changes) return null;
    return this.getById(userId, id);
  }

  async softDelete(userId: string, id: string, deletedAt: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE events SET active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1 AND deleted_at IS NULL").bind(deletedAt, deletedAt, id, userId).run();
    return Boolean(result.meta.changes);
  }
}
