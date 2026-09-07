import { describe, expect, it } from "vitest";
import { validateScheduledEventInput } from "./event-service";
import type { ScheduledEventInput } from "../types";

const valid = {
  category: "home" as const,
  title: "病院",
  place: null,
  memo: null,
  timingType: "scheduled" as const,
  allDay: false,
  startDate: "2026-09-20",
  startTime: "15:00",
  endDate: "2026-09-20",
  endTime: "16:00"
};

describe("scheduled Event validation", () => {
  it("normalizes optional empty fields and accepts a multi-day timed event", () => {
    expect(validateScheduledEventInput({ ...valid, place: "  駅  ", memo: "  持ち物  ", endDate: "2026-09-22" })).toMatchObject({ place: "駅", memo: "持ち物", endDate: "2026-09-22" });
  });

  const invalidCases: Array<[string, Partial<ScheduledEventInput>]> = [
    ["title", { title: "" }],
    ["category", { category: "money" } as unknown as Partial<ScheduledEventInput>],
    ["timingType", { timingType: "period" } as unknown as Partial<ScheduledEventInput>],
    ["date", { startDate: "2026-02-30" }],
    ["date order", { startDate: "2026-09-21", endDate: "2026-09-20" }],
    ["time order", { startTime: "16:00", endTime: "15:00" }],
    ["time format", { startTime: "25:00" }]
  ];
  it.each(invalidCases)("rejects invalid %s", (_label, changes) => {
    expect(() => validateScheduledEventInput({ ...valid, ...changes })).toThrow();
  });

  it("requires both times for a non-all-day event", () => {
    expect(() => validateScheduledEventInput({ ...valid, startTime: null })).toThrow();
    expect(() => validateScheduledEventInput({ ...valid, endTime: null })).toThrow();
  });

  it("clears time for an all-day event and rejects supplied time values", () => {
    expect(validateScheduledEventInput({ ...valid, allDay: true, startTime: null, endTime: null })).toMatchObject({ allDay: true, startTime: null, endTime: null });
    expect(() => validateScheduledEventInput({ ...valid, allDay: true })).toThrow();
  });
});
