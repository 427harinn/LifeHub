import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { notFoundError, validationError } from "../lib/errors";
import type { Event, RecurrenceRuleInput, ScheduledEventInput } from "../types";
import { dateDifference, isDateKey, normalizeRecurrenceInput, shiftDate } from "./recurrence-service";
import { EventProjectionService } from "./event-projection-service";

const MAX_TITLE_LENGTH = 120;
const MAX_PLACE_LENGTH = 200;
const MAX_MEMO_LENGTH = 5000;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const nullableString = (value: unknown, field: string, maxLength: number, details: Record<string, string>) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) details[field] = `${field}を入力してください。`;
  return typeof value === "string" ? value.trim() : null;
};

export const validateScheduledEventInput = (value: Partial<ScheduledEventInput>): ScheduledEventInput => {
  const details: Record<string, string> = {};
  const category = value.category;
  if (category !== "home" && category !== "work") details.category = "カテゴリが不正です。";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) details.title = "タイトルを入力してください。";
  if (value.timingType !== "scheduled") details.timingType = "予定の種類が不正です。";
  if (typeof value.allDay !== "boolean") details.allDay = "終日の設定が不正です。";
  const startDate = typeof value.startDate === "string" ? value.startDate : "";
  const endDate = typeof value.endDate === "string" ? value.endDate : "";
  if (!isDateKey(startDate)) details.startDate = "開始日を入力してください。";
  if (!isDateKey(endDate)) details.endDate = "終了日を入力してください。";
  if (isDateKey(startDate) && isDateKey(endDate) && startDate > endDate) details.date = "終了日は開始日以降にしてください。";
  const allDay = value.allDay === true;
  const startTime = value.startTime ?? null;
  const endTime = value.endTime ?? null;
  if (allDay) {
    if (startTime !== null || endTime !== null) details.time = "終日の予定に時間は設定できません。";
  } else {
    if (typeof startTime !== "string" || !TIME_PATTERN.test(startTime)) details.startTime = "開始時間を入力してください。";
    if (typeof endTime !== "string" || !TIME_PATTERN.test(endTime)) details.endTime = "終了時間を入力してください。";
    if (typeof startTime === "string" && typeof endTime === "string" && TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime) && startDate === endDate && startTime > endTime) details.time = "終了時間は開始時間以降にしてください。";
  }
  const place = nullableString(value.place, "場所", MAX_PLACE_LENGTH, details);
  const memo = nullableString(value.memo, "メモ", MAX_MEMO_LENGTH, details);
  if (Object.keys(details).length > 0) throw validationError(details);
  return { category: category as "home" | "work", title, place, memo, timingType: "scheduled", allDay, startDate, startTime: allDay ? null : startTime, endDate, endTime: allDay ? null : endTime };
};

export type EventScope = "occurrence" | "following" | "series";
export type EventCommand = Partial<ScheduledEventInput> & { scope?: EventScope; occurrenceKey?: string; recurrence?: Partial<RecurrenceRuleInput> | null };

const scopeOf = (value: EventCommand) => value.scope ?? "series";

export class EventService {
  constructor(private readonly repository: EventRepository, private readonly recurrenceRepository: RecurrenceRepository, private readonly overrideRepository: EventOccurrenceOverrideRepository, private readonly projection: EventProjectionService) {}

  private async prepareRule(userId: string, recurrence: unknown, startsOn: string, now: string) {
    const input = normalizeRecurrenceInput(recurrence, startsOn);
    return input ? this.recurrenceRepository.create(userId, input, now) : null;
  }

  async create(userId: string, body: EventCommand, now: string): Promise<Event> {
    const input = validateScheduledEventInput(body);
    const rule = await this.prepareRule(userId, body.recurrence, input.startDate, now);
    return this.repository.create(userId, input, rule?.id ?? null, now);
  }

  private async getBase(userId: string, id: string) {
    const event = await this.repository.getById(userId, id);
    if (!event) throw notFoundError();
    const rule = event.recurrenceRuleId ? await this.recurrenceRepository.getById(userId, event.recurrenceRuleId) : null;
    return { event, rule };
  }

  private targetDate(occurrenceKey: string | undefined, eventId: string) {
    const prefix = `event:${eventId}:`;
    if (!occurrenceKey?.startsWith(prefix)) throw validationError({ occurrenceKey: "occurrenceKeyが必要です。" });
    const date = occurrenceKey.slice(prefix.length, prefix.length + 10);
    if (!isDateKey(date)) throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
    return date;
  }

  private async targetOccurrence(userId: string, event: Event, occurrenceKey: string | undefined) {
    if (!event.recurrenceRuleId) throw validationError({ scope: "繰り返し予定ではありません。" });
    const date = this.targetDate(occurrenceKey, event.id);
    const projected = await this.projection.project(userId, { startDate: date, endDate: date });
    const occurrence = projected.find((item) => item.occurrenceKey === occurrenceKey);
    if (!occurrence) throw notFoundError();
    return { date, occurrence };
  }

  async update(userId: string, id: string, body: EventCommand, now: string): Promise<Event> {
    const { event, rule } = await this.getBase(userId, id);
    const scope = scopeOf(body);
    if (scope === "occurrence") {
      const { occurrence } = await this.targetOccurrence(userId, event, body.occurrenceKey);
      const input = validateScheduledEventInput({ ...occurrence, ...body });
      await this.overrideRepository.upsert(userId, id, body.occurrenceKey as string, "modified", input, now);
      return { ...occurrence, ...input, occurrenceKey: body.occurrenceKey, recurrence: rule };
    }

    const input = validateScheduledEventInput({ ...event, ...body });
    const recurrence = body.recurrence === undefined ? rule : body.recurrence;
    const normalized = normalizeRecurrenceInput(recurrence, input.startDate);
    if (scope === "following") {
      if (!rule || !body.occurrenceKey) throw validationError({ scope: "繰り返し予定の対象範囲が不正です。" });
      const { date } = await this.targetOccurrence(userId, event, body.occurrenceKey);
      const previousEnd = shiftDate(date, -1);
      await this.recurrenceRepository.update(userId, rule.id, { ...rule, endsOn: previousEnd, weekdays: rule.weekdays }, now);
      const newRuleInput: RecurrenceRuleInput | null = normalized ? { ...normalized, startsOn: date } : null;
      const newRule = newRuleInput ? await this.recurrenceRepository.create(userId, newRuleInput, now) : null;
      return this.repository.create(userId, { ...input, startDate: date, endDate: shiftDate(date, dateDifference(input.startDate, input.endDate)) }, newRule?.id ?? null, now);
    }

    let ruleId = rule?.id ?? null;
    if (normalized) {
      const ruleInput = normalized;
      if (rule) await this.recurrenceRepository.update(userId, rule.id, ruleInput, now);
      else ruleId = (await this.recurrenceRepository.create(userId, ruleInput, now)).id;
    } else ruleId = null;
    const updated = await this.repository.update(userId, id, input, ruleId, now);
    if (!updated) throw notFoundError();
    return updated;
  }

  async delete(userId: string, id: string, body: Pick<EventCommand, "scope" | "occurrenceKey"> = {}, now: string): Promise<void> {
    const { event, rule } = await this.getBase(userId, id);
    const scope = scopeOf(body);
    if (scope === "occurrence") {
      await this.targetOccurrence(userId, event, body.occurrenceKey);
      await this.overrideRepository.upsert(userId, id, body.occurrenceKey as string, "cancelled", null, now);
      return;
    }
    if (scope === "following") {
      if (!rule || !body.occurrenceKey) throw validationError({ scope: "繰り返し予定の対象範囲が不正です。" });
      const { date } = await this.targetOccurrence(userId, event, body.occurrenceKey);
      await this.recurrenceRepository.update(userId, rule.id, { ...rule, endsOn: shiftDate(date, -1), weekdays: rule.weekdays }, now);
      return;
    }
    if (!await this.repository.softDelete(userId, id, now)) throw notFoundError();
  }
}
