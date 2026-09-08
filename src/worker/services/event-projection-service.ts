import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import type { Event, EventOccurrenceOverride, RecurrenceRule } from "../types";
import { dateDifference, dateFromKey, dateKey, monthDayClamped, shiftDate, startOfWeek, weekdayOf } from "./recurrence-service";
export { isDateKey } from "./recurrence-service";

export type DateRange = { startDate: string; endDate: string };
export type ProjectedEvent = Event & { occurrenceKey: string | null; recurrence: RecurrenceRule | null };
type Definition = { event: Event; rule: RecurrenceRule | null; overrides: EventOccurrenceOverride[] };

const occurrenceKey = (eventId: string, startDate: string, startTime: string | null) => `event:${eventId}:${startDate}T${startTime ?? "00:00"}`;
export const stableOccurrenceKey = occurrenceKey;

const within = (date: string, range: DateRange) => date >= range.startDate && date <= range.endDate;
const eventOverlaps = (event: Event, range: DateRange) => event.startDate <= range.endDate && event.endDate >= range.startDate;

const dailyDates = (rule: RecurrenceRule, range: DateRange) => {
  const firstDate = rule.startsOn > range.startDate ? rule.startsOn : range.startDate;
  const lastDate = rule.endsOn && rule.endsOn < range.endDate ? rule.endsOn : range.endDate;
  if (firstDate > lastDate) return [];
  const offset = Math.max(0, dateDifference(rule.startsOn, firstDate));
  const firstAligned = shiftDate(firstDate, (rule.interval - (offset % rule.interval)) % rule.interval);
  const dates: string[] = [];
  for (let date = firstAligned; date <= lastDate; date = shiftDate(date, rule.interval)) dates.push(date);
  return dates;
};

const weeklyDates = (rule: RecurrenceRule, range: DateRange, weekStartsOn: number) => {
  const firstDate = rule.startsOn > range.startDate ? rule.startsOn : range.startDate;
  const lastDate = rule.endsOn && rule.endsOn < range.endDate ? rule.endsOn : range.endDate;
  if (firstDate > lastDate) return [];
  const anchorWeek = startOfWeek(rule.startsOn, weekStartsOn);
  const firstWeek = startOfWeek(firstDate, weekStartsOn);
  const lastWeek = startOfWeek(lastDate, weekStartsOn);
  const weekdays = rule.weekdays ?? [weekdayOf(rule.startsOn)];
  const dates: string[] = [];
  for (let week = firstWeek; week <= lastWeek; week = shiftDate(week, 7)) {
    const weekOffset = Math.floor(dateDifference(anchorWeek, week) / 7);
    if (weekOffset < 0 || weekOffset % rule.interval !== 0) continue;
    for (const weekday of weekdays) {
      const date = shiftDate(week, (weekday - weekStartsOn + 7) % 7);
      if (date >= rule.startsOn && within(date, { startDate: firstDate, endDate: lastDate })) dates.push(date);
    }
  }
  return dates.sort();
};

const nextMonth = (value: string) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
};

const monthlyDates = (rule: RecurrenceRule, range: DateRange) => {
  const firstMonth = `${range.startDate.slice(0, 7)}-01`;
  const lastMonth = `${range.endDate.slice(0, 7)}-01`;
  const anchorMonth = `${rule.startsOn.slice(0, 7)}-01`;
  const targetDay = rule.dayOfMonth ?? Number(rule.startsOn.slice(-2));
  const dates: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    const year = Number(month.slice(0, 4));
    const monthIndex = Number(month.slice(5, 7)) - 1;
    const monthOffset = (year - Number(anchorMonth.slice(0, 4))) * 12 + monthIndex - (Number(anchorMonth.slice(5, 7)) - 1);
    if (monthOffset < 0 || monthOffset % rule.interval !== 0) continue;
    const date = `${month.slice(0, 7)}-${String(monthDayClamped(year, monthIndex, targetDay)).padStart(2, "0")}`;
    if (date >= rule.startsOn && (!rule.endsOn || date <= rule.endsOn) && within(date, range)) dates.push(date);
  }
  return dates;
};

export const occurrenceDates = (rule: RecurrenceRule, range: DateRange, weekStartsOn = 1) => {
  if (rule.frequency === "daily") return dailyDates(rule, range);
  if (rule.frequency === "weekly") return weeklyDates(rule, range, weekStartsOn);
  return monthlyDates(rule, range);
};

const applyOverride = (event: Event, override: EventOccurrenceOverride | undefined): Event | null => {
  if (!override || override.overrideType === "cancelled") return override ? null : event;
  return { ...event, ...(override.patch ?? {}) };
};

export const projectDefinitions = (definitions: Definition[], range: DateRange, weekStartsOn = 1): ProjectedEvent[] => definitions.flatMap<ProjectedEvent>(({ event, rule, overrides }) => {
  if (!rule) return eventOverlaps(event, range) ? [{ ...event, occurrenceKey: null, recurrence: null }] : [];
  const overrideByKey = new Map(overrides.map((override) => [override.occurrenceKey, override]));
  const duration = Math.max(0, dateDifference(event.startDate, event.endDate));
  const projectionRange = { startDate: shiftDate(range.startDate, -duration), endDate: range.endDate };
  const projectDate = (date: string, override: EventOccurrenceOverride | undefined) => {
    const base = { ...event, startDate: date, endDate: shiftDate(date, duration), occurrenceKey: occurrenceKey(event.id, date, event.startTime), recurrence: rule };
    const projected = applyOverride(base, override);
    if (!projected || !eventOverlaps(projected, range)) return [];
    return [{ ...projected, occurrenceKey: base.occurrenceKey, recurrence: rule }];
  };
  const generated = occurrenceDates(rule, projectionRange, weekStartsOn).flatMap((date) => projectDate(date, overrideByKey.get(occurrenceKey(event.id, date, event.startTime))));
  const generatedKeys = new Set(generated.map((item) => item.occurrenceKey));
  const movedOverrides = overrides.flatMap((override) => {
    if (override.overrideType !== "modified" || !override.patch?.startDate || generatedKeys.has(override.occurrenceKey)) return [];
    const originalDate = override.occurrenceKey.slice(`event:${event.id}:`.length, 10 + `event:${event.id}:`.length);
    return projectDate(originalDate, override);
  });
  return [...generated, ...movedOverrides];
});

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
  constructor(private readonly repository: EventRepository, private readonly recurrenceRepository: RecurrenceRepository, private readonly overrideRepository: EventOccurrenceOverrideRepository) {}

  async project(userId: string, range: DateRange, options: { timezone?: string; weekStartsOn?: number } = {}): Promise<ProjectedEvent[]> {
    const events = await this.repository.listForRange(userId, range.startDate, range.endDate);
    const definitions = await Promise.all(events.map(async (event) => ({
      event,
      rule: event.recurrenceRuleId ? await this.recurrenceRepository.getById(userId, event.recurrenceRuleId) : null,
      overrides: event.recurrenceRuleId ? await this.overrideRepository.listForEvent(userId, event.id) : []
    })));
    return projectDefinitions(definitions, range, options.weekStartsOn ?? 1).sort((left, right) => `${left.startDate}T${left.startTime ?? "00:00"}`.localeCompare(`${right.startDate}T${right.startTime ?? "00:00"}`));
  }
}
