import { describe, expect, it, vi } from "vitest";
import type { Event, UserSettings } from "../types";
import { NotificationSchedulerService } from "./notification-scheduler-service";
import { formatSummaryBody, resolveEventNotification, resolveScheduledNotification } from "./notification-scheduler-service";

const event = (changes: Partial<Event> = {}): Event => ({
  id: "event-1", userId: "user-1", category: "home", title: "歯医者", place: null, memo: null,
  timingType: "scheduled", allDay: false, startDate: "2026-09-10", startTime: "10:00", endDate: "2026-09-10", endTime: "11:00",
  periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null,
  recurrenceRuleId: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...changes
});

const settings = (changes: Partial<UserSettings> = {}): UserSettings => ({
  userId: "user-1", timezone: "UTC", weekStartsOn: 1, morningSummaryEnabled: false, morningSummaryTime: "08:00",
  eveningSummaryEnabled: false, eveningSummaryTime: "18:00", periodDefaultDeadlineTime: "21:00",
  lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] }, lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] },
  createdAt: "", updatedAt: "", ...changes
});

const scheduler = (rows: Array<{ id: string; eventId: string; offsetMinutes: number }>, projectedEvents: Event[] = []) => {
  const service = Object.create(NotificationSchedulerService.prototype) as NotificationSchedulerService;
  const project = vi.fn(() => Promise.resolve(projectedEvents));
  const claim = vi.fn(() => Promise.resolve(true));
  const sendPayload = vi.fn(() => Promise.resolve({ sent: 1, failed: 0 }));
  const markSent = vi.fn(() => Promise.resolve());
  Object.assign(service, {
    settings: { listAll: () => Promise.resolve([settings()]) },
    states: { getOrCreate: () => Promise.resolve({ migrationState: "active" }) },
    notifications: { listEventNotifications: () => Promise.resolve(rows) },
    deliveries: { claim, markSent, release: vi.fn(() => Promise.resolve()) },
    projection: { project },
    push: { sendPayload }
  });
  return { service, project, claim, sendPayload, markSent };
};

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

describe("notification scheduler projections", () => {
  it("skips all projections when there are no event notifications and summary times are outside the window", async () => {
    const { service, project } = scheduler([]);
    await service.run({} as Env, new Date("2026-09-10T12:00:00.000Z"));
    expect(project).not.toHaveBeenCalled();
  });

  it("runs only the summary projection when there are no event notifications", async () => {
    const { service, project } = scheduler([]);
    Object.assign(service, { settings: { listAll: () => Promise.resolve([settings({ morningSummaryEnabled: true, morningSummaryTime: "08:00" })]) } });
    await service.run({} as Env, new Date("2026-09-10T08:05:00.000Z"));
    expect(project).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledWith("user-1", { startDate: "2026-09-10", endDate: "2026-09-10" }, { timezone: "UTC", weekStartsOn: 1 });
  });

  it("projects and delivers an existing event notification", async () => {
    const { service, project, claim, sendPayload, markSent } = scheduler([{ id: "notification-1", eventId: "event-1", offsetMinutes: 0 }], [event({ startDate: "2026-09-10", endDate: "2026-09-10", startTime: "10:00", endTime: "11:00" })]);
    await service.run({} as Env, new Date("2026-09-10T10:00:00.000Z"));
    expect(project).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "event", eventNotificationId: "notification-1" }));
    expect(sendPayload).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["morning", "2026-09-10T08:05:00.000Z", "08:00", "morning_summary"],
    ["evening", "2026-09-10T18:05:00.000Z", "18:00", "evening_summary"]
  ] as const)("keeps %s summary delivery behavior", async (period, at, time, notificationType) => {
    const { service, project, claim, sendPayload } = scheduler([], [event()]);
    const summarySettings = settings({
      morningSummaryEnabled: period === "morning", morningSummaryTime: period === "morning" ? time : "00:00",
      eveningSummaryEnabled: period === "evening", eveningSummaryTime: period === "evening" ? time : "00:00"
    });
    Object.assign(service, { settings: { listAll: () => Promise.resolve([summarySettings]) } });
    await service.run({} as Env, new Date(at));
    expect(project).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ notificationType }));
    expect(sendPayload).toHaveBeenCalledTimes(1);
  });
});
