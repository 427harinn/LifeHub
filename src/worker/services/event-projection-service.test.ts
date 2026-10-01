import { describe, expect, it, vi } from "vitest";
import type { Event, EventOccurrenceOverride, RecurrenceRule } from "../types";
import { dayToRange, isDateKey, monthKeyToGridRange, projectDefinitions, stableOccurrenceKey, stablePeriodMonthOccurrenceKey, stablePeriodRangeOccurrenceKey, stablePeriodWeekOccurrenceKey } from "./event-projection-service";
import { occurrenceDates } from "./event-projection-service";
import { EventProjectionService } from "./event-projection-service";

const event: Event = {
  id: "event-1", userId: "user-1", category: "home", title: "薬", place: null, memo: null, timingType: "scheduled", allDay: false,
  startDate: "2026-09-01", startTime: "08:00", endDate: "2026-09-01", endTime: "08:30", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: "rule-1", active: true,
  deletedAt: null, createdAt: "", updatedAt: ""
};

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: "rule-1", userId: "user-1", frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-01", endsOn: null, createdAt: "", updatedAt: "", ...overrides
});

const periodEvent = (overrides: Partial<Event> = {}): Event => ({
  ...event, id: "period-1", title: "書類を整理", timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null,
  periodWindowType: "this_week", periodAnchorDate: "2026-09-10", periodStartDate: null, periodEndDate: null, deadlineTime: "21:00", recurrenceRuleId: null, ...overrides
});

describe("scheduled recurrence projection", () => {
  it("bulk hydrates recurring definitions using unique rule and event IDs", async () => {
    const events = [event, { ...event, id: "event-2" }, { ...event, id: "event-3", recurrenceRuleId: null }];
    const listForRange = vi.fn(() => Promise.resolve(events));
    const listByIds = vi.fn(() => Promise.resolve([rule()]));
    const listForEvents = vi.fn(() => Promise.resolve([]));
    const service = Object.create(EventProjectionService.prototype) as EventProjectionService;
    Object.assign(service, {
      repository: { listForRange },
      recurrenceRepository: { listByIds, getById: vi.fn() },
      overrideRepository: { listForEvents, listForEvent: vi.fn() }
    });

    await service.project("user-1", { startDate: "2026-09-01", endDate: "2026-09-01" });

    expect(listByIds).toHaveBeenCalledTimes(1);
    expect(listByIds).toHaveBeenCalledWith("user-1", ["rule-1"]);
    expect(listForEvents).toHaveBeenCalledTimes(1);
    expect(listForEvents).toHaveBeenCalledWith("user-1", ["event-1", "event-2"]);
  });

  it("requests the six-week Calendar grid range around the month", () => {
    expect(monthKeyToGridRange("2026-09")).toEqual({ startDate: "2026-08-30", endDate: "2026-10-10" });
  });

  it("keeps Daily projection to the requested date", () => {
    expect(dayToRange("2026-09-08")).toEqual({ startDate: "2026-09-08", endDate: "2026-09-08" });
  });

  it("rejects malformed and impossible dates", () => {
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-09-08")).toBe(true);
    expect(monthKeyToGridRange("2026-13")).toBeNull();
  });

  it("projects daily and every-two-days rules", () => {
    expect(occurrenceDates(rule(), { startDate: "2026-09-01", endDate: "2026-09-05" })).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(occurrenceDates(rule({ interval: 2 }), { startDate: "2026-09-01", endDate: "2026-09-06" })).toEqual(["2026-09-01", "2026-09-03", "2026-09-05"]);
  });

  it("projects weekly rules with multiple weekdays and a two-week interval", () => {
    expect(occurrenceDates(rule({ frequency: "weekly", weekdays: [1, 3], startsOn: "2026-09-07" }), { startDate: "2026-09-01", endDate: "2026-09-20" })).toEqual(["2026-09-07", "2026-09-09", "2026-09-14", "2026-09-16"]);
    expect(occurrenceDates(rule({ frequency: "weekly", interval: 2, weekdays: [1, 3], startsOn: "2026-09-07" }), { startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual(["2026-09-07", "2026-09-09", "2026-09-21", "2026-09-23"]);
  });

  it("clamps monthly day 31 to the last day of short months", () => {
    expect(occurrenceDates(rule({ frequency: "monthly", dayOfMonth: 31, startsOn: "2026-01-31" }), { startDate: "2026-01-01", endDate: "2026-04-30" })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("honours startsOn, endsOn, month boundaries, and timezone-independent date arithmetic", () => {
    expect(occurrenceDates(rule({ startsOn: "2026-09-10", endsOn: "2026-09-12" }), { startDate: "2026-09-01", endDate: "2026-10-01" })).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
    const projected = projectDefinitions([{ event, rule: rule({ startsOn: "2026-09-30" }), overrides: [] }], { startDate: "2026-09-30", endDate: "2026-10-01" });
    expect(projected.map((item) => item.startDate)).toEqual(["2026-09-30", "2026-10-01"]);
  });

  it("keeps occurrenceKey stable and applies modified/cancelled overrides", () => {
    const key = stableOccurrenceKey("event-1", "2026-09-15", "08:00");
    const overrides: EventOccurrenceOverride[] = [
      { id: "override-1", userId: "user-1", eventId: "event-1", occurrenceKey: key, overrideType: "modified", patch: { title: "薬（変更）" }, createdAt: "", updatedAt: "" },
      { id: "override-2", userId: "user-1", eventId: "event-1", occurrenceKey: stableOccurrenceKey("event-1", "2026-09-16", "08:00"), overrideType: "cancelled", patch: null, createdAt: "", updatedAt: "" }
    ];
    const first = projectDefinitions([{ event, rule: rule(), overrides }], { startDate: "2026-09-15", endDate: "2026-09-16" });
    const second = projectDefinitions([{ event, rule: rule(), overrides }], { startDate: "2026-09-15", endDate: "2026-09-16" });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ occurrenceKey: key, title: "薬（変更）" });
    expect(first[0].occurrenceKey).toBe(second[0].occurrenceKey);
  });

  it("keeps a one-off occurrence visible when its date is moved", () => {
    const key = stableOccurrenceKey("event-1", "2026-09-15", "08:00");
    const moved = projectDefinitions([{ event, rule: rule(), overrides: [{ id: "override-move", userId: "user-1", eventId: "event-1", occurrenceKey: key, overrideType: "modified", patch: { startDate: "2026-09-20", endDate: "2026-09-20", startTime: "12:00", endTime: "12:30" }, createdAt: "", updatedAt: "" }] }], { startDate: "2026-09-20", endDate: "2026-09-20" });
    expect(moved.find((item) => item.occurrenceKey === key)).toMatchObject({ startDate: "2026-09-20", startTime: "12:00" });
  });

  it("projects period windows on every Daily/Date Sheet date while keeping stable keys", () => {
    const week = projectDefinitions([{ event: periodEvent(), rule: null, overrides: [] }], { startDate: "2026-09-07", endDate: "2026-09-13" });
    expect(week).toHaveLength(7);
    expect(week.map((item) => item.startDate)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(new Set(week.map((item) => item.occurrenceKey))).toEqual(new Set([stablePeriodWeekOccurrenceKey("period-1", "2026-09-07")]));
    for (const date of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]) {
      expect(projectDefinitions([{ event: periodEvent(), rule: null, overrides: [] }], dayToRange(date))).toMatchObject([{ startDate: date, endDate: date, periodStartDate: "2026-09-07", periodEndDate: "2026-09-13" }]);
    }
    const month = projectDefinitions([{ event: periodEvent({ id: "period-month", periodWindowType: "this_month", periodAnchorDate: "2026-09-10" }), rule: null, overrides: [] }], { startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(month).toHaveLength(30);
    expect(month[0].occurrenceKey).toBe(stablePeriodMonthOccurrenceKey("period-month", "2026-09"));
    expect(projectDefinitions([{ event: periodEvent({ id: "period-month", periodWindowType: "this_month", periodAnchorDate: "2026-09-10" }), rule: null, overrides: [] }], dayToRange("2026-09-15"))).toMatchObject([{ startDate: "2026-09-15", endDate: "2026-09-15", periodStartDate: "2026-09-01", periodEndDate: "2026-09-30" }]);
    const custom = projectDefinitions([{ event: periodEvent({ id: "period-range", periodWindowType: "custom_range", periodAnchorDate: null, periodStartDate: "2026-09-10", periodEndDate: "2026-09-12" }), rule: null, overrides: [] }], { startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(custom.map((item) => item.startDate)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
    expect(custom[0].occurrenceKey).toBe(stablePeriodRangeOccurrenceKey("period-range", "2026-09-10"));
    expect(projectDefinitions([{ event: periodEvent({ id: "period-range", periodWindowType: "custom_range", periodAnchorDate: null, periodStartDate: "2026-09-10", periodEndDate: "2026-09-12" }), rule: null, overrides: [] }], dayToRange("2026-09-11"))).toMatchObject([{ startDate: "2026-09-11", endDate: "2026-09-11", periodStartDate: "2026-09-10", periodEndDate: "2026-09-12" }]);
  });

  it("projects recurring period weeks/months from their anchor and applies overrides", () => {
    const weeklyRule = rule({ frequency: "weekly", interval: 2, startsOn: "2026-09-10" });
    const weekly = projectDefinitions([{ event: periodEvent({ recurrenceRuleId: "weekly-rule" }), rule: weeklyRule, overrides: [] }], { startDate: "2026-09-01", endDate: "2026-10-05" }, 1);
    expect(weekly.filter((item) => item.startDate === item.periodStartDate).map((item) => item.periodStartDate)).toEqual(["2026-09-07", "2026-09-21", "2026-10-05"]);
    const monthlyRule = rule({ frequency: "monthly", startsOn: "2026-09-10" });
    const cancelledKey = stablePeriodMonthOccurrenceKey("period-month-recurring", "2026-10");
    const monthly = projectDefinitions([{ event: periodEvent({ id: "period-month-recurring", periodWindowType: "this_month", recurrenceRuleId: "monthly-rule" }), rule: monthlyRule, overrides: [{ id: "cancel", userId: "user-1", eventId: "period-month-recurring", occurrenceKey: cancelledKey, overrideType: "cancelled", patch: null, createdAt: "", updatedAt: "" }] }], { startDate: "2026-09-01", endDate: "2026-11-30" });
    expect(monthly.some((item) => item.occurrenceKey === cancelledKey)).toBe(false);
    expect(monthly.some((item) => item.occurrenceKey === stablePeriodMonthOccurrenceKey("period-month-recurring", "2026-09"))).toBe(true);
  });
});
