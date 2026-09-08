import type { EventInput, EventOccurrenceOverride, EventOccurrenceOverrideType } from "../types";

type OverrideRow = {
  id: string;
  user_id: string;
  event_id: string;
  occurrence_key: string;
  override_type: EventOccurrenceOverrideType;
  patch_json: string | null;
  created_at: string;
  updated_at: string;
};

const toOverride = (row: OverrideRow): EventOccurrenceOverride => ({
  id: row.id,
  userId: row.user_id,
  eventId: row.event_id,
  occurrenceKey: row.occurrence_key,
  overrideType: row.override_type,
  patch: row.patch_json ? JSON.parse(row.patch_json) as Partial<EventInput> : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class EventOccurrenceOverrideRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string, eventId: string, occurrenceKey: string): Promise<EventOccurrenceOverride | null> {
    const row = await this.db.prepare("SELECT id, user_id, event_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM event_occurrence_overrides WHERE user_id = ? AND event_id = ? AND occurrence_key = ?").bind(userId, eventId, occurrenceKey).first<OverrideRow>();
    return row ? toOverride(row) : null;
  }

  async listForEvent(userId: string, eventId: string): Promise<EventOccurrenceOverride[]> {
    const result = await this.db.prepare("SELECT id, user_id, event_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM event_occurrence_overrides WHERE user_id = ? AND event_id = ?").bind(userId, eventId).all<OverrideRow>();
    return result.results.map(toOverride);
  }

  async upsert(userId: string, eventId: string, occurrenceKey: string, overrideType: EventOccurrenceOverrideType, patch: Partial<EventInput> | null, now: string): Promise<EventOccurrenceOverride> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO event_occurrence_overrides (id, user_id, event_id, occurrence_key, override_type, title, category, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, patch_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, occurrence_key) DO UPDATE SET override_type = excluded.override_type, title = excluded.title, category = excluded.category, place = excluded.place, memo = excluded.memo, timing_type = excluded.timing_type, all_day = excluded.all_day, start_date = excluded.start_date, start_time = excluded.start_time, end_date = excluded.end_date, end_time = excluded.end_time, period_window_type = excluded.period_window_type, period_anchor_date = excluded.period_anchor_date, period_start_date = excluded.period_start_date, period_end_date = excluded.period_end_date, deadline_time = excluded.deadline_time, patch_json = excluded.patch_json, updated_at = excluded.updated_at`
    ).bind(id, userId, eventId, occurrenceKey, overrideType, patch?.title ?? null, patch?.category ?? null, patch?.place ?? null, patch?.memo ?? null, patch?.timingType ?? null, patch?.allDay === undefined ? null : patch.allDay === null ? null : patch.allDay ? 1 : 0, patch?.startDate ?? null, patch?.startTime ?? null, patch?.endDate ?? null, patch?.endTime ?? null, patch?.periodWindowType ?? null, patch?.periodAnchorDate ?? null, patch?.periodStartDate ?? null, patch?.periodEndDate ?? null, patch?.deadlineTime ?? null, patch ? JSON.stringify(patch) : null, now, now).run();
    const saved = await this.get(userId, eventId, occurrenceKey);
    if (!saved) throw new Error("EventOccurrenceOverride could not be saved");
    return saved;
  }
}
