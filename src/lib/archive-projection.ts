import { projectDefinitions, type DateRange, type ProjectedEvent } from "../worker/services/event-projection-service";
import { moneySummaryFor, projectMoneyItems, type MoneyOccurrence } from "../worker/services/money-service";
import type { DailyNote, Event, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, RecurrenceRule } from "../worker/types";
import type { Event as ApiEvent, MoneyProjection as ApiMoneyProjection } from "../api/client";
import type { ArchiveRecord } from "./archive";

const recordsOf = <T>(rows: ArchiveRecord[], type: ArchiveRecord["type"]) => rows.filter((row) => row.type === type).map((row) => row.record as T);
const dateShift = (value: string, amount: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };

export const archiveEventsForRange = (rows: ArchiveRecord[], userId: string, range: DateRange, weekStartsOn: number): ProjectedEvent[] => {
  const events = recordsOf<Event>(rows, "event").filter((event) => event.userId === userId && event.active && !event.deletedAt);
  const rules = new Map(recordsOf<RecurrenceRule>(rows, "recurrence_rule").filter((rule) => rule.userId === userId).map((rule) => [rule.id, rule]));
  const overrides = recordsOf<EventOccurrenceOverride>(rows, "event_override").filter((override) => override.userId === userId);
  return projectDefinitions(events.map((event) => ({ event, rule: event.recurrenceRuleId ? (rules.get(event.recurrenceRuleId) ?? null) : null, overrides: overrides.filter((override) => override.eventId === event.id) })), range, weekStartsOn).sort((left, right) => `${left.startDate ?? "9999-12-31"}T${left.startTime ?? left.deadlineTime ?? "00:00"}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.startDate ?? "9999-12-31"}T${right.startTime ?? right.deadlineTime ?? "00:00"}:${right.id}:${right.occurrenceKey ?? ""}`));
};

export const archiveDailyNoteForDate = (rows: ArchiveRecord[], userId: string, date: string): DailyNote | null => recordsOf<DailyNote>(rows, "daily_note").find((note) => note.userId === userId && note.date === date) ?? null;

export const archiveMoneyForRange = (rows: ArchiveRecord[], userId: string, range: DateRange, weekStartsOn: number): MoneyOccurrence[] => {
  const items = recordsOf<MoneyItem>(rows, "money_item").filter((item) => item.userId === userId && item.active && !item.deletedAt);
  const rules = new Map(recordsOf<RecurrenceRule>(rows, "recurrence_rule").filter((rule) => rule.userId === userId).map((rule) => [rule.id, rule]));
  const overrides = recordsOf<MoneyOccurrenceOverride>(rows, "money_override").filter((override) => override.userId === userId);
  const settlements = recordsOf<MoneyOccurrenceSettlement>(rows, "money_settlement").filter((settlement) => settlement.userId === userId);
  const categories = recordsOf<MoneyCategory>(rows, "money_category").filter((category) => category.userId === userId);
  return projectMoneyItems(items.map((item) => ({ item, rule: item.recurrenceRuleId ? (rules.get(item.recurrenceRuleId) ?? null) : null, overrides: overrides.filter((override) => override.moneyItemId === item.id) })), categories, range.startDate, range.endDate, weekStartsOn, overrides, settlements, "9999-12");
};

export const mergeProjectedEvents = (serverEvents: ApiEvent[], archivedEvents: ProjectedEvent[]): ApiEvent[] => {
  const result = new Map<string, ApiEvent>();
  archivedEvents.forEach((event) => result.set(`${event.occurrenceKey ?? event.id}:${event.startDate ?? event.periodStartDate ?? ""}`, event));
  serverEvents.forEach((event) => { const key = `${event.occurrenceKey ?? event.id}:${event.startDate ?? event.periodStartDate ?? ""}`; if (!result.has(key)) result.set(key, event); });
  return [...result.values()];
};

const projectionSummary = (occurrences: MoneyOccurrence[]) => {
  const summary = moneySummaryFor(occurrences);
  return { ...summary, confirmedExpense: occurrences.filter((item) => item.type === "expense" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), confirmedIncome: occurrences.filter((item) => item.type === "income" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), plannedExpense: occurrences.filter((item) => item.type === "expense" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), plannedIncome: occurrences.filter((item) => item.type === "income" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0) };
};

export const mergeMoneyProjections = (server: ApiMoneyProjection, archived: MoneyOccurrence[]): ApiMoneyProjection => {
  const byKey = new Map<string, MoneyOccurrence>();
  archived.forEach((item) => byKey.set(item.occurrenceKey ?? `${item.id}:${item.date}`, item));
  server.occurrences.forEach((item) => { const key = item.occurrenceKey ?? `${item.id}:${item.date}`; if (!byKey.has(key)) byKey.set(key, item as MoneyOccurrence); });
  const occurrences = [...byKey.values()].sort((left, right) => `${left.date}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.date}:${right.id}:${right.occurrenceKey ?? ""}`));
  const days = [...new Set(occurrences.map((item) => item.date))].sort().map((date) => ({ date, ...projectionSummary(occurrences.filter((item) => item.date === date)) }));
  return { occurrences: occurrences as ApiMoneyProjection["occurrences"], summary: projectionSummary(occurrences), days };
};

export const archiveSearchEvents = (rows: ArchiveRecord[], userId: string, query: string, weekStartsOn: number, limit = 50) => {
  const eventRows = rows.filter((row) => row.type === "event");
  const dates = eventRows.map((row) => row.recordDate).filter((date): date is string => Boolean(date)).sort();
  if (dates.length === 0) return [];
  const range = { startDate: dates[0], endDate: dateShift(dates.at(-1) as string, 1825) };
  const normalized = query.trim().toLocaleLowerCase();
  return archiveEventsForRange(rows, userId, range, weekStartsOn).flatMap((event) => {
    const fields = (["title", "place", "memo"] as const).filter((field) => Boolean(event[field]?.toLocaleLowerCase().includes(normalized)));
    if (fields.length === 0) return [];
    const occurrenceDate = event.timingType === "period" ? event.periodStartDate ?? event.startDate ?? dates[0] : event.startDate ?? dates[0];
    return [{ ...event, source: "archive" as const, eventId: event.id, occurrenceDate, matchContext: { fields, text: fields.find((field) => field !== "title") ? event[fields.find((field) => field !== "title") as "place" | "memo"] ?? undefined : undefined } }];
  }).sort((left, right) => `${left.occurrenceDate}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.occurrenceDate}:${right.id}:${right.occurrenceKey ?? ""}`)).slice(0, limit);
};
