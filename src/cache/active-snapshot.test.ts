import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calendarSnapshotKey, clearMemoryActiveSnapshots, dailySnapshotKey, getActiveSnapshotEpoch, readMemoryActiveSnapshot, writeServerConfirmedActiveSnapshot } from "./active-snapshot";

const identity = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, month: "2026-09" };
const money = { occurrences: [], summary: {}, days: [] };
const calendar = { month: "2026-09", range: { startDate: "2026-08-30", endDate: "2026-10-10" }, events: [], money };

describe("active snapshot cache", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMemoryActiveSnapshots();
  });

  afterEach(() => clearMemoryActiveSnapshots());

  it("uses user, timezone, week start, and query in keys", () => {
    expect(calendarSnapshotKey(identity)).toBe("calendar-month:user-1:Asia/Tokyo:1:2026-09");
    expect(dailySnapshotKey({ userId: "user-1", timezone: "UTC", weekStartsOn: 0, date: "2026-09-24" })).toBe("daily:user-1:UTC:0:2026-09-24");
  });

  it("writes validated server data to memory", async () => {
    await writeServerConfirmedActiveSnapshot(identity, calendar, (value): value is typeof calendar => Boolean(value && typeof value === "object"));
    expect(readMemoryActiveSnapshot(identity, (value): value is typeof calendar => Boolean(value && typeof value === "object"))).toEqual(calendar);
  });

  it("changes epoch when the active cache is invalidated", async () => {
    const before = getActiveSnapshotEpoch();
    await writeServerConfirmedActiveSnapshot(identity, calendar, (value): value is typeof calendar => Boolean(value && typeof value === "object"));
    clearMemoryActiveSnapshots();
    expect(getActiveSnapshotEpoch()).toBeGreaterThan(before);
  });
});
