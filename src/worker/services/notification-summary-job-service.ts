import { addDateKey, getLocalDate, zonedDateTimeToDate } from "../lib/date-time";
import { NotificationSummaryJobRepository, type NotificationSummaryJob, type SummaryJobType } from "../repositories/notification-summary-job-repository";
import { SettingsRepository } from "../repositories/settings-repository";
import type { UserSettings } from "../types";

export const SUMMARY_JOB_HORIZON_DAYS = 7;
const scheduleFor = (settings: UserSettings, type: SummaryJobType, localDate: string) => zonedDateTimeToDate(localDate, type === "morning" ? settings.morningSummaryTime : settings.eveningSummaryTime, settings.timezone).toISOString();

export class NotificationSummaryJobService {
  private readonly jobs: NotificationSummaryJobRepository;
  private readonly settings: SettingsRepository;
  constructor(private readonly db: D1Database, dependencies?: { jobs?: NotificationSummaryJobRepository; settings?: SettingsRepository }) {
    this.jobs = dependencies?.jobs ?? new NotificationSummaryJobRepository(db);
    this.settings = dependencies?.settings ?? new SettingsRepository(db);
  }

  async refreshForUser(userId: string, at: Date): Promise<number> {
    const setting = await this.settings.getOrCreate(userId, at.toISOString());
    return this.refreshForSettings(setting, at);
  }

  async refill(at: Date): Promise<{ users: number; jobs: number }> {
    const allSettings = await this.settings.listAll();
    const expired = await this.jobs.deleteExpiredPending(new Date(at.getTime() - 20 * 60_000).toISOString());
    let jobs = 0;
    for (const setting of allSettings) jobs += await this.refreshForSettings(setting, at);
    console.log(JSON.stringify({ event: "lifehub_notification_summary_jobs_refilled", users: allSettings.length, jobs, expired }));
    return { users: allSettings.length, jobs };
  }

  private async refreshForSettings(setting: UserSettings, at: Date): Promise<number> {
    const now = at.toISOString();
    const today = getLocalDate(at, setting.timezone);
    const jobs: NotificationSummaryJob[] = [];
    for (const summaryType of ["morning", "evening"] as const) {
      if (!(summaryType === "morning" ? setting.morningSummaryEnabled : setting.eveningSummaryEnabled)) continue;
      for (let day = 0; day <= SUMMARY_JOB_HORIZON_DAYS; day += 1) {
        const localDate = addDateKey(today, day);
        const scheduledFor = scheduleFor(setting, summaryType, localDate);
        if (Date.parse(scheduledFor) <= at.getTime()) continue;
        jobs.push({ id: crypto.randomUUID(), userId: setting.userId, summaryType, localDate, scheduledFor, status: "pending", sentAt: null, createdAt: now, updatedAt: now });
      }
    }
    await this.jobs.replacePendingForUser(setting.userId, jobs);
    return jobs.length;
  }
}

export const runNotificationSummaryJobRefill = (env: Env, at: Date) => new NotificationSummaryJobService(env.DB).refill(at);
