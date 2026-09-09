import { describe, expect, it } from "vitest";
import type { Event } from "../types";
import { formatSummaryBody, resolveEventNotification, resolveScheduledNotification } from "./notification-scheduler-service";

const event = (changes: Partial<Event> = {}): Event => ({
  id: "event-1", userId: "user-1", category: "home", title: "歯医者", place: null, memo: null,
  timingType: "scheduled", allDay: false, startDate: "2026-09-10", startTime: "10:00", endDate: "2026-09-10", endTime: "11:00",
  periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null,
  recurrenceRuleId: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...changes
});

describe("notification schedule resolution", () => {
  it.each([10, 30, 60, 1440])("resolves the %s minute offset from a scheduled start", (offset) => {
    const result = resolveEventNotification(event(), offset, "Asia/Tokyo", "21:00");
    expect(result?.baseDate).toBe("2026-09-10");
    expect(result?.baseTime).toBe("10:00");
    expect(result?.scheduledFor).toEqual(new Date(Date.parse("2026-09-10T01:00:00.000Z") - offset * 60_000));
  });

  it("uses 09:00 local time for all-day events, independent of the morning setting", () => {
    const result = resolveEventNotification(event({ allDay: true, startTime: null, endTime: null }), 0, "Asia/Tokyo", "08:00");
    expect(result?.baseTime).toBe("09:00");
    expect(result?.scheduledFor.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("uses a custom or default deadline for period events", () => {
    const period = event({ timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType: "this_week", periodAnchorDate: "2026-09-10", periodEndDate: "2026-09-13", deadlineTime: null });
    expect(resolveEventNotification(period, 30, "Asia/Tokyo", "21:00")).toMatchObject({ baseDate: "2026-09-13", baseTime: "21:00" });
    expect(resolveEventNotification({ ...period, deadlineTime: "18:30" }, 0, "Asia/Tokyo", "21:00")).toMatchObject({ baseTime: "18:30" });
  });

  it("keeps local time correct across the New York DST transition", () => {
    const result = resolveEventNotification(event({ startDate: "2026-03-08", endDate: "2026-03-08", startTime: "09:00", endTime: "10:00" }), 0, "America/New_York", "21:00");
    expect(result?.scheduledFor.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });

  it("picks a target just before midnight during the following local date", () => {
    const result = resolveScheduledNotification(new Date("2026-09-08T15:05:00.000Z"), "Asia/Tokyo", "23:59");
    expect(result?.localDate).toBe("2026-09-08");
    expect(result?.scheduledFor.toISOString()).toBe("2026-09-08T14:59:00.000Z");
    expect(resolveScheduledNotification(new Date("2026-09-08T15:20:00.000Z"), "Asia/Tokyo", "23:59")).toBeNull();
  });
});

describe("summary copy", () => {
  it("does not use task completion language and truncates long summaries", () => {
    expect(formatSummaryBody([event({ title: "  歯医者  " }), event({ id: "event-2", title: "クリーニング", timingType: "period", periodWindowType: "this_week", periodEndDate: "2026-09-13", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null }), event({ id: "event-3", title: "美容院" }), event({ id: "event-4", title: "薬局" })])).toBe("10:00 歯医者、今週中：クリーニング、10:00 美容院、ほか1件");
    expect(formatSummaryBody([])).toBe("");
  });
});
