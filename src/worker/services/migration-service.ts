import { validateBackup, type BackupManifest } from "../../lib/backup";
import { AppError, type ErrorCode } from "../lib/errors";
import { UserStateRepository } from "../repositories/user-state-repository";

export type MigrationStatus = "locked" | "awaiting_restore" | "restoring" | "restore_verified" | "completed" | "error_recoverable";
type MigrationRow = { id: string; user_id: string; status: MigrationStatus; backup_checksum: string; schema_version: number; manifest_json: string; started_at: string; restored_at: string | null; completed_at: string | null; last_error: string | null; cleanup_completed: number };

export const canRestoreMigration = (status: MigrationStatus) => status === "awaiting_restore" || status === "restoring" || status === "error_recoverable";
export const canCompleteMigration = (status: MigrationStatus) => status === "restore_verified" || status === "completed";
export const canCancelMigration = (status: MigrationStatus, cleanupCompleted: boolean) => status === "locked" && !cleanupCompleted;

const migrationError = (code: ErrorCode, message: string, status = 409) => new AppError(code, status, message);
const allDomainDeletes = (db: D1Database, userId: string) => [
  db.prepare("DELETE FROM notification_deliveries WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM event_notifications WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM notification_template_offsets WHERE template_id IN (SELECT id FROM notification_templates WHERE user_id = ?)").bind(userId),
  db.prepare("DELETE FROM notification_templates WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM event_occurrence_overrides WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM money_occurrence_overrides WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM money_occurrence_settlements WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM daily_notes WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM money_items WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM events WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM recurrence_rules WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM money_categories WHERE user_id = ?").bind(userId),
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId)
];

const stateUpdate = (db: D1Database, userId: string, now: string, checksum: string | null, locked: boolean) => db.prepare("UPDATE lifehub_user_state SET migration_state = ?, migration_started_at = CASE WHEN ? = 1 THEN COALESCE(migration_started_at, ?) ELSE migration_started_at END, migration_backup_checksum = CASE WHEN ? = 1 THEN ? ELSE migration_backup_checksum END, migration_backup_created_at = CASE WHEN ? = 1 THEN ? ELSE migration_backup_created_at END, updated_at = ? WHERE user_id = ?").bind(locked ? "migration_locked" : "active", locked ? 1 : 0, now, locked ? 1 : 0, checksum, locked ? 1 : 0, now, now, userId);

const queryMigration = async (db: D1Database, userId: string, id?: string) => db.prepare(`SELECT id, user_id, status, backup_checksum, schema_version, manifest_json, started_at, restored_at, completed_at, last_error, cleanup_completed FROM user_migrations WHERE user_id = ? ${id ? "AND id = ?" : "ORDER BY started_at DESC LIMIT 1"}`).bind(...(id ? [userId, id] : [userId])).first<MigrationRow>();

const toPublic = (row: MigrationRow | null) => row ? { migrationId: row.id, status: row.status, backupChecksum: row.backup_checksum, schemaVersion: row.schema_version, startedAt: row.started_at, restoredAt: row.restored_at, completedAt: row.completed_at, lastError: row.last_error, cleanupCompleted: row.cleanup_completed === 1 } : null;

export class MigrationService {
  constructor(private readonly db: D1Database) {}

  async status(userId: string) {
    const state = await new UserStateRepository(this.db).getOrCreate(userId, new Date().toISOString());
    return { state, migration: toPublic(await queryMigration(this.db, userId)) };
  }

  async start(userId: string, input: { migrationId: string; backupChecksum: string; schemaVersion: number; manifest: BackupManifest; backup: unknown }, now = new Date().toISOString()) {
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.migrationId) || !/^[a-f0-9]{64}$/.test(input.backupChecksum) || input.schemaVersion !== 1) throw migrationError("MIGRATION_INPUT_INVALID", "機種変更の確認情報が不正です.", 400);
    if (!Number.isInteger(input.manifest.recordCount) || input.manifest.recordCount < 0 || !Number.isInteger(input.manifest.cloudRecordCount) || !Number.isInteger(input.manifest.archiveRecordCount) || typeof input.manifest.payloadChecksum !== "string") throw migrationError("MIGRATION_MANIFEST_INVALID", "バックアップの確認情報が不正です.", 400);
    const state = await new UserStateRepository(this.db).getOrCreate(userId, now);
    const validated = await validateBackup(input.backup, { currentUserId: userId });
    if (validated.backup.checksum !== input.backupChecksum || validated.backup.schemaVersion !== input.schemaVersion || JSON.stringify(validated.manifest) !== JSON.stringify(input.manifest)) throw migrationError("MIGRATION_CHECKSUM_MISMATCH", "保存済みJSONの検証結果が一致しません。");
    const existing = await queryMigration(this.db, userId, input.migrationId);
    if (existing) {
      if (existing.backup_checksum !== input.backupChecksum) throw migrationError("MIGRATION_ID_REUSED", "別のバックアップで同じ機種変更IDは使えません。");
      return { started: true, alreadyStarted: true, migration: toPublic(existing) };
    }
    if (state.migrationState === "migration_locked") throw migrationError("MIGRATION_ALREADY_LOCKED", "すでに機種変更中です。");
    const statements: D1PreparedStatement[] = [
      this.db.prepare("INSERT INTO user_migrations (id, user_id, status, backup_checksum, schema_version, manifest_json, started_at, restored_at, completed_at, last_error, cleanup_completed) VALUES (?, ?, 'locked', ?, ?, ?, ?, NULL, NULL, NULL, 0)").bind(input.migrationId, userId, input.backupChecksum, input.schemaVersion, JSON.stringify(input.manifest), now),
      stateUpdate(this.db, userId, now, input.backupChecksum, true),
      ...allDomainDeletes(this.db, userId),
      this.db.prepare("UPDATE user_migrations SET status = 'awaiting_restore', cleanup_completed = 1 WHERE id = ? AND user_id = ?").bind(input.migrationId, userId)
    ];
    await this.db.batch(statements);
    return { started: true, alreadyStarted: false, migration: toPublic(await queryMigration(this.db, userId, input.migrationId)) };
  }

  async restore(userId: string, migrationId: string, input: unknown) {
    const row = await queryMigration(this.db, userId, migrationId);
    if (!row) throw migrationError("MIGRATION_NOT_FOUND", "機種変更情報が見つかりません。", 404);
    if (!canRestoreMigration(row.status)) throw migrationError("MIGRATION_RESTORE_NOT_ALLOWED", "この機種変更状態では復元できません。");
    const validated = await validateBackup(input, { currentUserId: userId });
    if (validated.backup.checksum !== row.backup_checksum) throw migrationError("MIGRATION_CHECKSUM_MISMATCH", "保存したバックアップが機種変更開始時のものと一致しません。");
    const backup = validated.backup;
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [...allDomainDeletes(this.db, userId)];
    const settings = backup.cloud.settings;
    statements.push(this.db.prepare("INSERT INTO user_settings (user_id, timezone, week_starts_on, morning_summary_enabled, morning_summary_time, evening_summary_enabled, evening_summary_time, period_default_deadline_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, week_starts_on = excluded.week_starts_on, morning_summary_enabled = excluded.morning_summary_enabled, morning_summary_time = excluded.morning_summary_time, evening_summary_enabled = excluded.evening_summary_enabled, evening_summary_time = excluded.evening_summary_time, period_default_deadline_time = excluded.period_default_deadline_time, updated_at = excluded.updated_at").bind(userId, settings.timezone, settings.weekStartsOn, settings.morningSummaryEnabled ? 1 : 0, settings.morningSummaryTime, settings.eveningSummaryEnabled ? 1 : 0, settings.eveningSummaryTime, settings.periodDefaultDeadlineTime, settings.createdAt, now));
    for (const category of backup.cloud.moneyCategories) statements.push(this.db.prepare("INSERT INTO money_categories (id, user_id, type, name, color_key, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(category.id, userId, category.type, category.name, category.colorKey, category.sortOrder, category.active ? 1 : 0, category.createdAt, category.updatedAt));
    for (const rule of backup.cloud.recurrenceRules) statements.push(this.db.prepare("INSERT INTO recurrence_rules (id, user_id, frequency, interval, weekdays, day_of_month, starts_on, ends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(rule.id, userId, rule.frequency, rule.interval, rule.weekdays ? JSON.stringify(rule.weekdays) : null, rule.dayOfMonth, rule.startsOn, rule.endsOn, rule.createdAt, rule.updatedAt));
    for (const event of backup.cloud.events) statements.push(this.db.prepare("INSERT INTO events (id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(event.id, userId, event.category, event.title, event.place, event.memo, event.timingType, event.allDay === null ? null : event.allDay ? 1 : 0, event.startDate, event.startTime, event.endDate, event.endTime, event.periodWindowType, event.periodAnchorDate, event.periodStartDate, event.periodEndDate, event.deadlineTime, event.recurrenceRuleId, event.active ? 1 : 0, event.deletedAt, event.createdAt, event.updatedAt));
    for (const template of backup.cloud.notificationTemplates) {
      statements.push(this.db.prepare("INSERT INTO notification_templates (id, user_id, name, target_category, is_default, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(template.id, userId, template.name, template.targetCategory, template.isDefault ? 1 : 0, template.active ? 1 : 0, template.createdAt, template.updatedAt));
      for (const offset of template.offsets) statements.push(this.db.prepare("INSERT INTO notification_template_offsets (id, template_id, offset_minutes, sort_order) VALUES (?, ?, ?, ?)").bind(offset.id, template.id, offset.offsetMinutes, offset.sortOrder));
    }
    for (const notification of backup.cloud.eventNotifications) statements.push(this.db.prepare("INSERT INTO event_notifications (id, user_id, event_id, offset_minutes, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(notification.id, userId, notification.eventId, notification.offsetMinutes, notification.sortOrder, notification.createdAt));
    for (const override of backup.cloud.eventOverrides) statements.push(this.db.prepare("INSERT INTO event_occurrence_overrides (id, user_id, event_id, occurrence_key, override_type, patch_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(override.id, userId, override.eventId, override.occurrenceKey, override.overrideType, override.patch ? JSON.stringify(override.patch) : null, override.createdAt, override.updatedAt));
    for (const note of backup.cloud.dailyNotes) statements.push(this.db.prepare("INSERT INTO daily_notes (id, user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(note.id, userId, note.date, note.content, note.createdAt, note.updatedAt));
    for (const item of backup.cloud.moneyItems) statements.push(this.db.prepare("INSERT INTO money_items (id, user_id, type, title, category_id, planned_amount, date, time, recurrence_rule_id, memo, active, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, userId, item.type, item.title, item.categoryId, item.plannedAmount, item.date, item.time, item.recurrenceRuleId, item.memo, item.active ? 1 : 0, item.deletedAt, item.createdAt, item.updatedAt));
    for (const override of backup.cloud.moneyOverrides) statements.push(this.db.prepare("INSERT INTO money_occurrence_overrides (id, user_id, money_item_id, occurrence_key, override_type, type, title, category_id, planned_amount, date, memo, patch_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(override.id, userId, override.moneyItemId, override.occurrenceKey, override.overrideType, override.patch?.type ?? null, override.patch?.title ?? null, override.patch?.categoryId ?? null, override.patch?.plannedAmount ?? null, override.patch?.date ?? null, override.patch?.memo ?? null, override.patch ? JSON.stringify(override.patch) : null, override.createdAt, override.updatedAt));
    for (const settlement of backup.cloud.moneySettlements) statements.push(this.db.prepare("INSERT INTO money_occurrence_settlements (id, user_id, money_item_id, occurrence_key, status, amount, finalized_at, updated_at, estimated_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(settlement.id, userId, settlement.moneyItemId, settlement.occurrenceKey, settlement.status, settlement.amount, settlement.finalizedAt, settlement.updatedAt, settlement.estimatedAmount));
    for (const delivery of backup.cloud.notificationDeliveries) statements.push(this.db.prepare("INSERT INTO notification_deliveries (id, user_id, notification_type, event_id, occurrence_key, event_notification_id, scheduled_for, dedupe_key, sent_at, status, claimed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(delivery.id, userId, delivery.notificationType, delivery.eventId, delivery.occurrenceKey, delivery.eventNotificationId, delivery.scheduledFor, delivery.dedupeKey, delivery.sentAt, delivery.status, delivery.claimedAt, delivery.createdAt, delivery.updatedAt));
    statements.push(this.db.prepare("UPDATE user_migrations SET status = 'restoring', restored_at = NULL, last_error = NULL WHERE id = ? AND user_id = ?").bind(migrationId, userId));
    await this.db.batch(statements);
    return { restored: true, migration: toPublic(await queryMigration(this.db, userId, migrationId)), cloudRecordCount: validated.manifest.cloudRecordCount };
  }

  async verify(userId: string, migrationId: string, backupChecksumValue: string, archiveRecordCount: number) {
    const row = await queryMigration(this.db, userId, migrationId);
    if (!row) throw migrationError("MIGRATION_NOT_FOUND", "機種変更情報が見つかりません。", 404);
    if (row.backup_checksum !== backupChecksumValue) throw migrationError("MIGRATION_CHECKSUM_MISMATCH", "バックアップchecksumが一致しません。");
    if (row.status !== "restoring" && row.status !== "restore_verified") throw migrationError("MIGRATION_VERIFY_NOT_ALLOWED", "復元が完了していません。");
    if (!Number.isInteger(archiveRecordCount) || archiveRecordCount < 0) throw migrationError("MIGRATION_VERIFY_INPUT_INVALID", "アーカイブ確認情報が不正です。", 400);
    const manifest = JSON.parse(row.manifest_json) as BackupManifest;
    const tableCounts: Array<[string, string]> = [["cloud.event", "events"], ["cloud.recurrenceRule", "recurrence_rules"], ["cloud.eventOverride", "event_occurrence_overrides"], ["cloud.eventNotification", "event_notifications"], ["cloud.notificationTemplate", "notification_templates"], ["cloud.notificationDelivery", "notification_deliveries"], ["cloud.dailyNote", "daily_notes"], ["cloud.moneyCategory", "money_categories"], ["cloud.moneyItem", "money_items"], ["cloud.moneyOverride", "money_occurrence_overrides"], ["cloud.moneySettlement", "money_occurrence_settlements"]];
    for (const [key, table] of tableCounts) { const result = await this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).bind(userId).first<{ count: number }>(); if (Number(result?.count ?? -1) !== Number(manifest.countsByType[key] ?? 0)) { await this.db.prepare("UPDATE user_migrations SET status = 'error_recoverable', last_error = ? WHERE id = ? AND user_id = ?").bind(`restore count mismatch: ${key}`, migrationId, userId).run(); throw migrationError("MIGRATION_VERIFY_FAILED", "復元件数を確認できませんでした。"); } }
    const offsetCount = await this.db.prepare("SELECT COUNT(*) AS count FROM notification_template_offsets WHERE template_id IN (SELECT id FROM notification_templates WHERE user_id = ?)").bind(userId).first<{ count: number }>();
    if (Number(offsetCount?.count ?? -1) !== Number(manifest.countsByType["cloud.notificationTemplateOffset"] ?? 0)) { await this.db.prepare("UPDATE user_migrations SET status = 'error_recoverable', last_error = ? WHERE id = ? AND user_id = ?").bind("restore count mismatch: cloud.notificationTemplateOffset", migrationId, userId).run(); throw migrationError("MIGRATION_VERIFY_FAILED", "復元件数を確認できませんでした。"); }
    if (!Number.isInteger(archiveRecordCount) || archiveRecordCount !== manifest.archiveRecordCount) {
      await this.db.prepare("UPDATE user_migrations SET status = 'error_recoverable', last_error = ? WHERE id = ? AND user_id = ?").bind("restore count mismatch: archive", migrationId, userId).run();
      throw migrationError("MIGRATION_ARCHIVE_VERIFY_FAILED", "アーカイブ復元件数を確認できませんでした。");
    }
    await this.db.prepare("UPDATE user_migrations SET status = 'restore_verified', restored_at = ?, last_error = NULL WHERE id = ? AND user_id = ?").bind(new Date().toISOString(), migrationId, userId).run();
    return { verified: true, migration: toPublic(await queryMigration(this.db, userId, migrationId)) };
  }

  async complete(userId: string, migrationId: string) {
    const row = await queryMigration(this.db, userId, migrationId);
    if (!row) throw migrationError("MIGRATION_NOT_FOUND", "機種変更情報が見つかりません。", 404);
    if (row.status === "completed") return { completed: true, alreadyCompleted: true, migration: toPublic(row) };
    if (!canCompleteMigration(row.status)) throw migrationError("MIGRATION_COMPLETE_NOT_ALLOWED", "復元確認が終わるまで通常利用へ戻せません。");
    const now = new Date().toISOString();
    await this.db.batch([this.db.prepare("UPDATE user_migrations SET status = 'completed', completed_at = ?, last_error = NULL WHERE id = ? AND user_id = ?").bind(now, migrationId, userId), stateUpdate(this.db, userId, now, null, false)]);
    return { completed: true, alreadyCompleted: false, migration: toPublic(await queryMigration(this.db, userId, migrationId)) };
  }

  async cancel(userId: string, migrationId: string) {
    const row = await queryMigration(this.db, userId, migrationId);
    if (!row) throw migrationError("MIGRATION_NOT_FOUND", "機種変更情報が見つかりません。", 404);
    if (!canCancelMigration(row.status, row.cleanup_completed === 1)) throw migrationError("MIGRATION_RECOVERY_REQUIRED", "データ整理後は、バックアップから復元確認を完了してから解除してください。");
    await this.db.batch([this.db.prepare("UPDATE user_migrations SET status = 'error_recoverable', last_error = ? WHERE id = ? AND user_id = ?").bind("cancelled before cleanup", migrationId, userId), stateUpdate(this.db, userId, new Date().toISOString(), null, false)]);
    return { cancelled: true };
  }
}
