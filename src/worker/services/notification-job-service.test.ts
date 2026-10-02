import { describe, expect, it, vi } from "vitest";
import type { Event, EventNotification, NotificationJob, UserSettings } from "../types";
import { NotificationJobRepository } from "../repositories/notification-job-repository";
import { NotificationJobService, NOTIFICATION_JOB_HORIZON_DAYS } from "./notification-job-service";

const baseEvent = (changes: Partial<Event> = {}): Event => ({
  id: "event-1", userId: "user-1", category: "home", title: "予定", place: null, memo: null,
  timingType: "scheduled", allDay: false, startDate: "2026-09-03", startTime: "09:00", endDate: "2026-09-03", endTime: "10:00",
  periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null,
  recurrenceRuleId: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...changes
});
const setting: UserSettings = { userId: "user-1", timezone: "UTC", weekStartsOn: 1, morningSummaryEnabled: false, morningSummaryTime: "08:00", eveningSummaryEnabled: false, eveningSummaryTime: "18:00", periodDefaultDeadlineTime: "21:00", lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] }, lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] }, createdAt: "", updatedAt: "" };
const offset = (id: string, offsetMinutes: number): EventNotification => ({ id, userId: "user-1", eventId: "event-1", offsetMinutes, sortOrder: 0, createdAt: "" });

const serviceWith = (options: { event?: Event | null; offsets?: EventNotification[]; projected?: Event[]; existing?: Array<Record<string, unknown>> } = {}) => {
  let current = (options.existing ?? []) as NotificationJob[];
  const replacePendingForEvent = vi.fn((_userId: string, _eventId: string, jobs: NotificationJob[]) => {
    current = [...current.filter((job) => job.status === "sent"), ...jobs];
    return Promise.resolve();
  });
  const dependencies = {
    jobs: { replacePendingForEvent },
    notifications: { listEventNotificationsForEvent: vi.fn(() => Promise.resolve(options.offsets ?? [offset("offset-1", 0)])), listEventNotificationTargets: vi.fn(() => Promise.resolve([])) },
    settings: { getOrCreate: vi.fn(() => Promise.resolve(setting)) },
    events: { getById: vi.fn(() => Promise.resolve(options.event === undefined ? baseEvent() : options.event)) },
    projection: { projectEvent: vi.fn(() => Promise.resolve(options.projected ?? [options.event ?? baseEvent()])) }
  };
  return { service: new NotificationJobService({} as D1Database, dependencies as never), dependencies, replacePendingForEvent, jobs: () => current };
};

describe("notification job generation", () => {
  const at = new Date("2026-09-01T00:00:00.000Z");

  it("generates a job for a nonrecurring scheduled Event", async () => {
    const { service, jobs } = serviceWith();
    expect(await service.refreshForEvent("user-1", "event-1", at)).toBe(1);
    expect(jobs()[0]).toMatchObject({ eventId: "event-1", scheduledFor: "2026-09-03T09:00:00.000Z", status: "pending" });
  });

  it("uses 09:00 for an all-day event", async () => {
    const { service, jobs } = serviceWith({ event: baseEvent({ allDay: true, startTime: null, endTime: null }) });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(jobs()[0].scheduledFor).toBe("2026-09-03T09:00:00.000Z");
    expect(jobs()[0].payload.body).toBe("予定");
  });

  it("uses the default period deadline", async () => {
    const event = baseEvent({ timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType: "this_week", periodAnchorDate: "2026-09-01", periodStartDate: "2026-08-31", periodEndDate: "2026-09-06" });
    const { service, jobs } = serviceWith({ event, projected: [event] });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(jobs()[0].payload.body).toBe("予定（期限 2026-09-06 21:00）");
  });

  it("uses a custom period deadline", async () => {
    const event = baseEvent({ timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodStartDate: "2026-09-01", periodEndDate: "2026-09-03", deadlineTime: "18:30" });
    const { service, jobs } = serviceWith({ event, projected: [event] });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(jobs()[0].scheduledFor).toBe("2026-09-03T18:30:00.000Z");
  });

  it("creates one job for each configured offset", async () => {
    const { service, jobs } = serviceWith({ offsets: [offset("offset-60", 60), offset("offset-0", 0)] });
    expect(await service.refreshForEvent("user-1", "event-1", at)).toBe(2);
    expect(jobs().map((job) => job.scheduledFor).sort()).toEqual(["2026-09-03T08:00:00.000Z", "2026-09-03T09:00:00.000Z"]);
  });

  it.each(["daily", "weekly", "monthly"] as const)("generates recurrence jobs from %s projections", async (frequency) => {
    const projected = ["2026-09-03", "2026-09-10"].map((date, index) => baseEvent({ recurrenceRuleId: `rule-${frequency}`, startDate: date, endDate: date, occurrenceKey: `event:event-1:${date}T09:00`, title: `${frequency}-${index}` }));
    const { service, jobs } = serviceWith({ projected });
    expect(await service.refreshForEvent("user-1", "event-1", at)).toBe(2);
    expect(jobs().map((job) => job.occurrenceKey)).toEqual(projected.map((event) => event.occurrenceKey));
  });

  it("stores a modified occurrence's payload snapshot", async () => {
    const modified = baseEvent({ title: "変更済み", startDate: "2026-09-03", startTime: "11:00", occurrenceKey: "event:event-1:2026-09-03T09:00" });
    const { service, jobs } = serviceWith({ projected: [modified] });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(jobs()[0].payload.body).toBe("11:00 変更済み");
    expect(jobs()[0].payload.data.occurrenceKey).toBe(modified.occurrenceKey);
  });

  it("does not generate a cancelled occurrence", async () => {
    const { service } = serviceWith({ projected: [] });
    expect(await service.refreshForEvent("user-1", "event-1", at)).toBe(0);
  });

  it("clears pending jobs when notifications are removed or the Event is deleted", async () => {
    for (const state of [{ offsets: [] }, { event: null }]) {
      const { service, replacePendingForEvent } = serviceWith(state);
      expect(await service.refreshForEvent("user-1", "event-1", at)).toBe(0);
      expect(replacePendingForEvent).toHaveBeenCalledWith("user-1", "event-1", []);
    }
  });

  it("replaces pending jobs while retaining sent history", async () => {
  const sent = { id: "already-sent", status: "sent" } as NotificationJob;
    const { service, jobs } = serviceWith({ existing: [sent] });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(jobs()).toContain(sent);
    expect(jobs().filter((job) => job.status === "pending")).toHaveLength(1);
  });

  it("keeps repeated refreshes at the same unique job set", async () => {
    const { service, jobs } = serviceWith();
    await service.refreshForEvent("user-1", "event-1", at);
    await service.refreshForEvent("user-1", "event-1", at);
    expect(new Set(jobs().map((job) => `${job.eventNotificationId}:${job.occurrenceKey}:${job.scheduledFor}`)).size).toBe(1);
  });

  it("projects back through the largest offset and caps the future projection horizon", async () => {
    const { service, dependencies } = serviceWith({ offsets: [offset("year", 525600)] });
    await service.refreshForEvent("user-1", "event-1", at);
    expect(dependencies.projection.projectEvent).toHaveBeenCalledWith("user-1", "event-1", { startDate: "2025-08-31", endDate: "2026-10-31" }, { timezone: "UTC", weekStartsOn: 1 });
    expect(NOTIFICATION_JOB_HORIZON_DAYS).toBe(60);
  });
});

describe("notification job due query", () => {
  it("queries only pending jobs in the open 20-minute window", async () => {
    const calls: Array<{ sql: string; bindings: unknown[] }> = [];
    const db = { prepare: (sql: string) => ({ bind: (...bindings: unknown[]) => ({ all: () => { calls.push({ sql, bindings }); return Promise.resolve({ results: [] }); } }) }) } as unknown as D1Database;
    await new NotificationJobRepository(db).listDue("2026-09-01T12:00:00.000Z", 20);
    expect(calls[0].sql).toContain("status = 'pending' AND scheduled_for > ? AND scheduled_for <= ?");
    expect(calls[0].bindings).toEqual(["2026-09-01T11:40:00.000Z", "2026-09-01T12:00:00.000Z"]);
  });
});
