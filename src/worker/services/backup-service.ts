import { canonicalBackupSerialize, backupSha256Hex, APP_VERSION, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type BackupCloudPayload, type BackupExportResponse } from "../../lib/backup";
import type { DailyNote, Event, EventNotification, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, NotificationDelivery, NotificationTemplate, NotificationTemplateOffset, RecurrenceRule } from "../types";
import { SettingsRepository } from "../repositories/settings-repository";

const eventFields = "id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at";
const moneyFields = "id, user_id, type, title, category_id, planned_amount, date, time, recurrence_rule_id, memo, active, deleted_at, created_at, updated_at";
const ruleFields = "id, user_id, frequency, interval, weekdays, day_of_month, starts_on, ends_on, created_at, updated_at";

const eventRow = (row: Record<string, unknown>): Event => ({ id: String(row.id), userId: String(row.user_id), category: row.category as Event["category"], title: String(row.title), place: row.place as string | null, memo: row.memo as string | null, timingType: row.timing_type as Event["timingType"], allDay: row.all_day === null ? null : Number(row.all_day) === 1, startDate: row.start_date as string | null, startTime: row.start_time as string | null, endDate: row.end_date as string | null, endTime: row.end_time as string | null, periodWindowType: row.period_window_type as Event["periodWindowType"], periodAnchorDate: row.period_anchor_date as string | null, periodStartDate: row.period_start_date as string | null, periodEndDate: row.period_end_date as string | null, deadlineTime: row.deadline_time as string | null, recurrenceRuleId: row.recurrence_rule_id as string | null, active: Number(row.active) === 1, deletedAt: row.deleted_at as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const ruleRow = (row: Record<string, unknown>): RecurrenceRule => ({ id: String(row.id), userId: String(row.user_id), frequency: row.frequency as RecurrenceRule["frequency"], interval: Number(row.interval), weekdays: typeof row.weekdays === "string" ? JSON.parse(row.weekdays) as number[] : null, dayOfMonth: row.day_of_month === null ? null : Number(row.day_of_month), startsOn: String(row.starts_on), endsOn: row.ends_on as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const dailyRow = (row: Record<string, unknown>): DailyNote => ({ id: String(row.id), userId: String(row.user_id), date: String(row.date), content: String(row.content), createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const moneyRow = (row: Record<string, unknown>): MoneyItem => ({ id: String(row.id), userId: String(row.user_id), type: row.type as MoneyItem["type"], title: String(row.title), categoryId: String(row.category_id), plannedAmount: Number(row.planned_amount), date: String(row.date), time: row.time as string | null, recurrenceRuleId: row.recurrence_rule_id as string | null, memo: row.memo as string | null, active: Number(row.active) === 1, deletedAt: row.deleted_at as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const categoryRow = (row: Record<string, unknown>): MoneyCategory => ({ id: String(row.id), userId: String(row.user_id), type: row.type as MoneyCategory["type"], name: String(row.name), colorKey: row.color_key as string | null, sortOrder: Number(row.sort_order), active: Number(row.active) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const eventOverrideRow = (row: Record<string, unknown>): EventOccurrenceOverride => ({ id: String(row.id), userId: String(row.user_id), eventId: String(row.event_id), occurrenceKey: String(row.occurrence_key), overrideType: row.override_type as EventOccurrenceOverride["overrideType"], patch: typeof row.patch_json === "string" ? JSON.parse(row.patch_json) as EventOccurrenceOverride["patch"] : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const moneyOverrideRow = (row: Record<string, unknown>): MoneyOccurrenceOverride => ({ id: String(row.id), userId: String(row.user_id), moneyItemId: String(row.money_item_id), occurrenceKey: String(row.occurrence_key), overrideType: row.override_type as MoneyOccurrenceOverride["overrideType"], patch: typeof row.patch_json === "string" ? JSON.parse(row.patch_json) as MoneyOccurrenceOverride["patch"] : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const settlementRow = (row: Record<string, unknown>): MoneyOccurrenceSettlement => ({ id: String(row.id), userId: String(row.user_id), moneyItemId: String(row.money_item_id), occurrenceKey: String(row.occurrence_key), status: row.status as MoneyOccurrenceSettlement["status"], amount: Number(row.amount), finalizedAt: String(row.finalized_at), updatedAt: String(row.updated_at), estimatedAmount: row.estimated_amount === null ? null : Number(row.estimated_amount) });
const eventNotificationRow = (row: Record<string, unknown>): EventNotification => ({ id: String(row.id), userId: String(row.user_id), eventId: String(row.event_id), offsetMinutes: Number(row.offset_minutes), sortOrder: Number(row.sort_order), createdAt: String(row.created_at) });
const deliveryRow = (row: Record<string, unknown>): NotificationDelivery => ({ id: String(row.id), userId: String(row.user_id), notificationType: row.notification_type as NotificationDelivery["notificationType"], eventId: row.event_id as string | null, occurrenceKey: row.occurrence_key as string | null, eventNotificationId: row.event_notification_id as string | null, scheduledFor: String(row.scheduled_for), dedupeKey: String(row.dedupe_key), sentAt: row.sent_at as string | null, status: row.status as NotificationDelivery["status"], claimedAt: row.claimed_at as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });

const templateRow = (row: Record<string, unknown>, offsets: NotificationTemplateOffset[]): NotificationTemplate => ({ id: String(row.id), userId: String(row.user_id), name: String(row.name), targetCategory: row.target_category as NotificationTemplate["targetCategory"], isDefault: Number(row.is_default) === 1, active: Number(row.active) === 1, offsets, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });

export class BackupService {
  constructor(private readonly db: D1Database) {}

  async exportCloud(userId: string, now = new Date()): Promise<BackupExportResponse> {
    const settings = await new SettingsRepository(this.db).getOrCreate(userId, now.toISOString(), "Asia/Tokyo");
    const [eventRows, ruleRows, eventOverrideRows, eventNotificationRows, templateRows, dailyRows, categoryRows, moneyRows, moneyOverrideRows, settlementRows, deliveryRows] = await Promise.all([
      this.db.prepare(`SELECT ${eventFields} FROM events WHERE user_id = ? ORDER BY id`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare(`SELECT ${ruleFields} FROM recurrence_rules WHERE user_id = ? ORDER BY id`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, event_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM event_occurrence_overrides WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, event_id, offset_minutes, sort_order, created_at FROM event_notifications WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, name, target_category, is_default, active, created_at, updated_at FROM notification_templates WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, date, content, created_at, updated_at FROM daily_notes WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, type, name, color_key, sort_order, active, created_at, updated_at FROM money_categories WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare(`SELECT ${moneyFields} FROM money_items WHERE user_id = ? ORDER BY id`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, money_item_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM money_occurrence_overrides WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, money_item_id, occurrence_key, status, amount, finalized_at, updated_at, estimated_amount FROM money_occurrence_settlements WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, notification_type, event_id, occurrence_key, event_notification_id, scheduled_for, dedupe_key, sent_at, status, claimed_at, created_at, updated_at FROM notification_deliveries WHERE user_id = ? ORDER BY id").bind(userId).all<Record<string, unknown>>()
    ]);
    const templateOffsets = await Promise.all(templateRows.results.map(async (row) => {
      const offsets = await this.db.prepare("SELECT id, template_id, offset_minutes, sort_order FROM notification_template_offsets WHERE template_id = ? ORDER BY id").bind(String(row.id)).all<Record<string, unknown>>();
      return [String(row.id), offsets.results.map((offset) => ({ id: String(offset.id), templateId: String(offset.template_id), offsetMinutes: Number(offset.offset_minutes), sortOrder: Number(offset.sort_order) })) satisfies NotificationTemplateOffset[]] as const;
    }));
    const offsetMap = new Map(templateOffsets);
    const cloud: BackupCloudPayload = {
      settings,
      events: eventRows.results.map(eventRow),
      recurrenceRules: ruleRows.results.map(ruleRow),
      eventOverrides: eventOverrideRows.results.map(eventOverrideRow),
      eventNotifications: eventNotificationRows.results.map(eventNotificationRow),
      notificationTemplates: templateRows.results.map((row) => templateRow(row, offsetMap.get(String(row.id)) ?? [])),
      notificationDeliveries: deliveryRows.results.map(deliveryRow),
      dailyNotes: dailyRows.results.map(dailyRow),
      moneyCategories: categoryRows.results.map(categoryRow),
      moneyItems: moneyRows.results.map(moneyRow),
      moneyOverrides: moneyOverrideRows.results.map(moneyOverrideRow),
      moneySettlements: settlementRows.results.map(settlementRow)
    };
    return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(), appVersion: APP_VERSION, user: { id: userId }, cloud, cloudChecksum: await backupSha256Hex(canonicalBackupSerialize(cloud)) };
  }
}
