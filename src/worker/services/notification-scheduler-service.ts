import { addDateKey, getLocalDate, getLocalTime, zonedDateTimeToDate } from "../lib/date-time";
import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { NotificationDeliveryRepository, NotificationRepository, type DeliveryClaim } from "../repositories/notification-repository";
import { EventRepository } from "../repositories/event-repository";
import { NotificationJobRepository } from "../repositories/notification-job-repository";
import { NotificationSummaryJobRepository, type NotificationSummaryJob } from "../repositories/notification-summary-job-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { SettingsRepository } from "../repositories/settings-repository";
import { UserStateRepository } from "../repositories/user-state-repository";
import type { Event, UserSettings } from "../types";
import { EventProjectionService } from "./event-projection-service";
import { WebPushService } from "./web-push-service";

export const NOTIFICATION_DELIVERY_WINDOW_MINUTES = 20;
export type SummaryPeriod = "morning" | "evening";
export type ScheduledNotification = { scheduledFor: Date; localDate: string; localTime: string };
export type EventNotificationSchedule = { scheduledFor: Date; baseDate: string; baseTime: string };

const minutesFromTime = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 1440 && Number(match[2]) < 60 ? minutes : null;
};

export const resolveScheduledNotification = (at: Date, timezone: string, scheduledTime: string, windowMinutes = NOTIFICATION_DELIVERY_WINDOW_MINUTES): ScheduledNotification | null => {
  const targetMinutes = minutesFromTime(scheduledTime);
  if (targetMinutes === null || windowMinutes <= 0) return null;
  const localDate = getLocalDate(at, timezone);
  const localTime = getLocalTime(at, timezone);
  const currentMinutes = minutesFromTime(localTime);
  if (currentMinutes === null) return null;
  const delta = currentMinutes - targetMinutes;
  const targetDate = delta >= 0 ? localDate : addDateKey(localDate, -1);
  if ((delta >= 0 ? delta : delta + 1440) >= windowMinutes) return null;
  return { scheduledFor: zonedDateTimeToDate(targetDate, scheduledTime, timezone), localDate: targetDate, localTime: scheduledTime };
};

export const resolveEventNotification = (event: Event, offsetMinutes: number, timezone: string, defaultDeadlineTime: string): EventNotificationSchedule | null => {
  const baseDate = event.timingType === "period" ? event.periodEndDate : event.startDate;
  const baseTime = event.timingType === "period" ? event.deadlineTime ?? defaultDeadlineTime : event.allDay ? "09:00" : event.startTime;
  if (!baseDate || !baseTime || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) return null;
  const base = zonedDateTimeToDate(baseDate, baseTime, timezone);
  return { scheduledFor: new Date(base.getTime() - offsetMinutes * 60_000), baseDate, baseTime };
};

const normalizeTitle = (value: string) => value.replace(/\s+/gu, " ").trim() || "予定";
export const formatSummaryBody = (events: Event[]) => {
  const labels = events.map((event) => {
    const title = normalizeTitle(event.title);
    if (event.timingType === "period") {
      const prefix = event.periodWindowType === "this_week" ? "今週中：" : event.periodWindowType === "this_month" ? "今月中：" : "期間中：";
      return `${prefix}${title}`;
    }
    return event.allDay || !event.startTime ? title : `${event.startTime} ${title}`;
  });
  return labels.length <= 3 ? labels.join("、") : `${labels.slice(0, 3).join("、")}、ほか${labels.length - 3}件`;
};

const summaryTitle = (period: SummaryPeriod) => period === "morning" ? "今日の予定" : "今日の予定を確認";
const eventKey = (event: Event) => `${event.id}:${event.occurrenceKey ?? "definition"}`;
const uniqueEvents = (events: Event[]) => [...new Map(events.map((event) => [eventKey(event), event])).values()];
const pushEnv = (env: Env) => env as Env & { WEB_PUSH_VAPID_PUBLIC_KEY?: string; WEB_PUSH_VAPID_PRIVATE_KEY?: string; WEB_PUSH_SUBJECT?: string };

export class NotificationSchedulerService {
  private readonly settings: SettingsRepository;
  private readonly states: UserStateRepository;
  private readonly notifications: NotificationRepository;
  private readonly deliveries: NotificationDeliveryRepository;
  private readonly jobs: NotificationJobRepository;
  private readonly summaryJobs: NotificationSummaryJobRepository;
  private readonly events: EventRepository;
  private readonly projection: EventProjectionService;
  constructor(private readonly db: D1Database, private readonly push = new WebPushService(db)) {
    this.settings = new SettingsRepository(db);
    this.states = new UserStateRepository(db);
    this.notifications = new NotificationRepository(db);
    this.deliveries = new NotificationDeliveryRepository(db);
    this.jobs = new NotificationJobRepository(db);
    this.summaryJobs = new NotificationSummaryJobRepository(db);
    this.events = new EventRepository(db);
    this.projection = new EventProjectionService(this.events, new RecurrenceRepository(db), new EventOccurrenceOverrideRepository(db));
  }

  async run(env: Env, at = new Date()): Promise<void> {
    const dueEventJobs = await this.jobs.listDue(at.toISOString(), NOTIFICATION_DELIVERY_WINDOW_MINUTES);
    const dueSummaryJobs = await this.summaryJobs.listDue(at.toISOString(), NOTIFICATION_DELIVERY_WINDOW_MINUTES);
    console.log(JSON.stringify({ event: "lifehub_notification_scheduler_started", scheduledTime: at.toISOString(), dueEventJobs: dueEventJobs.length, dueSummaryJobs: dueSummaryJobs.length }));
    for (const job of dueEventJobs) {
      try {
        if ((await this.states.get(job.userId))?.migrationState === "migration_locked") continue;
        const event = await this.events.getById(job.userId, job.eventId);
        if (!event) { await this.jobs.deletePending(job.id); continue; }
        const currentNotifications = await this.notifications.listEventNotificationsForEvent(job.userId, job.eventId);
        if (!currentNotifications.some((notification) => notification.id === job.eventNotificationId)) { await this.jobs.deletePending(job.id); continue; }
        const occurrenceKey = job.occurrenceKey;
        await this.deliver({
          id: crypto.randomUUID(), userId: job.userId, notificationType: "event", eventId: job.eventId, occurrenceKey, eventNotificationId: job.eventNotificationId,
          scheduledFor: job.scheduledFor, dedupeKey: `event:${job.eventNotificationId}:${occurrenceKey ?? job.eventId}:${job.scheduledFor}`, now: at.toISOString()
        }, env, job.payload, job.id);
      } catch (error) {
        console.error(JSON.stringify({ event: "lifehub_notification_job_failed", jobId: job.id, errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
    }
    for (const job of dueSummaryJobs) {
      try {
        if ((await this.states.get(job.userId))?.migrationState === "migration_locked") continue;
        const setting = await this.settings.getOrCreate(job.userId, at.toISOString());
        const enabled = job.summaryType === "morning" ? setting.morningSummaryEnabled : setting.eveningSummaryEnabled;
        const configuredTime = job.summaryType === "morning" ? setting.morningSummaryTime : setting.eveningSummaryTime;
        const scheduledFor = zonedDateTimeToDate(job.localDate, configuredTime, setting.timezone).toISOString();
        if (!enabled || scheduledFor !== job.scheduledFor) {
          await this.summaryJobs.markSent(job.id, at.toISOString());
          continue;
        }
        const events = uniqueEvents(await this.projection.project(job.userId, { startDate: job.localDate, endDate: job.localDate }, { timezone: setting.timezone, weekStartsOn: setting.weekStartsOn }));
        if (events.length === 0) {
          await this.summaryJobs.markSent(job.id, at.toISOString());
          continue;
        }
        const notificationType = job.summaryType === "morning" ? "morning_summary" : "evening_summary";
        await this.deliver({ id: crypto.randomUUID(), userId: job.userId, notificationType, eventId: null, occurrenceKey: null, eventNotificationId: null, scheduledFor: job.scheduledFor, dedupeKey: `summary:${job.userId}:${notificationType}:${job.scheduledFor}`, now: at.toISOString() }, env, { title: summaryTitle(job.summaryType), body: formatSummaryBody(events), data: { kind: "summary", period: job.summaryType, localDate: job.localDate, url: `/calendar?date=${job.localDate}` } }, undefined, job);
      } catch (error) {
        console.error(JSON.stringify({ event: "lifehub_notification_summary_job_failed", jobId: job.id, errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
    }
  }

  private async deliver(claim: DeliveryClaim, env: Env, payload: object, jobId?: string, summaryJob?: NotificationSummaryJob): Promise<void> {
    if (!(await this.deliveries.claim(claim))) {
      if (jobId && await this.deliveries.isSent(claim.dedupeKey)) await this.jobs.markSent(jobId, claim.now);
      if (summaryJob && await this.deliveries.isSent(claim.dedupeKey)) await this.summaryJobs.markSent(summaryJob.id, claim.now);
      return;
    }
    try { const result = await this.push.sendPayload(claim.userId, payload, pushEnv(env)); if (result.sent > 0) { await this.deliveries.markSent(claim.dedupeKey, claim.now); if (jobId) await this.jobs.markSent(jobId, claim.now); if (summaryJob) await this.summaryJobs.markSent(summaryJob.id, claim.now); } else await this.deliveries.release(claim.dedupeKey); }
    catch (error) { await this.deliveries.release(claim.dedupeKey); console.error(JSON.stringify({ event: "lifehub_notification_delivery_failed", notificationType: claim.notificationType, errorName: error instanceof Error ? error.name : "UnknownError" })); }
  }
}

export const eventNotificationUrl = (eventId: string, date: string, occurrenceKey: string | null) => `/calendar?date=${encodeURIComponent(date)}&event=${encodeURIComponent(eventId)}${occurrenceKey ? `&occurrenceKey=${encodeURIComponent(occurrenceKey)}` : ""}`;
export const runNotificationScheduler = (env: Env, at: Date) => new NotificationSchedulerService(env.DB).run(env, at);
