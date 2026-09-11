import { projectDefinitions, type DateRange, type ProjectedEvent } from "../worker/services/event-projection-service";
import { moneySummaryFor, projectMoneyItems, type MoneyOccurrence } from "../worker/services/money-service";
import type { DailyNote, Event, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, RecurrenceRule } from "../worker/types";
import type { Event as ApiEvent, MoneyProjection as ApiMoneyProjection } from "../api/client";
import type { ArchiveRecord } from "./archive";

const recordsOf = <T>(rows: ArchiveRecord[], type: ArchiveRecord["type"]) => rows.filter((row) => row.type === type).map((row) => row.record as T);
const dateShift = (value: string, amount: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const archiveBatchGroups = (rows: ArchiveRecord[]) => {
  const groups = new Map<string, { rows: ArchiveRecord[]; retentionBoundary: string }>();
  for (const row of rows) {
    if (!row.archiveBatchId || !row.retentionBoundary) continue;
    const group = groups.get(row.archiveBatchId) ?? { rows: [], retentionBoundary: row.retentionBoundary };
    group.rows.push(row);
    groups.set(row.archiveBatchId, group);
  }
  return [...groups.values()].sort((left, right) => left.retentionBoundary.localeCompare(right.retentionBoundary));
};
const archiveRangeForBatch = (range: DateRange, retentionBoundary: string): DateRange | null => {
  const endDate = dateShift(retentionBoundary, -1);
  if (range.startDate > endDate) return null;
  return { startDate: range.startDate, endDate: range.endDate < endDate ? range.endDate : endDate };
};
const eventIdentity = (event: { id: string; occurrenceKey?: string | null; startDate?: string | null; periodStartDate?: string | null }) => `${event.id}:${event.occurrenceKey ?? "single"}:${event.startDate ?? event.periodStartDate ?? ""}`;
const moneyIdentity = (item: { id: string; occurrenceKey?: string | null; date: string }) => `${item.id}:${item.occurrenceKey ?? item.date}`;
const eventAuthorityDate = (event: { timingType?: string; startDate?: string | null; endDate?: string | null; periodStartDate?: string | null; periodEndDate?: string | null }) => event.timingType === "period" ? event.periodEndDate ?? event.endDate ?? event.periodStartDate ?? event.startDate : event.startDate;

export const archiveEventsForRange = (rows: ArchiveRecord[], userId: string, range: DateRange, weekStartsOn: number): ProjectedEvent[] => {
  return archiveBatchGroups(rows).flatMap((batch) => {
    const batchRange = archiveRangeForBatch(range, batch.retentionBoundary);
    if (!batchRange) return [];
    const events = recordsOf<Event>(batch.rows, "event").filter((event) => event.userId === userId && event.active && !event.deletedAt);
    const rules = new Map(recordsOf<RecurrenceRule>(batch.rows, "recurrence_rule").filter((rule) => rule.userId === userId).map((rule) => [rule.id, rule]));
    const overrides = recordsOf<EventOccurrenceOverride>(batch.rows, "event_override").filter((override) => override.userId === userId);
    return projectDefinitions(events.map((event) => ({ event, rule: event.recurrenceRuleId ? (rules.get(event.recurrenceRuleId) ?? null) : null, overrides: overrides.filter((override) => override.eventId === event.id) })), batchRange, weekStartsOn);
  }).sort((left, right) => `${left.startDate ?? "9999-12-31"}T${left.startTime ?? left.deadlineTime ?? "00:00"}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.startDate ?? "9999-12-31"}T${right.startTime ?? right.deadlineTime ?? "00:00"}:${right.id}:${right.occurrenceKey ?? ""}`));
};

export const archiveDailyNoteForDate = (rows: ArchiveRecord[], userId: string, date: string): DailyNote | null => archiveBatchGroups(rows).flatMap((batch) => recordsOf<DailyNote>(batch.rows, "daily_note").filter((note) => note.userId === userId && note.date === date && note.date < batch.retentionBoundary)).at(-1) ?? null;

export const archiveMoneyForRange = (rows: ArchiveRecord[], userId: string, range: DateRange, weekStartsOn: number): MoneyOccurrence[] => {
  return archiveBatchGroups(rows).flatMap((batch) => {
    const batchRange = archiveRangeForBatch(range, batch.retentionBoundary);
    if (!batchRange) return [];
    const items = recordsOf<MoneyItem>(batch.rows, "money_item").filter((item) => item.userId === userId && item.active && !item.deletedAt);
    const rules = new Map(recordsOf<RecurrenceRule>(batch.rows, "recurrence_rule").filter((rule) => rule.userId === userId).map((rule) => [rule.id, rule]));
    const overrides = recordsOf<MoneyOccurrenceOverride>(batch.rows, "money_override").filter((override) => override.userId === userId);
    const settlements = recordsOf<MoneyOccurrenceSettlement>(batch.rows, "money_settlement").filter((settlement) => settlement.userId === userId);
    const categories = recordsOf<MoneyCategory>(batch.rows, "money_category").filter((category) => category.userId === userId);
    return projectMoneyItems(items.map((item) => ({ item, rule: item.recurrenceRuleId ? (rules.get(item.recurrenceRuleId) ?? null) : null, overrides: overrides.filter((override) => override.moneyItemId === item.id) })), categories, batchRange.startDate, batchRange.endDate, weekStartsOn, overrides, settlements, "9999-12");
  }).sort((left, right) => `${left.date}:${left.id}:${left.occurrenceKey}`.localeCompare(`${right.date}:${right.id}:${right.occurrenceKey}`));
};

export const mergeProjectedEvents = (serverEvents: ApiEvent[], archivedEvents: ProjectedEvent[], retentionBoundary?: string): ApiEvent[] => {
  const result = new Map<string, ApiEvent>();
  const localAuthorityKeys = new Set(archivedEvents.filter((event) => { const date = eventAuthorityDate(event); return Boolean(retentionBoundary && date && date < retentionBoundary); }).map(eventIdentity));
  archivedEvents.forEach((event) => result.set(eventIdentity(event), event));
  serverEvents.forEach((event) => { const key = eventIdentity(event); if (!localAuthorityKeys.has(key)) result.set(key, event); });
  return [...result.values()];
};

const projectionSummary = (occurrences: MoneyOccurrence[]) => {
  const summary = moneySummaryFor(occurrences);
  return { ...summary, confirmedExpense: occurrences.filter((item) => item.type === "expense" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), confirmedIncome: occurrences.filter((item) => item.type === "income" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), plannedExpense: occurrences.filter((item) => item.type === "expense" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0), plannedIncome: occurrences.filter((item) => item.type === "income" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0) };
};

export const mergeMoneyProjections = (server: ApiMoneyProjection, archived: MoneyOccurrence[], retentionBoundary?: string): ApiMoneyProjection => {
  const byKey = new Map<string, MoneyOccurrence>();
  const localAuthorityKeys = new Set(archived.filter((item) => Boolean(retentionBoundary && item.date < retentionBoundary)).map(moneyIdentity));
  archived.forEach((item) => byKey.set(moneyIdentity(item), item));
  server.occurrences.forEach((item) => { const key = moneyIdentity(item); if (!localAuthorityKeys.has(key)) byKey.set(key, item as MoneyOccurrence); });
  const occurrences = [...byKey.values()].sort((left, right) => `${left.date}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.date}:${right.id}:${right.occurrenceKey ?? ""}`));
  const days = [...new Set(occurrences.map((item) => item.date))].sort().map((date) => ({ date, ...projectionSummary(occurrences.filter((item) => item.date === date)) }));
  return { occurrences: occurrences as ApiMoneyProjection["occurrences"], summary: projectionSummary(occurrences), days };
};

export const archiveSearchEvents = (rows: ArchiveRecord[], userId: string, query: string, weekStartsOn: number, limit = 50) => {
  const normalized = query.trim().toLocaleLowerCase();
  const archiveResults = archiveBatchGroups(rows).flatMap((batch) => {
    const dates = batch.rows.map((row) => row.recordDate).filter((date): date is string => Boolean(date)).sort();
    if (dates.length === 0) return [];
    const range = { startDate: dates[0], endDate: dateShift(batch.retentionBoundary, -1) };
    return archiveEventsForRange(batch.rows, userId, range, weekStartsOn).flatMap((event) => {
    const fields = (["title", "place", "memo"] as const).filter((field) => Boolean(event[field]?.toLocaleLowerCase().includes(normalized)));
    if (fields.length === 0) return [];
    const occurrenceDate = event.timingType === "period" ? event.periodStartDate ?? event.startDate ?? dates[0] : event.startDate ?? dates[0];
    return [{ ...event, source: "archive" as const, eventId: event.id, occurrenceDate, matchContext: { fields, text: fields.find((field) => field !== "title") ? event[fields.find((field) => field !== "title") as "place" | "memo"] ?? undefined : undefined } }];
    });
  });
  const deduped = new Map<string, (typeof archiveResults)[number]>(archiveResults.map((event) => [eventIdentity(event), event]));
  return [...deduped.values()].sort((left, right) => `${left.occurrenceDate}:${left.id}:${left.occurrenceKey ?? ""}`.localeCompare(`${right.occurrenceDate}:${right.id}:${right.occurrenceKey ?? ""}`)).slice(0, limit);
};
