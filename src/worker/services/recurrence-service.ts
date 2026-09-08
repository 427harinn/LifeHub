import { validationError } from "../lib/errors";
import type { RecurrenceRuleInput } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dateFromKey = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export const isDateKey = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = dateFromKey(value);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
};

export const shiftDate = (value: string, amount: number) => {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
};

export const dateDifference = (from: string, to: string) => Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86_400_000);
export const weekdayOf = (value: string) => dateFromKey(value).getUTCDay();

const recurrenceDetails = (value: Partial<RecurrenceRuleInput>, startsOnFallback: string): RecurrenceRuleInput => {
  const details: Record<string, string> = {};
  const frequency = value.frequency;
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") details.frequency = "繰り返しの種類が不正です。";
  const interval = value.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) details.interval = "繰り返し間隔が不正です。";
  const startsOn = value.startsOn ?? startsOnFallback;
  if (!isDateKey(startsOn)) details.startsOn = "繰り返し開始日が不正です。";
  const endsOn = value.endsOn ?? null;
  if (endsOn !== null && (!isDateKey(endsOn) || isDateKey(startsOn) && endsOn < startsOn)) details.endsOn = "繰り返し終了日が不正です。";

  let weekdays = value.weekdays ?? null;
  let dayOfMonth = value.dayOfMonth ?? null;
  if (frequency === "weekly") {
    weekdays = weekdays && weekdays.length > 0 ? [...new Set(weekdays)].sort((a, b) => a - b) : [weekdayOf(startsOn)];
    if (weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)) details.weekdays = "曜日が不正です。";
    dayOfMonth = null;
  } else if (frequency === "monthly") {
    dayOfMonth = dayOfMonth ?? Number(startsOn.slice(-2));
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) details.dayOfMonth = "月の日付が不正です。";
    weekdays = null;
  } else {
    weekdays = null;
    dayOfMonth = null;
  }
  if (Object.keys(details).length > 0) throw validationError(details);
  return { frequency: frequency ?? "daily", interval, weekdays, dayOfMonth, startsOn, endsOn };
};

export const normalizeRecurrenceInput = (value: unknown, startsOnFallback: string): RecurrenceRuleInput | null => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError({ recurrence: "繰り返し設定が不正です。" });
  return recurrenceDetails(value, startsOnFallback);
};

export const startOfWeek = (value: string, weekStartsOn: number) => shiftDate(value, -((weekdayOf(value) - weekStartsOn + 7) % 7));

export const monthDayClamped = (year: number, monthIndex: number, day: number) => {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
};
