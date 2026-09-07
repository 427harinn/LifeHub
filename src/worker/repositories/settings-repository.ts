import {
  DEFAULT_EVENING_SUMMARY_TIME,
  DEFAULT_MORNING_SUMMARY_TIME,
  DEFAULT_PERIOD_DEADLINE_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEK_STARTS_ON
} from "../lib/constants";
import type { UserSettings } from "../types";

type SettingsRow = {
  user_id: string;
  timezone: string;
  week_starts_on: number;
  morning_summary_enabled: number;
  morning_summary_time: string;
  evening_summary_enabled: number;
  evening_summary_time: string;
  period_default_deadline_time: string;
  created_at: string;
  updated_at: string;
};

const toSettings = (row: SettingsRow): UserSettings => ({
  userId: row.user_id,
  timezone: row.timezone,
  weekStartsOn: row.week_starts_on,
  morningSummaryEnabled: row.morning_summary_enabled === 1,
  morningSummaryTime: row.morning_summary_time,
  eveningSummaryEnabled: row.evening_summary_enabled === 1,
  eveningSummaryTime: row.evening_summary_time,
  periodDefaultDeadlineTime: row.period_default_deadline_time,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const userSettingsSelect = "user_id, timezone, week_starts_on, morning_summary_enabled, morning_summary_time, evening_summary_enabled, evening_summary_time, period_default_deadline_time, created_at, updated_at";

export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async getOrCreate(userId: string, now: string, timezone = DEFAULT_TIMEZONE): Promise<UserSettings> {
    const existing = await this.db.prepare(`SELECT ${userSettingsSelect} FROM user_settings WHERE user_id = ?`).bind(userId).first<SettingsRow>();
    if (existing) return toSettings(existing);
    await this.db.prepare(
      "INSERT INTO user_settings (user_id, timezone, week_starts_on, morning_summary_enabled, morning_summary_time, evening_summary_enabled, evening_summary_time, period_default_deadline_time, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 1, ?, ?, ?, ?)"
    ).bind(userId, timezone, DEFAULT_WEEK_STARTS_ON, DEFAULT_MORNING_SUMMARY_TIME, DEFAULT_EVENING_SUMMARY_TIME, DEFAULT_PERIOD_DEADLINE_TIME, now, now).run();
    const created = await this.db.prepare(`SELECT ${userSettingsSelect} FROM user_settings WHERE user_id = ?`).bind(userId).first<SettingsRow>();
    if (!created) throw new Error("UserSettings could not be created");
    return toSettings(created);
  }

  async update(userId: string, input: Partial<Omit<UserSettings, "userId" | "createdAt" | "updatedAt">>, now: string): Promise<UserSettings> {
    const current = await this.getOrCreate(userId, now, input.timezone);
    const next = {
      timezone: input.timezone ?? current.timezone,
      weekStartsOn: input.weekStartsOn ?? current.weekStartsOn,
      morningSummaryEnabled: input.morningSummaryEnabled ?? current.morningSummaryEnabled,
      morningSummaryTime: input.morningSummaryTime ?? current.morningSummaryTime,
      eveningSummaryEnabled: input.eveningSummaryEnabled ?? current.eveningSummaryEnabled,
      eveningSummaryTime: input.eveningSummaryTime ?? current.eveningSummaryTime,
      periodDefaultDeadlineTime: input.periodDefaultDeadlineTime ?? current.periodDefaultDeadlineTime
    };
    await this.db.prepare(
      "UPDATE user_settings SET timezone = ?, week_starts_on = ?, morning_summary_enabled = ?, morning_summary_time = ?, evening_summary_enabled = ?, evening_summary_time = ?, period_default_deadline_time = ?, updated_at = ? WHERE user_id = ?"
    ).bind(next.timezone, next.weekStartsOn, next.morningSummaryEnabled ? 1 : 0, next.morningSummaryTime, next.eveningSummaryEnabled ? 1 : 0, next.eveningSummaryTime, next.periodDefaultDeadlineTime, now, userId).run();
    return this.getOrCreate(userId, now);
  }
}
