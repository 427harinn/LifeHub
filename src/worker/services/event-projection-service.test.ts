import { describe, expect, it } from "vitest";
import type { Event, EventOccurrenceOverride, RecurrenceRule } from "../types";
import { dayToRange, isDateKey, monthKeyToGridRange, projectDefinitions, stableOccurrenceKey } from "./event-projection-service";
import { occurrenceDates } from "./event-projection-service";

const event: Event = {
  id: "event-1", userId: "user-1", category: "home", title: "薬", place: null, memo: null, timingType: "scheduled", allDay: false,
  startDate: "2026-09-01", startTime: "08:00", endDate: "2026-09-01", endTime: "08:30", recurrenceRuleId: "rule-1", active: true,
  deletedAt: null, createdAt: "", updatedAt: ""
};

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: "rule-1", userId: "user-1", frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-01", endsOn: null, createdAt: "", updatedAt: "", ...overrides
});

describe("scheduled recurrence projection", () => {
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
});
