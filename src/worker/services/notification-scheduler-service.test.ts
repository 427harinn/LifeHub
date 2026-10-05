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

const scheduler = (rows: Array<{ id: string; eventId: string; offsetMinutes: number }>, projectedEvents: Event[] = [], summaryRows: Array<{ id: string; userId: string; summaryType: "morning" | "evening"; localDate: string; scheduledFor: string }> = []) => {
  const service = Object.create(NotificationSchedulerService.prototype) as NotificationSchedulerService;
  const claim = vi.fn(() => Promise.resolve(true));
  const markSent = vi.fn(() => Promise.resolve());
  const dueJobs = rows.map((row) => ({ id: "job-1", userId: "user-1", eventId: row.eventId, occurrenceKey: null, eventNotificationId: row.id, scheduledFor: "2026-09-10T10:00:00.000Z", payload: { title: "予定のお知らせ", body: "10:00 歯医者", data: { kind: "event" as const, eventId: row.eventId, date: "2026-09-10", occurrenceKey: null, url: "/calendar?date=2026-09-10&event=event-1" } }, status: "pending" as const, sentAt: null, createdAt: "", updatedAt: "" }));
  const dueSummaryJobs = summaryRows.map((row) => ({ ...row, status: "pending" as const, sentAt: null, createdAt: "", updatedAt: "" }));
  const get = vi.fn(() => Promise.resolve({ migrationState: "active" as const }));
  const getOrCreate = vi.fn(() => Promise.resolve(settings()));
  const summaryMarkSent = vi.fn(() => Promise.resolve());
  const listAll = vi.fn(() => Promise.resolve([settings()]));
  const listDue = vi.fn(() => Promise.resolve(dueJobs));
  const listSummaryDue = vi.fn(() => Promise.resolve(dueSummaryJobs));
  const project = vi.fn(() => Promise.resolve(projectedEvents));
  const sendPayload = vi.fn(() => Promise.resolve({ sent: 1, failed: 0 }));
  Object.assign(service, {
    settings: { listAll, getOrCreate },
    states: { get, getOrCreate: vi.fn() },
    notifications: { listEventNotificationsForEvent: () => Promise.resolve(rows) },
    jobs: { listDue, markSent, deletePending: vi.fn(() => Promise.resolve()), deleteExpiredPending: vi.fn(() => Promise.resolve(0)) },
    summaryJobs: { listDue: listSummaryDue, markSent: summaryMarkSent, deleteExpiredPending: vi.fn(() => Promise.resolve(0)) },
    events: { getById: () => Promise.resolve(event()) },
    deliveries: { claim, markSent, isSent: () => Promise.resolve(false), release: vi.fn(() => Promise.resolve()) },
    projection: { project },
    push: { sendPayload }
  });
  return { service, project, claim, sendPayload, markSent, summaryMarkSent, listAll, get, getOrCreate, listDue, listSummaryDue };
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
  it("performs due queries only when both queues are empty", async () => {
    const { service, project, listAll, get, getOrCreate, listDue, listSummaryDue, sendPayload } = scheduler([]);
    await service.run({} as Env, new Date("2026-09-10T12:00:00.000Z"));
    expect(listDue).toHaveBeenCalledTimes(1);
    expect(listSummaryDue).toHaveBeenCalledTimes(1);
    expect(listAll).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("delivers a morning summary only for its due user", async () => {
    const { service, project, claim, sendPayload, summaryMarkSent, getOrCreate } = scheduler([], [event()], [{ id: "summary-1", userId: "user-1", summaryType: "morning", localDate: "2026-09-10", scheduledFor: "2026-09-10T08:00:00.000Z" }]);
    Object.assign(service, { settings: { listAll: vi.fn(() => Promise.resolve([])), getOrCreate: vi.fn(() => Promise.resolve(settings({ morningSummaryEnabled: true, morningSummaryTime: "08:00" }))) } });
    await service.run({} as Env, new Date("2026-09-10T08:05:00.000Z"));
    expect(project).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledWith("user-1", { startDate: "2026-09-10", endDate: "2026-09-10" }, { timezone: "UTC", weekStartsOn: 1 });
    expect(getOrCreate).not.toHaveBeenCalled();
    expect((service as unknown as { settings: { getOrCreate: ReturnType<typeof vi.fn> } }).settings.getOrCreate).toHaveBeenCalledWith("user-1", "2026-09-10T08:05:00.000Z");
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "morning_summary", dedupeKey: "summary:user-1:morning_summary:2026-09-10T08:00:00.000Z" }));
    expect(sendPayload).toHaveBeenCalledWith("user-1", expect.objectContaining({ title: "今日の予定", body: "10:00 歯医者", data: { kind: "summary", period: "morning", localDate: "2026-09-10", url: "/calendar?date=2026-09-10" } }), expect.anything());
    expect(summaryMarkSent).toHaveBeenCalledWith("summary-1", "2026-09-10T08:05:00.000Z");
  });

  it("delivers a due job without projecting Event definitions", async () => {
    const { service, project, claim, sendPayload, markSent } = scheduler([{ id: "notification-1", eventId: "event-1", offsetMinutes: 0 }]);
    await service.run({} as Env, new Date("2026-09-10T10:00:00.000Z"));
    expect(project).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "event", eventNotificationId: "notification-1" }));
    expect(sendPayload).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledTimes(2);
  });

  it("delivers an evening summary using the current title and payload contract", async () => {
    const { service, project, claim, sendPayload } = scheduler([], [event()], [{ id: "summary-2", userId: "user-1", summaryType: "evening", localDate: "2026-09-10", scheduledFor: "2026-09-10T18:00:00.000Z" }]);
    Object.assign(service, { settings: { listAll: vi.fn(() => Promise.resolve([])), getOrCreate: vi.fn(() => Promise.resolve(settings({ eveningSummaryEnabled: true, eveningSummaryTime: "18:00" }))) } });
    await service.run({} as Env, new Date("2026-09-10T18:05:00.000Z"));
    expect(project).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "evening_summary" }));
    expect(sendPayload).toHaveBeenCalledWith("user-1", expect.objectContaining({ title: "今日の予定を確認", data: expect.objectContaining({ period: "evening" }) }), expect.anything());
  });

  it("completes a due job when the summary was disabled after refill", async () => {
    const { service, project, claim, summaryMarkSent } = scheduler([], [event()], [{ id: "summary-3", userId: "user-1", summaryType: "morning", localDate: "2026-09-10", scheduledFor: "2026-09-10T08:00:00.000Z" }]);
    Object.assign(service, { settings: { listAll: vi.fn(() => Promise.resolve([])), getOrCreate: vi.fn(() => Promise.resolve(settings({ morningSummaryEnabled: false }))) } });
    await service.run({} as Env, new Date("2026-09-10T08:05:00.000Z"));
    expect(project).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(summaryMarkSent).toHaveBeenCalledWith("summary-3", "2026-09-10T08:05:00.000Z");
  });

  it("completes a due summary without delivery when the day has no events", async () => {
    const { service, project, claim, summaryMarkSent } = scheduler([], [], [{ id: "summary-4", userId: "user-1", summaryType: "morning", localDate: "2026-09-10", scheduledFor: "2026-09-10T08:00:00.000Z" }]);
    Object.assign(service, { settings: { listAll: vi.fn(() => Promise.resolve([])), getOrCreate: vi.fn(() => Promise.resolve(settings({ morningSummaryEnabled: true }))) } });
    await service.run({} as Env, new Date("2026-09-10T08:05:00.000Z"));
    expect(project).toHaveBeenCalledTimes(1);
    expect(claim).not.toHaveBeenCalled();
    expect(summaryMarkSent).toHaveBeenCalledWith("summary-4", "2026-09-10T08:05:00.000Z");
  });

  it("does not inspect settings or send either due job for a migration-locked user", async () => {
    const { service, project, claim, summaryMarkSent } = scheduler([{ id: "notification-1", eventId: "event-1", offsetMinutes: 0 }], [event()], [{ id: "summary-5", userId: "user-1", summaryType: "morning", localDate: "2026-09-10", scheduledFor: "2026-09-10T08:00:00.000Z" }]);
    Object.assign(service, { states: { get: vi.fn(() => Promise.resolve({ migrationState: "migration_locked" })) } });
    await service.run({} as Env, new Date("2026-09-10T10:00:00.000Z"));
    expect(project).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(summaryMarkSent).not.toHaveBeenCalled();
  });
});
