import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MoneyProjection } from "../api/client";
import { calendarSnapshotKey, clearMemoryActiveSnapshots, dailySnapshotKey, getActiveSnapshotEpoch, invalidateActiveSnapshotEpoch, isMoneySnapshotData, moneySnapshotKey, readMemoryActiveSnapshot, writeServerConfirmedActiveSnapshot } from "./active-snapshot";

const identity = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, month: "2026-09" };
const money: MoneyProjection = { occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] };
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
    expect(moneySnapshotKey({ kind: "money", userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, month: "2026-09-01" })).toBe("money-month:user-1:Asia/Tokyo:1:2026-09");
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

  it("evicts calendar months per identity while preserving the current neighborhood", async () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    for (const month of months) {
      await writeServerConfirmedActiveSnapshot({ ...identity, month }, { ...calendar, month }, (value): value is typeof calendar => Boolean(value && typeof value === "object"));
    }
    const otherIdentity = { userId: "user-1", timezone: "UTC", weekStartsOn: 0, month: "2026-01" };
    await writeServerConfirmedActiveSnapshot(otherIdentity, { ...calendar, month: otherIdentity.month }, (value): value is typeof calendar => Boolean(value && typeof value === "object"));
    await writeServerConfirmedActiveSnapshot(identity, calendar, (value): value is typeof calendar => Boolean(value && typeof value === "object"), getActiveSnapshotEpoch(), { evictCalendarSnapshots: { preserveMonths: ["2026-08", "2026-09", "2026-10"] } });

    const retained = months.filter((month) => readMemoryActiveSnapshot({ ...identity, month }, (value): value is typeof calendar => Boolean(value && typeof value === "object")) !== null);
    expect(retained).toHaveLength(5);
    expect(retained).toEqual(expect.arrayContaining(["2026-08", "2026-09"]));
    expect(readMemoryActiveSnapshot({ ...identity, month: "2026-09" }, (value): value is typeof calendar => Boolean(value && typeof value === "object"))).toEqual(calendar);
    expect(readMemoryActiveSnapshot(otherIdentity, (value): value is typeof calendar => Boolean(value && typeof value === "object"))).not.toBeNull();
  });

  it("rejects a response captured before logout or identity invalidation", async () => {
    const requestEpoch = getActiveSnapshotEpoch();
    invalidateActiveSnapshotEpoch();
    expect(await writeServerConfirmedActiveSnapshot(identity, calendar, (value): value is typeof calendar => Boolean(value && typeof value === "object"), requestEpoch)).toBe(false);
    expect(readMemoryActiveSnapshot(identity, (value): value is typeof calendar => Boolean(value && typeof value === "object"))).toBeNull();
  });

  it("keeps Money snapshots separate from Calendar snapshots and evicts only Money months", async () => {
    const moneyIdentity = { kind: "money" as const, userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, month: "2026-09-01" };
    for (const month of ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]) {
      await writeServerConfirmedActiveSnapshot({ ...moneyIdentity, month }, money, isMoneySnapshotData, getActiveSnapshotEpoch(), { evictMoneySnapshots: { preserveMonths: ["2026-08-01", "2026-09-01", "2026-10-01"] } });
    }
    const retained = ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].filter((month) => readMemoryActiveSnapshot({ ...moneyIdentity, month }, isMoneySnapshotData) !== null);
    expect(retained).toHaveLength(5);
    expect(retained).toEqual(expect.arrayContaining(["2026-08-01", "2026-09-01", "2026-10-01"]));
    expect(readMemoryActiveSnapshot(identity, (value): value is typeof calendar => Boolean(value && typeof value === "object"))).toBeNull();
    await writeServerConfirmedActiveSnapshot(identity, calendar, (value): value is typeof calendar => Boolean(value && typeof value === "object"), getActiveSnapshotEpoch(), { evictCalendarSnapshots: { preserveMonths: ["2026-09"] } });
    expect(readMemoryActiveSnapshot({ ...moneyIdentity, month: "2026-09-01" }, isMoneySnapshotData)).toEqual(money);
  });
});
