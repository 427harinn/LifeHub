import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { getLocalDate } from "../lib/date-time";
import type { Event, EventOccurrenceOverride, RecurrenceRule } from "../types";
import { dateDifference, dateFromKey, dateKey, monthDayClamped, shiftDate, startOfWeek, weekdayOf } from "./recurrence-service";
export { isDateKey } from "./recurrence-service";

export type DateRange = { startDate: string; endDate: string };
export type ProjectedEvent = Event & { occurrenceKey: string | null; recurrence: RecurrenceRule | null };
export type EventSearchResult = ProjectedEvent & { source: "server"; eventId: string; occurrenceDate: string; matchContext: { fields: Array<"title" | "place" | "memo">; text?: string } };
type Definition = { event: Event; rule: RecurrenceRule | null; overrides: EventOccurrenceOverride[] };
type PeriodRange = { startDate: string; endDate: string; occurrenceKey: string };

const scheduledOccurrenceKey = (eventId: string, startDate: string, startTime: string | null) => `event:${eventId}:${startDate}T${startTime ?? "00:00"}`;
export const stableOccurrenceKey = scheduledOccurrenceKey;
export const stablePeriodWeekOccurrenceKey = (eventId: string, weekStart: string) => `event:${eventId}:week:${weekStart}`;
export const stablePeriodMonthOccurrenceKey = (eventId: string, month: string) => `event:${eventId}:month:${month.slice(0, 7)}`;
export const stablePeriodRangeOccurrenceKey = (eventId: string, periodStartDate: string) => `event:${eventId}:range:${periodStartDate}`;

const within = (date: string, range: DateRange) => date >= range.startDate && date <= range.endDate;
const overlaps = (left: DateRange, right: DateRange) => left.startDate <= right.endDate && left.endDate >= right.startDate;
const eventOverlaps = (event: Event, range: DateRange) => event.timingType === "period"
  ? Boolean(event.periodStartDate && event.periodEndDate && overlaps({ startDate: event.periodStartDate, endDate: event.periodEndDate }, range))
  : Boolean(event.startDate && event.endDate && overlaps({ startDate: event.startDate, endDate: event.endDate }, range));

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

const nextMonthBy = (value: string, interval: number) => {
  let result = value;
  for (let index = 0; index < interval; index += 1) result = nextMonth(result);
  return result;
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

const addDays = (startDate: string, endDate: string, range: DateRange) => {
  const first = startDate > range.startDate ? startDate : range.startDate;
  const last = endDate < range.endDate ? endDate : range.endDate;
  const dates: string[] = [];
  if (first > last) return dates;
  for (let date = first; date <= last; date = shiftDate(date, 1)) dates.push(date);
  return dates;
};

const monthEnd = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${month.slice(0, 7)}-${String(monthDayClamped(year, monthIndex, 31)).padStart(2, "0")}`;
};

const periodRangeForEvent = (event: Event, weekStartsOn: number): PeriodRange | null => {
  if (event.periodWindowType === "this_week" && event.periodAnchorDate) {
    const startDate = startOfWeek(event.periodAnchorDate, weekStartsOn);
    return { startDate, endDate: shiftDate(startDate, 6), occurrenceKey: stablePeriodWeekOccurrenceKey(event.id, startDate) };
  }
  if (event.periodWindowType === "this_month" && event.periodAnchorDate) {
    const startDate = `${event.periodAnchorDate.slice(0, 7)}-01`;
    return { startDate, endDate: monthEnd(startDate), occurrenceKey: stablePeriodMonthOccurrenceKey(event.id, startDate) };
  }
  if (event.periodWindowType === "custom_range" && event.periodStartDate && event.periodEndDate) {
    return { startDate: event.periodStartDate, endDate: event.periodEndDate, occurrenceKey: stablePeriodRangeOccurrenceKey(event.id, event.periodStartDate) };
  }
  return null;
};

const recurringPeriodRanges = (event: Event, rule: RecurrenceRule, range: DateRange, weekStartsOn: number): PeriodRange[] => {
  if (event.periodWindowType === "this_week" && rule.frequency === "weekly" && event.periodAnchorDate) {
    const anchor = startOfWeek(event.periodAnchorDate, weekStartsOn);
    const firstWeek = startOfWeek(range.startDate, weekStartsOn);
    let candidate = anchor;
    if (candidate < firstWeek) {
      const offset = Math.floor(dateDifference(candidate, firstWeek) / 7);
      const remainder = offset % rule.interval;
      candidate = shiftDate(candidate, (offset + (remainder === 0 ? 0 : rule.interval - remainder)) * 7);
    }
    const result: PeriodRange[] = [];
    for (; candidate <= range.endDate; candidate = shiftDate(candidate, rule.interval * 7)) {
      if (rule.endsOn && candidate > rule.endsOn) break;
      const endDate = shiftDate(candidate, 6);
      if (overlaps({ startDate: candidate, endDate }, range)) result.push({ startDate: candidate, endDate, occurrenceKey: stablePeriodWeekOccurrenceKey(event.id, candidate) });
    }
    return result;
  }
  if (event.periodWindowType === "this_month" && rule.frequency === "monthly" && event.periodAnchorDate) {
    const anchor = `${event.periodAnchorDate.slice(0, 7)}-01`;
    const firstMonth = `${range.startDate.slice(0, 7)}-01`;
    let candidate = anchor;
    if (candidate < firstMonth) {
      const offset = (Number(firstMonth.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(firstMonth.slice(5, 7)) - Number(anchor.slice(5, 7));
      candidate = nextMonthBy(anchor, Math.max(0, Math.ceil(offset / rule.interval) * rule.interval));
    }
    const result: PeriodRange[] = [];
    for (; candidate <= range.endDate; candidate = nextMonthBy(candidate, rule.interval)) {
      if (rule.endsOn && candidate > rule.endsOn) break;
      const endDate = monthEnd(candidate);
      if (overlaps({ startDate: candidate, endDate }, range)) result.push({ startDate: candidate, endDate, occurrenceKey: stablePeriodMonthOccurrenceKey(event.id, candidate) });
    }
    return result;
  }
  return [];
};

const applyOverride = (event: Event, override: EventOccurrenceOverride | undefined): Event | null => {
  if (!override || override.overrideType === "cancelled") return override ? null : event;
  return { ...event, ...(override.patch ?? {}) };
};

const projectPeriodOccurrence = (event: Event, rule: RecurrenceRule | null, range: DateRange, weekStartsOn: number, override: EventOccurrenceOverride | undefined): ProjectedEvent[] => {
  const baseRanges = rule ? recurringPeriodRanges(event, rule, range, weekStartsOn) : (() => {
    const value = periodRangeForEvent(event, weekStartsOn);
    return value && overlaps(value, range) ? [value] : [];
  })();
  return baseRanges.flatMap((baseRange) => {
    const base = { ...event, startDate: baseRange.startDate, endDate: baseRange.endDate, allDay: true, startTime: null, endTime: null, periodAnchorDate: event.periodWindowType === "custom_range" ? null : baseRange.startDate, periodStartDate: baseRange.startDate, periodEndDate: baseRange.endDate, occurrenceKey: baseRange.occurrenceKey, recurrence: rule } as ProjectedEvent;
    const projected = applyOverride(base, override);
    if (!projected) return [];
    const modifiedRange = periodRangeForEvent(projected, weekStartsOn) ?? { startDate: projected.periodStartDate ?? baseRange.startDate, endDate: projected.periodEndDate ?? baseRange.endDate, occurrenceKey: baseRange.occurrenceKey };
    return addDays(modifiedRange.startDate, modifiedRange.endDate, range).map((date) => ({ ...projected, startDate: date, endDate: date, allDay: true, startTime: null, endTime: null, periodStartDate: modifiedRange.startDate, periodEndDate: modifiedRange.endDate, occurrenceKey: baseRange.occurrenceKey, recurrence: rule }));
  });
};

export const projectDefinitions = (definitions: Definition[], range: DateRange, weekStartsOn = 1): ProjectedEvent[] => definitions.flatMap<ProjectedEvent>(({ event, rule, overrides }) => {
  const overrideByKey = new Map(overrides.map((override) => [override.occurrenceKey, override]));
  if (event.timingType === "period") {
    const base = projectPeriodOccurrence(event, rule, range, weekStartsOn, undefined);
    return base.flatMap((item) => projectPeriodOccurrence(event, rule, range, weekStartsOn, overrideByKey.get(item.occurrenceKey ?? "")).filter((candidate) => candidate.occurrenceKey === item.occurrenceKey && candidate.startDate === item.startDate));
  }
  if (!rule) return eventOverlaps(event, range) ? [{ ...event, occurrenceKey: null, recurrence: null }] : [];
  const duration = Math.max(0, dateDifference(event.startDate ?? range.startDate, event.endDate ?? event.startDate ?? range.startDate));
  const projectionRange = { startDate: shiftDate(range.startDate, -duration), endDate: range.endDate };
  const projectDate = (date: string, override: EventOccurrenceOverride | undefined) => {
    const key = scheduledOccurrenceKey(event.id, date, event.startTime);
    const base = { ...event, startDate: date, endDate: shiftDate(date, duration), occurrenceKey: key, recurrence: rule };
    const projected = applyOverride(base, override);
    if (!projected || !eventOverlaps(projected, range)) return [];
    return [{ ...projected, occurrenceKey: key, recurrence: rule } as ProjectedEvent];
  };
  const generated = occurrenceDates(rule, projectionRange, weekStartsOn).flatMap((date) => projectDate(date, overrideByKey.get(scheduledOccurrenceKey(event.id, date, event.startTime))));
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

  private async hydrate(userId: string, events: Event[]): Promise<Definition[]> {
    const recurringEvents = events.filter((event) => event.recurrenceRuleId !== null);
    const ruleIds = [...new Set(recurringEvents.map((event) => event.recurrenceRuleId as string))];
    const eventIds = [...new Set(recurringEvents.map((event) => event.id))];
    const [rules, overrides] = await Promise.all([
      this.recurrenceRepository.listByIds(userId, ruleIds),
      this.overrideRepository.listForEvents(userId, eventIds)
    ]);
    const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
    const overridesByEventId = new Map<string, EventOccurrenceOverride[]>();
    for (const override of overrides) {
      const rows = overridesByEventId.get(override.eventId) ?? [];
      rows.push(override);
      overridesByEventId.set(override.eventId, rows);
    }
    return events.map((event) => ({
      event,
      rule: event.recurrenceRuleId ? ruleById.get(event.recurrenceRuleId) ?? null : null,
      overrides: event.recurrenceRuleId ? overridesByEventId.get(event.id) ?? [] : []
    }));
  }

  async project(userId: string, range: DateRange, options: { timezone?: string; weekStartsOn?: number } = {}): Promise<ProjectedEvent[]> {
    const events = await this.repository.listForRange(userId, range.startDate, range.endDate);
    const definitions = await this.hydrate(userId, events);
    return projectDefinitions(definitions, range, options.weekStartsOn ?? 1).sort((left, right) => `${left.startDate ?? "9999-12-31"}T${left.startTime ?? left.deadlineTime ?? "00:00"}`.localeCompare(`${right.startDate ?? "9999-12-31"}T${right.startTime ?? right.deadlineTime ?? "00:00"}`));
  }

  async projectEvent(userId: string, eventId: string, range: DateRange, options: { timezone?: string; weekStartsOn?: number } = {}): Promise<ProjectedEvent[]> {
    const event = await this.repository.getById(userId, eventId);
    if (!event) return [];
    const definitions = await this.hydrate(userId, [event]);
    return projectDefinitions(definitions, range, options.weekStartsOn ?? 1).sort((left, right) => `${left.startDate ?? "9999-12-31"}T${left.startTime ?? left.deadlineTime ?? "00:00"}`.localeCompare(`${right.startDate ?? "9999-12-31"}T${right.startTime ?? right.deadlineTime ?? "00:00"}`));
  }

  async search(userId: string, query: string, options: { timezone?: string; weekStartsOn?: number; limit?: number } = {}): Promise<EventSearchResult[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length < 2) return [];
    const limit = Math.max(1, Math.min(50, options.limit ?? 50));
    const today = getLocalDate(new Date(), options.timezone ?? "UTC");
    const range = { startDate: shiftDate(today, -1825), endDate: shiftDate(today, 1825) };
    const definitions = await this.repository.searchDefinitions(userId, normalized, 200);
    const hydrated = await this.hydrate(userId, definitions);
    const occurrenceByKey = new Map<string, ProjectedEvent>();
    for (const event of projectDefinitions(hydrated, range, options.weekStartsOn ?? 1)) {
      const fields = (["title", "place", "memo"] as const).filter((field) => Boolean(event[field]?.toLocaleLowerCase().includes(normalized)));
      if (fields.length === 0) continue;
      const key = event.occurrenceKey ?? `${event.id}:${event.startDate ?? event.periodStartDate ?? ""}`;
      const current = occurrenceByKey.get(key);
      if (!current || event.startDate === event.periodStartDate) occurrenceByKey.set(key, event);
    }
    return [...occurrenceByKey.values()].map((event) => {
      const occurrenceDate = event.timingType === "period" ? event.periodStartDate ?? event.startDate ?? today : event.startDate ?? today;
      const fields = (["title", "place", "memo"] as const).filter((field) => Boolean(event[field]?.toLocaleLowerCase().includes(normalized)));
      const contextField = fields.find((field) => field !== "title");
      return { ...event, source: "server" as const, eventId: event.id, occurrenceDate, matchContext: { fields, text: contextField ? event[contextField] ?? undefined : undefined } };
    }).sort((left, right) => {
      const distance = Math.abs(dateDifference(today, left.occurrenceDate)) - Math.abs(dateDifference(today, right.occurrenceDate));
      return distance || `${left.occurrenceDate}T${left.startTime ?? left.deadlineTime ?? "00:00"}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.occurrenceDate}T${right.startTime ?? right.deadlineTime ?? "00:00"}:${right.id}:${right.occurrenceKey ?? ""}`);
    }).slice(0, limit);
  }
}
