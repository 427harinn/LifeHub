import { EventRepository } from "../repositories/event-repository";
import type { Event } from "../types";

export type DateRange = { startDate: string; endDate: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateFromKey = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export const isDateKey = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = dateFromKey(value);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
};

export const monthKeyToGridRange = (month: string): DateRange | null => {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const firstOfMonth = dateFromKey(`${month}-01`);
  const expectedMonth = Number(month.slice(5, 7)) - 1;
  if (Number.isNaN(firstOfMonth.getTime()) || firstOfMonth.getUTCMonth() !== expectedMonth) return null;
  const firstWeekday = firstOfMonth.getUTCDay();
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - firstWeekday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 41);
  return { startDate: dateKey(start), endDate: dateKey(end) };
};

export const dayToRange = (date: string): DateRange => ({ startDate: date, endDate: date });

export class EventProjectionService {
  constructor(private readonly repository: EventRepository) {}

  project(userId: string, range: DateRange): Promise<Event[]> {
    return this.repository.listForRange(userId, range.startDate, range.endDate);
  }
}
