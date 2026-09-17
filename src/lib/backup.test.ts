import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, backupChecksum, createBackupManifest, normalizeBackup, validateBackup, type BackupCloudPayload, type LifeHubBackup } from "./backup";

const userId = "user-1";
const settings = { userId, timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", lastUsedNotificationHome: { mode: "none" as const, templateId: null, offsets: [] }, lastUsedNotificationWork: { mode: "none" as const, templateId: null, offsets: [] }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const cloud = (): BackupCloudPayload => ({ settings, events: [], recurrenceRules: [], eventOverrides: [], eventNotifications: [], notificationTemplates: [], notificationDeliveries: [], dailyNotes: [], moneyCategories: [], moneyItems: [], moneyOverrides: [], moneySettlements: [] });

const makeBackup = async (changes: Partial<BackupCloudPayload> = {}) => {
  const base = normalizeBackup({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: "2026-09-14T00:00:00.000Z", appVersion: "0.1.0", user: { id: userId }, cloud: { ...cloud(), ...changes }, archive: { schemaVersion: 1, batches: [], records: [] }, manifest: {} as LifeHubBackup["manifest"], checksum: "" });
  const manifest = await createBackupManifest(userId, base.cloud, base.archive);
  const unsigned = { ...base, manifest, checksum: "" };
  return { ...unsigned, checksum: await backupChecksum(unsigned) } satisfies LifeHubBackup;
};

describe("M13 backup validation", () => {
  it("validates a complete cloud + archive payload and manifest", async () => {
    const backup = await makeBackup();
    await expect(validateBackup(backup, { currentUserId: userId })).resolves.toMatchObject({ manifest: backup.manifest });
  });

  it("rejects missing fields, unknown schema, and a wrong checksum", async () => {
    const backup = await makeBackup();
    await expect(validateBackup({ ...backup, format: undefined })).rejects.toThrow("必要な項目");
    await expect(validateBackup({ ...backup, schemaVersion: 2 })).rejects.toThrow("対応していない");
    await expect(validateBackup({ ...backup, checksum: "0".repeat(64) })).rejects.toThrow("checksum");
  });

  it("rejects duplicate IDs and broken recurrence / Money relations", async () => {
    const event = { id: "event-1", userId, category: "home" as const, title: "予定", place: null, memo: null, timingType: "scheduled" as const, allDay: true, startDate: "2026-09-01", startTime: null, endDate: "2026-09-01", endTime: null, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: null, active: true, deletedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    await expect(validateBackup(await makeBackup({ events: [event, event] }))).rejects.toThrow("ID");
    await expect(validateBackup(await makeBackup({ events: [{ ...event, recurrenceRuleId: "missing-rule" }] }))).rejects.toThrow("繰り返し");
    const category = { id: "category-1", userId, type: "expense" as const, name: "食費", colorKey: null, sortOrder: 0, active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    const money = { id: "money-1", userId, type: "expense" as const, title: "昼食", categoryId: "missing-category", plannedAmount: 1000, date: "2026-09-01", time: null, recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    await expect(validateBackup(await makeBackup({ moneyCategories: [category], moneyItems: [money] }))).rejects.toThrow("お金");
  });

  it("rejects cross-user, secret, and device-specific push data", async () => {
    const backup = await makeBackup();
    await expect(validateBackup(backup, { currentUserId: "user-2" })).rejects.toThrow("別のアカウント");
    await expect(validateBackup({ ...backup, user: { id: userId }, cloud: { ...backup.cloud, settings: { ...backup.cloud.settings, password_hash: "secret" } } })).rejects.toThrow("保存できない");
    await expect(validateBackup({ ...backup, cloud: { ...backup.cloud, pushSubscriptions: [] } })).rejects.toThrow("保存できない");
  });
});
