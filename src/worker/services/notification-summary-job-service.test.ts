import { describe, expect, it, vi } from "vitest";
import type { UserSettings } from "../types";
import { NotificationSummaryJobService, SUMMARY_JOB_HORIZON_DAYS } from "./notification-summary-job-service";

const settings = (changes: Partial<UserSettings> = {}): UserSettings => ({
  userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1,
  morningSummaryEnabled: true, morningSummaryTime: "08:00", eveningSummaryEnabled: true, eveningSummaryTime: "19:00",
  periodDefaultDeadlineTime: "21:00", lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] },
  lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] }, createdAt: "", updatedAt: "", ...changes
});

const makeService = (all: UserSettings[] = [settings()], initialJobs: Array<Record<string, unknown>> = []) => {
  let pending = [...initialJobs];
  const replacePendingForUser = vi.fn((userId: string, jobs: Array<Record<string, unknown>>) => {
    pending = pending.filter((job) => job.userId !== userId || job.status !== "pending");
    for (const job of jobs) {
      const key = `${job.userId}:${job.summaryType}:${job.localDate}:${job.scheduledFor}`;
      if (!pending.some((existing) => `${existing.userId}:${existing.summaryType}:${existing.localDate}:${existing.scheduledFor}` === key)) pending.push(job);
    }
    return Promise.resolve();
  });
  const listAll = vi.fn(() => Promise.resolve(all));
  const getOrCreate = vi.fn(() => Promise.resolve(all[0] ?? settings()));
  const deleteExpiredPending = vi.fn(() => Promise.resolve(0));
  const service = new NotificationSummaryJobService({} as D1Database, {
    jobs: { replacePendingForUser, deleteExpiredPending } as never,
    settings: { listAll, getOrCreate } as never
  });
  return { service, replacePendingForUser, listAll, getOrCreate, pending: () => pending };
};

const sentSummary = (summaryType: "morning" | "evening", scheduledFor: string): Record<string, unknown> => ({
  id: `sent-${summaryType}`, userId: "user-1", summaryType, localDate: "2026-10-05", scheduledFor,
  status: "sent", sentAt: scheduledFor, createdAt: scheduledFor, updatedAt: scheduledFor
});

describe("notification summary job generation", () => {
  it("refills today through seven days and computes local schedules in UTC", async () => {
    const { service, replacePendingForUser } = makeService();
    const result = await service.refill(new Date("2026-10-04T22:00:00.000Z"));
    expect(SUMMARY_JOB_HORIZON_DAYS).toBe(7);
    expect(result).toEqual({ users: 1, jobs: 16 });
    const jobs = replacePendingForUser.mock.calls[0][1];
    expect(jobs).toHaveLength(16);
    expect(jobs[0]).toMatchObject({ summaryType: "morning", localDate: "2026-10-05", scheduledFor: "2026-10-04T23:00:00.000Z", status: "pending" });
    expect(jobs.at(-1)).toMatchObject({ summaryType: "evening", localDate: "2026-10-12", scheduledFor: "2026-10-12T10:00:00.000Z" });
  });

  it("does not create disabled summaries and replaces pending schedules after time or timezone changes", async () => {
    const { service, replacePendingForUser } = makeService([settings({ eveningSummaryEnabled: false })]);
    await service.refreshForUser("user-1", new Date("2026-10-05T00:00:00.000Z"));
    expect(replacePendingForUser.mock.calls[0][1].every((job) => job.summaryType === "morning")).toBe(true);
    expect(replacePendingForUser.mock.calls[0][1]).toHaveLength(7);

    const changed = makeService([settings({ timezone: "America/Los_Angeles", morningSummaryTime: "09:30", eveningSummaryEnabled: false })]);
    await changed.service.refreshForUser("user-1", new Date("2026-10-05T00:00:00.000Z"));
    expect(changed.replacePendingForUser.mock.calls[0][1][0]).toMatchObject({ localDate: "2026-10-05", scheduledFor: "2026-10-05T16:30:00.000Z" });
  });

  it("replaces pending rows on duplicate refill and excludes elapsed local schedules", async () => {
    const { service, replacePendingForUser } = makeService([settings({ eveningSummaryEnabled: false })]);
    const at = new Date("2026-10-05T00:05:00.000Z");
    await service.refill(at);
    await service.refill(at);
    const first = replacePendingForUser.mock.calls[0][1];
    const second = replacePendingForUser.mock.calls[1][1];
    expect(first).toHaveLength(7);
    expect(second.map((job) => `${job.userId}:${job.summaryType}:${job.localDate}`)).toEqual(first.map((job) => `${job.userId}:${job.summaryType}:${job.localDate}`));
    expect(replacePendingForUser).toHaveBeenCalledTimes(2);
  });

  it("keeps a sent morning job and creates the same-day job at a changed time without duplicates", async () => {
    const changedSettings = settings({ morningSummaryTime: "13:30", eveningSummaryEnabled: false });
    const { service, pending } = makeService([changedSettings], [sentSummary("morning", "2026-10-05T02:20:00.000Z")]);
    const at = new Date("2026-10-05T00:00:00.000Z");

    await service.refreshForUser("user-1", at);
    await service.refreshForUser("user-1", at);

    const rows = pending();
    expect(rows).toContainEqual(expect.objectContaining({ status: "sent", summaryType: "morning", localDate: "2026-10-05", scheduledFor: "2026-10-05T02:20:00.000Z" }));
    const rescheduled = rows.filter((job) => job.status === "pending" && job.summaryType === "morning" && job.localDate === "2026-10-05");
    expect(rescheduled).toHaveLength(1);
    expect(rescheduled[0]).toMatchObject({ scheduledFor: "2026-10-05T04:30:00.000Z" });
  });

  it("removes pending summaries when disabled while preserving sent history", async () => {
    const priorRows = [
      sentSummary("morning", "2026-10-05T02:20:00.000Z"),
      { ...sentSummary("morning", "2026-10-05T02:20:00.000Z"), id: "pending-old", status: "pending", sentAt: null }
    ];
    const { service, pending } = makeService([settings({ morningSummaryEnabled: false, eveningSummaryEnabled: false })], priorRows);

    await service.refreshForUser("user-1", new Date("2026-10-05T00:00:00.000Z"));

    expect(pending()).toEqual([expect.objectContaining({ id: "sent-morning", status: "sent" })]);
  });

  it("rebuilds same-day morning schedules after a timezone change and retains sent history", async () => {
    const changedSettings = settings({ timezone: "America/Los_Angeles", morningSummaryTime: "09:30", eveningSummaryEnabled: false });
    const { service, pending } = makeService([changedSettings], [sentSummary("morning", "2026-10-05T02:20:00.000Z")]);

    await service.refreshForUser("user-1", new Date("2026-10-05T16:00:00.000Z"));

    expect(pending()).toContainEqual(expect.objectContaining({ status: "sent", scheduledFor: "2026-10-05T02:20:00.000Z" }));
    expect(pending()).toContainEqual(expect.objectContaining({ status: "pending", summaryType: "morning", localDate: "2026-10-05", scheduledFor: "2026-10-05T16:30:00.000Z" }));
  });

  it("allows an evening schedule to change after its same-day job was sent", async () => {
    const changedSettings = settings({ morningSummaryEnabled: false, eveningSummaryTime: "21:00" });
    const { service, pending } = makeService([changedSettings], [sentSummary("evening", "2026-10-05T06:20:00.000Z")]);

    await service.refreshForUser("user-1", new Date("2026-10-05T00:00:00.000Z"));

    expect(pending()).toContainEqual(expect.objectContaining({ status: "sent", scheduledFor: "2026-10-05T06:20:00.000Z" }));
    expect(pending()).toContainEqual(expect.objectContaining({ status: "pending", summaryType: "evening", localDate: "2026-10-05", scheduledFor: "2026-10-05T12:00:00.000Z" }));
  });
});
