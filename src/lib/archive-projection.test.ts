import { describe, expect, it } from "vitest";
import type { Event, MoneyItem, RecurrenceRule } from "../worker/types";
import type { ArchiveRecord } from "./archive";
import { archiveEventsForRange, archiveMoneyForRange, archiveSearchEvents, mergeMoneyProjections, mergeProjectedEvents } from "./archive-projection";
import type { MoneyProjection } from "../api/client";

const userId = "user-1";
const boundary = "2026-09-01";
const rule: RecurrenceRule = { id: "rule-1", userId, frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2026-08-01", endsOn: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const event = (title: string, startTime: string): Event => ({ id: "event-1", userId, category: "work", title, place: null, memo: null, timingType: "scheduled", allDay: false, startDate: "2026-08-01", startTime, endDate: "2026-08-01", endTime: null, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: rule.id, active: true, deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const moneyItem = (plannedAmount: number): MoneyItem => ({ id: "money-1", userId, type: "expense", title: "家賃", categoryId: "category-1", plannedAmount, date: "2026-08-01", time: null, recurrenceRuleId: rule.id, memo: null, active: true, deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const rowsFor = (snapshotEvent: Event, snapshotMoney: MoneyItem): ArchiveRecord[] => [
  { type: "event", id: snapshotEvent.id, userId, record: snapshotEvent, recordDate: snapshotEvent.startDate ?? undefined, archiveBatchId: "batch-1", retentionBoundary: boundary },
  { type: "recurrence_rule", id: rule.id, userId, record: rule, recordDate: rule.startsOn, archiveBatchId: "batch-1", retentionBoundary: boundary },
  { type: "money_item", id: snapshotMoney.id, userId, record: snapshotMoney, recordDate: snapshotMoney.date, archiveBatchId: "batch-1", retentionBoundary: boundary },
  { type: "money_category", id: "category-1", userId, record: { id: "category-1", userId, type: "expense", name: "住居", colorKey: null, sortOrder: 0, active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, archiveBatchId: "batch-1", retentionBoundary: boundary },
  { type: "money_settlement", id: "settlement-1", userId, record: { id: "settlement-1", userId, moneyItemId: "money-1", occurrenceKey: "money:money-1:2026-08-01", status: "actual", amount: 65000, finalizedAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", estimatedAmount: null }, recordDate: "2026-08-01", archiveBatchId: "batch-1", retentionBoundary: boundary }
];

describe("archive projection authority and range", () => {
  const rows = rowsFor(event("旧週次レビュー", "10:00"), moneyItem(70000));

  it("clamps active event snapshots before the batch boundary and gives D1 authority on duplicate identity", () => {
    const archived = archiveEventsForRange(rows, userId, { startDate: "2026-08-01", endDate: "2026-08-31" }, 1);
    expect(archived).toHaveLength(1);
    expect(archived[0].title).toBe("旧週次レビュー");
    expect(archiveEventsForRange(rows, userId, { startDate: "2026-09-01", endDate: "2026-10-31" }, 1)).toHaveLength(0);

    const current = { ...archived[0], title: "新週次レビュー", startTime: "11:00" };
    const merged = mergeProjectedEvents([current], archived);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("新週次レビュー");
    expect(merged[0].startTime).toBe("11:00");
  });

  it("keeps old and current event titles in their respective authority ranges", () => {
    const archived = archiveEventsForRange(rows, userId, { startDate: "2026-08-01", endDate: "2026-08-31" }, 1);
    const current = { ...archived[0], title: "新週次レビュー", startDate: "2026-10-01", endDate: "2026-10-01", startTime: "11:00", occurrenceKey: "event:event-1:2026-10-01T11:00" };
    const merged = mergeProjectedEvents([current], archived);
    expect(merged.map((item) => item.title)).toEqual(["旧週次レビュー", "新週次レビュー"]);
  });

  it("does not project an active money snapshot into current or future months", () => {
    const archived = archiveMoneyForRange(rows, userId, { startDate: "2026-08-01", endDate: "2026-08-31" }, 1);
    expect(archived).toHaveLength(1);
    expect(archived[0].effectiveAmount).toBe(65000);
    expect(archiveMoneyForRange(rows, userId, { startDate: "2026-09-01", endDate: "2026-10-31" }, 1)).toHaveLength(0);

    const current = { ...archived[0], date: "2026-10-01", plannedAmount: 80000, effectiveAmount: 80000, effectivePlannedAmount: 80000, basePlannedAmount: 80000, signedAmount: -80000, occurrenceKey: "money:money-1:2026-10-01" };
    const server = { occurrences: [current], summary: { expenseForecast: 80000, incomeForecast: 0, remaining: -80000 }, days: [] } as MoneyProjection;
    const merged = mergeMoneyProjections(server, archived);
    expect(merged.occurrences.map((item) => item.effectiveAmount)).toEqual([65000, 80000]);
    expect(merged.occurrences.find((item) => item.date === "2026-10-01")?.plannedAmount).toBe(80000);
  });

  it("searches only archive-period occurrences and does not generate future results from snapshots", () => {
    const oldResults = archiveSearchEvents(rows, userId, "旧週次レビュー", 1);
    expect(oldResults).toHaveLength(1);
    expect(oldResults[0].occurrenceDate).toBe("2026-08-01");
    expect(archiveSearchEvents(rows, userId, "旧週次レビュー", 1).every((item) => item.occurrenceDate < boundary)).toBe(true);
  });
});
