import { addDateKey, getLocalDate } from "../lib/date-time";
import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
import { NotificationJobRepository } from "../repositories/notification-job-repository";
import { NotificationRepository } from "../repositories/notification-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { SettingsRepository } from "../repositories/settings-repository";
import type { NotificationJob } from "../types";
import { EventProjectionService } from "./event-projection-service";
import { eventNotificationUrl, resolveEventNotification } from "./notification-scheduler-service";

export const NOTIFICATION_JOB_HORIZON_DAYS = 60;
const DELIVERY_WINDOW_MS = 20 * 60_000;

export type NotificationJobDependencies = {
  jobs: NotificationJobRepository;
  notifications: NotificationRepository;
  settings: SettingsRepository;
  events: EventRepository;
  projection: EventProjectionService;
};

export class NotificationJobService {
  private readonly jobs: NotificationJobRepository;
  private readonly notifications: NotificationRepository;
  private readonly settings: SettingsRepository;
  private readonly projection: EventProjectionService;
  private readonly events: EventRepository;

  constructor(private readonly db: D1Database, dependencies?: NotificationJobDependencies) {
    this.jobs = dependencies?.jobs ?? new NotificationJobRepository(db);
    this.notifications = dependencies?.notifications ?? new NotificationRepository(db);
    this.settings = dependencies?.settings ?? new SettingsRepository(db);
    this.events = dependencies?.events ?? new EventRepository(db);
    this.projection = dependencies?.projection ?? new EventProjectionService(this.events, new RecurrenceRepository(db), new EventOccurrenceOverrideRepository(db));
  }

  async refreshForEvent(userId: string, eventId: string, at: Date): Promise<number> {
    const now = at.toISOString();
    const [event, offsets, setting] = await Promise.all([
      this.events.getById(userId, eventId),
      this.notifications.listEventNotificationsForEvent(userId, eventId),
      this.settings.getOrCreate(userId, now)
    ]);
    if (!event || offsets.length === 0) {
      await this.jobs.replacePendingForEvent(userId, eventId, []);
      return 0;
    }

    const maxOffsetDays = Math.ceil(Math.max(...offsets.map((row) => row.offsetMinutes)) / 1440);
    const today = getLocalDate(at, setting.timezone);
    const range = { startDate: addDateKey(today, -maxOffsetDays - 1), endDate: addDateKey(today, NOTIFICATION_JOB_HORIZON_DAYS) };
    const projected = await this.projection.projectEvent(userId, eventId, range, { timezone: setting.timezone, weekStartsOn: setting.weekStartsOn });
    const latestScheduled = at.getTime() + NOTIFICATION_JOB_HORIZON_DAYS * 24 * 60 * 60_000;
    const earliestScheduled = at.getTime() - DELIVERY_WINDOW_MS;
    const jobs: NotificationJob[] = [];
    for (const occurrence of projected) {
      for (const notification of offsets) {
        const schedule = resolveEventNotification(occurrence, notification.offsetMinutes, setting.timezone, setting.periodDefaultDeadlineTime);
        if (!schedule) continue;
        const scheduledAt = schedule.scheduledFor.getTime();
        if (scheduledAt <= earliestScheduled || scheduledAt > latestScheduled) continue;
        const occurrenceKey = occurrence.occurrenceKey ?? null;
        const date = occurrence.periodStartDate ?? occurrence.startDate ?? schedule.baseDate;
        const payload = {
          title: "予定のお知らせ",
          body: occurrence.timingType === "period" ? `${occurrence.title}（期限 ${schedule.baseDate} ${schedule.baseTime}）` : occurrence.allDay ? occurrence.title : `${occurrence.startTime} ${occurrence.title}`,
          data: { kind: "event" as const, eventId, date, occurrenceKey, url: eventNotificationUrl(eventId, date, occurrenceKey) }
        };
        jobs.push({ id: crypto.randomUUID(), userId, eventId, occurrenceKey, eventNotificationId: notification.id, scheduledFor: schedule.scheduledFor.toISOString(), payload, status: "pending", sentAt: null, createdAt: now, updatedAt: now });
      }
    }
    await this.jobs.replacePendingForEvent(userId, eventId, jobs);
    return jobs.length;
  }

  async refill(at: Date): Promise<{ events: number; jobs: number }> {
    const expired = await this.jobs.deleteExpiredPending(new Date(at.getTime() - DELIVERY_WINDOW_MS).toISOString());
    const result = await this.refillTargets(await this.notifications.listEventNotificationTargets(), at);
    console.log(JSON.stringify({ event: "lifehub_notification_jobs_expired", jobs: expired }));
    return result;
  }

  async backfillForUser(userId: string, at: Date): Promise<{ events: number; jobs: number }> {
    return this.refillTargets(await this.notifications.listEventNotificationTargets(userId), at);
  }

  private async refillTargets(targets: Array<{ userId: string; eventId: string }>, at: Date): Promise<{ events: number; jobs: number }> {
    let jobs = 0;
    for (const target of targets) jobs += await this.refreshForEvent(target.userId, target.eventId, at);
    console.log(JSON.stringify({ event: "lifehub_notification_jobs_refilled", events: targets.length, jobs }));
    return { events: targets.length, jobs };
  }
}

export const runNotificationJobRefill = (env: Env, at: Date) => new NotificationJobService(env.DB).refill(at);
