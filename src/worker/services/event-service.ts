import { notFoundError, validationError } from "../lib/errors";
import { EventRepository } from "../repositories/event-repository";
import type { Event, ScheduledEventInput } from "../types";

const MAX_TITLE_LENGTH = 120;
const MAX_PLACE_LENGTH = 200;
const MAX_MEMO_LENGTH = 5000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const isValidDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

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
  const timingType = value.timingType;
  if (timingType !== "scheduled") details.timingType = "予定の種類が不正です。";
  if (typeof value.allDay !== "boolean") details.allDay = "終日の設定が不正です。";
  const startDate = typeof value.startDate === "string" ? value.startDate : "";
  const endDate = typeof value.endDate === "string" ? value.endDate : "";
  if (!isValidDate(startDate)) details.startDate = "開始日を入力してください。";
  if (!isValidDate(endDate)) details.endDate = "終了日を入力してください。";
  if (isValidDate(startDate) && isValidDate(endDate) && startDate > endDate) details.date = "終了日は開始日以降にしてください。";

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

export class EventService {
  constructor(private readonly repository: EventRepository) {}

  create(userId: string, input: Partial<ScheduledEventInput>, now: string): Promise<Event> {
    return this.repository.create(userId, validateScheduledEventInput(input), now);
  }

  async update(userId: string, id: string, patch: Partial<ScheduledEventInput>, now: string): Promise<Event> {
    const existing = await this.repository.getById(userId, id);
    if (!existing) throw notFoundError();
    const input = validateScheduledEventInput({ ...existing, ...patch });
    const updated = await this.repository.update(userId, id, input, now);
    if (!updated) throw notFoundError();
    return updated;
  }

  async delete(userId: string, id: string, now: string): Promise<void> {
    if (!await this.repository.softDelete(userId, id, now)) throw notFoundError();
  }
}
