import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { notFoundError, validationError } from "../lib/errors";
import type { Event, EventInput, PeriodEventInput, RecurrenceRuleInput, ScheduledEventInput } from "../types";
import { dateDifference, isDateKey, normalizeRecurrenceInput, shiftDate } from "./recurrence-service";
import { EventProjectionService } from "./event-projection-service";
import { NotificationRepository } from "../repositories/notification-repository";

const MAX_TITLE_LENGTH = 120;
const MAX_PLACE_LENGTH = 200;
const MAX_MEMO_LENGTH = 5000;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const nullableString = (value: unknown, field: string, maxLength: number, details: Record<string, string>) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) details[field] = `${field}を入力してください。`;
  return typeof value === "string" ? value.trim() : null;
};

const baseTextFields = (value: Partial<EventInput>, details: Record<string, string>) => {
  const category = value.category;
  if (category !== "home" && category !== "work") details.category = "カテゴリが不正です。";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) details.title = "タイトルを入力してください。";
  return { category, title, place: nullableString(value.place, "場所", MAX_PLACE_LENGTH, details), memo: nullableString(value.memo, "メモ", MAX_MEMO_LENGTH, details) };
};

export const validateScheduledEventInput = (value: Partial<EventInput>): ScheduledEventInput => {
  const details: Record<string, string> = {};
  const base = baseTextFields(value, details);
  if (value.timingType !== "scheduled") details.timingType = "予定の種類が不正です。";
  if (value.periodWindowType || value.periodAnchorDate || value.periodStartDate || value.periodEndDate || value.deadlineTime) details.period = "日時が決まっている予定に期間設定はできません。";
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
  if (Object.keys(details).length > 0) throw validationError(details);
  return { category: base.category as "home" | "work", title: base.title, place: base.place, memo: base.memo, timingType: "scheduled", allDay, startDate, startTime: allDay ? null : startTime, endDate, endTime: allDay ? null : endTime, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null };
};

export const validatePeriodEventInput = (value: Partial<PeriodEventInput>, recurrence: unknown = null): PeriodEventInput => {
  const details: Record<string, string> = {};
  const base = baseTextFields(value, details);
  if (value.timingType !== "period") details.timingType = "予定の種類が不正です。";
  if (value.allDay !== null && value.allDay !== undefined) details.allDay = "期間予定に終日は設定できません。";
  if (value.startDate !== null && value.startDate !== undefined || value.startTime !== null && value.startTime !== undefined || value.endDate !== null && value.endDate !== undefined || value.endTime !== null && value.endTime !== undefined) details.date = "期間予定に日時指定は設定できません。";
  const windowType = value.periodWindowType;
  if (windowType !== "this_week" && windowType !== "this_month" && windowType !== "custom_range") details.periodWindowType = "実施時期が不正です。";
  const anchor = value.periodAnchorDate ?? null;
  const start = value.periodStartDate ?? null;
  const end = value.periodEndDate ?? null;
  if (windowType === "this_week" || windowType === "this_month") {
    if (!anchor || !isDateKey(anchor)) details.periodAnchorDate = "基準日を入力してください。";
    if (start !== null || end !== null) details.period = "期間範囲を同時に設定できません。";
  }
  if (windowType === "custom_range") {
    if (anchor !== null) details.periodAnchorDate = "日付範囲では基準日を設定できません。";
    if (!start || !isDateKey(start)) details.periodStartDate = "開始日を入力してください。";
    if (!end || !isDateKey(end)) details.periodEndDate = "終了日を入力してください。";
    if (isDateKey(start ?? "") && isDateKey(end ?? "") && (start as string) >= (end as string)) details.period = "期間は2日以上で指定してください。";
    if (recurrence !== null && recurrence !== undefined) details.recurrence = "日付範囲に繰り返しは設定できません。";
  }
  if (windowType === "this_week" && recurrence && typeof recurrence === "object" && (recurrence as { frequency?: string }).frequency !== "weekly") details.recurrence = "今週中は毎週だけ設定できます。";
  if (windowType === "this_month" && recurrence && typeof recurrence === "object" && (recurrence as { frequency?: string }).frequency !== "monthly") details.recurrence = "今月中は毎月だけ設定できます。";
  if (value.deadlineTime !== null && value.deadlineTime !== undefined && (typeof value.deadlineTime !== "string" || !TIME_PATTERN.test(value.deadlineTime))) details.deadlineTime = "締切時刻が不正です。";
  if (Object.keys(details).length > 0) throw validationError(details);
  return { category: base.category as "home" | "work", title: base.title, place: base.place, memo: base.memo, timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType: windowType as PeriodEventInput["periodWindowType"], periodAnchorDate: anchor, periodStartDate: start, periodEndDate: end, deadlineTime: value.deadlineTime ?? null };
};

export const validateEventInput = (value: Partial<EventInput>, recurrence: unknown = null): EventInput => value.timingType === "period" ? validatePeriodEventInput(value, recurrence) : validateScheduledEventInput(value);

export type EventScope = "occurrence" | "following" | "series";
export type EventCommand = Partial<EventInput> & { scope?: EventScope; occurrenceKey?: string; recurrence?: Partial<RecurrenceRuleInput> | null; notifications?: number[] };
const scopeOf = (value: EventCommand) => value.scope ?? "series";

const normalizeNotifications = (value: unknown): number[] => {
  if (!Array.isArray(value)) throw validationError({ notifications: "通知設定が不正です。" });
  const values = [...new Set(value as unknown[])];
  if (values.some((offset) => typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 525600)) throw validationError({ notifications: "通知時刻が不正です。" });
  return (values as number[]).sort((left, right) => right - left);
};

const periodEndForMonth = (monthStart: string) => shiftDate(`${monthStart.slice(0, 7)}-01`, new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0)).getUTCDate() - 1);

export class EventService {
  constructor(private readonly repository: EventRepository, private readonly recurrenceRepository: RecurrenceRepository, private readonly overrideRepository: EventOccurrenceOverrideRepository, private readonly projection: EventProjectionService, private readonly notificationRepository?: NotificationRepository) {}

  private async prepareRule(userId: string, recurrence: unknown, startsOn: string, now: string) {
    const input = normalizeRecurrenceInput(recurrence, startsOn);
    return input ? this.recurrenceRepository.create(userId, input, now) : null;
  }

  async create(userId: string, body: EventCommand, now: string): Promise<Event> {
    const input = validateEventInput(body, body.recurrence);
    const requestedNotifications = body.notifications === undefined ? undefined : normalizeNotifications(body.notifications);
    const startsOn = input.timingType === "period" ? input.periodAnchorDate : input.startDate;
    const rule = await this.prepareRule(userId, body.recurrence, startsOn ?? now.slice(0, 10), now);
    const created = await this.repository.create(userId, input, rule?.id ?? null, now);
    if (requestedNotifications !== undefined && this.notificationRepository) await this.notificationRepository.replaceEventNotifications(userId, created.id, requestedNotifications, now);
    return { ...created, notifications: await this.notificationOffsets(userId, created.id) };
  }

  private async notificationOffsets(userId: string, eventId: string): Promise<number[]> {
    if (!this.notificationRepository) return [];
    return (await this.notificationRepository.listEventNotificationsForEvent(userId, eventId)).sort((left, right) => right.offsetMinutes - left.offsetMinutes).map((row) => row.offsetMinutes);
  }

  private async getBase(userId: string, id: string) {
    const event = await this.repository.getById(userId, id);
    if (!event) throw notFoundError();
    const rule = event.recurrenceRuleId ? await this.recurrenceRepository.getById(userId, event.recurrenceRuleId) : null;
    return { event, rule };
  }

  private targetRange(occurrenceKey: string | undefined, eventId: string) {
    const prefix = `event:${eventId}:`;
    if (!occurrenceKey?.startsWith(prefix)) throw validationError({ occurrenceKey: "occurrenceKeyが必要です。" });
    const suffix = occurrenceKey.slice(prefix.length);
    if (/^\d{4}-\d{2}-\d{2}T/.test(suffix)) {
      const date = suffix.slice(0, 10);
      if (!isDateKey(date)) throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
      return { startDate: date, endDate: date };
    }
    if (suffix.startsWith("week:")) {
      const date = suffix.slice(5, 15);
      if (!isDateKey(date)) throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
      return { startDate: date, endDate: shiftDate(date, 6) };
    }
    if (suffix.startsWith("month:")) {
      const month = suffix.slice(6, 13);
      if (!/^\d{4}-\d{2}$/.test(month)) throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
      const startDate = `${month}-01`;
      return { startDate, endDate: periodEndForMonth(startDate) };
    }
    if (suffix.startsWith("range:")) {
      const date = suffix.slice(6, 16);
      if (!isDateKey(date)) throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
      return { startDate: date, endDate: date };
    }
    throw validationError({ occurrenceKey: "occurrenceKeyが不正です。" });
  }

  private async targetOccurrence(userId: string, event: Event, occurrenceKey: string | undefined) {
    if (!event.recurrenceRuleId) throw validationError({ scope: "繰り返し予定ではありません。" });
    const range = this.targetRange(occurrenceKey, event.id);
    const projected = (await Promise.all([1, 0].map((weekStartsOn) => this.projection.project(userId, range, { weekStartsOn })))).flat();
    const occurrence = projected.find((item) => item.occurrenceKey === occurrenceKey);
    if (!occurrence) throw notFoundError();
    return { date: occurrence.periodStartDate ?? occurrence.startDate ?? range.startDate, occurrence };
  }

  private inputStartsOn(input: EventInput) { return input.timingType === "period" ? input.periodAnchorDate : input.startDate; }

  async update(userId: string, id: string, body: EventCommand, now: string): Promise<Event> {
    const { event, rule } = await this.getBase(userId, id);
    const scope = scopeOf(body);
    if (scope === "occurrence") {
      const { occurrence } = await this.targetOccurrence(userId, event, body.occurrenceKey);
      const input = validateEventInput({ ...occurrence, ...body }, undefined);
      await this.overrideRepository.upsert(userId, id, body.occurrenceKey as string, "modified", input, now);
      return { ...occurrence, ...input, occurrenceKey: body.occurrenceKey, recurrence: rule, notifications: await this.notificationOffsets(userId, id) };
    }

    const recurrence = body.recurrence === undefined ? rule : body.recurrence;
    const input = validateEventInput({ ...event, ...body }, recurrence);
    const requestedNotifications = body.notifications === undefined ? undefined : normalizeNotifications(body.notifications);
    const startsOn = this.inputStartsOn(input) ?? now.slice(0, 10);
    const normalized = normalizeRecurrenceInput(recurrence, startsOn);
    if (scope === "following") {
      if (!rule || !body.occurrenceKey) throw validationError({ scope: "繰り返し予定の対象範囲が不正です。" });
      const { date } = await this.targetOccurrence(userId, event, body.occurrenceKey);
      await this.recurrenceRepository.update(userId, rule.id, { ...rule, endsOn: shiftDate(date, -1), weekdays: rule.weekdays }, now);
      const newRuleInput: RecurrenceRuleInput | null = normalized ? { ...normalized, startsOn: date } : null;
      const newRule = newRuleInput ? await this.recurrenceRepository.create(userId, newRuleInput, now) : null;
      const splitInput = input.timingType === "period"
        ? { ...input, periodAnchorDate: input.periodWindowType === "custom_range" ? null : date }
        : { ...input, startDate: date, endDate: shiftDate(date, dateDifference(input.startDate ?? date, input.endDate ?? date)) };
      const created = await this.repository.create(userId, splitInput, newRule?.id ?? null, now);
      const offsets = requestedNotifications === undefined ? await this.notificationOffsets(userId, id) : requestedNotifications;
      if (this.notificationRepository) await this.notificationRepository.replaceEventNotifications(userId, created.id, offsets, now);
      return { ...created, notifications: offsets };
    }

    let ruleId = rule?.id ?? null;
    if (normalized) {
      if (rule) await this.recurrenceRepository.update(userId, rule.id, normalized, now);
      else ruleId = (await this.recurrenceRepository.create(userId, normalized, now)).id;
    } else ruleId = null;
    const updated = await this.repository.update(userId, id, input, ruleId, now);
    if (!updated) throw notFoundError();
    if (requestedNotifications !== undefined && this.notificationRepository) await this.notificationRepository.replaceEventNotifications(userId, id, requestedNotifications, now);
    return { ...updated, notifications: await this.notificationOffsets(userId, id) };
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
