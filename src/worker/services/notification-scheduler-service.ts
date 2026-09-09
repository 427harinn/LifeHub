import { addDateKey, getLocalDate, getLocalTime, zonedDateTimeToDate } from "../lib/date-time";
import { NotificationDeliveryRepository, NotificationRepository, type DeliveryClaim } from "../repositories/notification-repository";
import { EventOccurrenceOverrideRepository } from "../repositories/event-occurrence-override-repository";
import { EventRepository } from "../repositories/event-repository";
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
  private readonly projection: EventProjectionService;
  constructor(private readonly db: D1Database, private readonly push = new WebPushService(db)) {
    this.settings = new SettingsRepository(db);
    this.states = new UserStateRepository(db);
    this.notifications = new NotificationRepository(db);
    this.deliveries = new NotificationDeliveryRepository(db);
    this.projection = new EventProjectionService(new EventRepository(db), new RecurrenceRepository(db), new EventOccurrenceOverrideRepository(db));
  }

  async run(env: Env, at = new Date()): Promise<void> {
    for (const setting of await this.settings.listAll()) {
      try { if ((await this.states.getOrCreate(setting.userId, at.toISOString())).migrationState === "migration_locked") continue; await this.runForUser(setting, env, at); }
      catch (error) { console.error(JSON.stringify({ event: "lifehub_notification_scheduler_user_failed", userId: setting.userId, errorName: error instanceof Error ? error.name : "UnknownError" })); }
    }
  }

  private async runForUser(setting: UserSettings, env: Env, at: Date): Promise<void> {
    const rows = await this.notifications.listEventNotifications(setting.userId);
    const maxOffset = rows.reduce((max, row) => Math.max(max, row.offsetMinutes), 0);
    const localDate = getLocalDate(at, setting.timezone);
    const range = { startDate: addDateKey(localDate, -2), endDate: addDateKey(localDate, Math.ceil(maxOffset / 1440) + 2) };
    const projected = await this.projection.project(setting.userId, range, { timezone: setting.timezone, weekStartsOn: setting.weekStartsOn });
    await this.runEventNotifications(setting, rows, uniqueEvents(projected), env, at);
    await this.runSummary(setting, "morning", setting.morningSummaryEnabled, setting.morningSummaryTime, env, at);
    await this.runSummary(setting, "evening", setting.eveningSummaryEnabled, setting.eveningSummaryTime, env, at);
  }

  private async runEventNotifications(setting: UserSettings, rows: Array<{ id: string; eventId: string; offsetMinutes: number }>, events: Event[], env: Env, at: Date): Promise<void> {
    const byEvent = new Map<string, Array<{ id: string; offsetMinutes: number }>>();
    for (const row of rows) byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row]);
    for (const event of events) {
      const eventRows = byEvent.get(event.id) ?? [];
      for (const row of eventRows) {
        const schedule = resolveEventNotification(event, row.offsetMinutes, setting.timezone, setting.periodDefaultDeadlineTime);
        if (!schedule) continue;
        const { scheduledFor, baseDate, baseTime } = schedule;
        const delta = at.getTime() - scheduledFor.getTime();
        if (delta < 0 || delta >= NOTIFICATION_DELIVERY_WINDOW_MINUTES * 60_000) continue;
        const occurrenceKey = event.occurrenceKey ?? null;
        await this.deliver({
          id: crypto.randomUUID(),
          userId: setting.userId, notificationType: "event", eventId: event.id, occurrenceKey, eventNotificationId: row.id,
          scheduledFor: scheduledFor.toISOString(), dedupeKey: `event:${row.id}:${occurrenceKey ?? event.id}:${scheduledFor.toISOString()}`,
          now: at.toISOString()
        }, env, { title: "予定のお知らせ", body: event.timingType === "period" ? `${event.title}（期限 ${baseDate} ${baseTime}）` : event.allDay ? event.title : `${event.startTime} ${event.title}`, data: { kind: "event", eventId: event.id, date: event.startDate ?? event.periodStartDate ?? baseDate, occurrenceKey, url: eventNotificationUrl(event.id, event.startDate ?? event.periodStartDate ?? baseDate, occurrenceKey) } });
      }
    }
  }

  private async runSummary(setting: UserSettings, period: SummaryPeriod, enabled: boolean, time: string, env: Env, at: Date): Promise<void> {
    if (!enabled) return;
    const schedule = resolveScheduledNotification(at, setting.timezone, time);
    if (!schedule) return;
    const events = uniqueEvents(await this.projection.project(setting.userId, { startDate: schedule.localDate, endDate: schedule.localDate }, { timezone: setting.timezone, weekStartsOn: setting.weekStartsOn }));
    if (events.length === 0) return;
    const notificationType = period === "morning" ? "morning_summary" : "evening_summary";
    await this.deliver({ id: crypto.randomUUID(), userId: setting.userId, notificationType, eventId: null, occurrenceKey: null, eventNotificationId: null, scheduledFor: schedule.scheduledFor.toISOString(), dedupeKey: `summary:${setting.userId}:${notificationType}:${schedule.scheduledFor.toISOString()}`, now: at.toISOString() }, env, { title: summaryTitle(period), body: formatSummaryBody(events), data: { kind: "summary", period, localDate: schedule.localDate, url: `/calendar?date=${schedule.localDate}` } });
  }

  private async deliver(claim: DeliveryClaim, env: Env, payload: object): Promise<void> {
    if (!(await this.deliveries.claim(claim))) return;
    try { const result = await this.push.sendPayload(claim.userId, payload, pushEnv(env)); if (result.sent > 0) await this.deliveries.markSent(claim.dedupeKey, claim.now); else await this.deliveries.release(claim.dedupeKey); }
    catch (error) { await this.deliveries.release(claim.dedupeKey); console.error(JSON.stringify({ event: "lifehub_notification_delivery_failed", notificationType: claim.notificationType, errorName: error instanceof Error ? error.name : "UnknownError" })); }
  }
}

export const eventNotificationUrl = (eventId: string, date: string, occurrenceKey: string | null) => `/calendar?date=${encodeURIComponent(date)}&event=${encodeURIComponent(eventId)}${occurrenceKey ? `&occurrenceKey=${encodeURIComponent(occurrenceKey)}` : ""}`;
export const runNotificationScheduler = (env: Env, at: Date) => new NotificationSchedulerService(env.DB).run(env, at);
