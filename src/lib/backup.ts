import type { ArchiveMetadata, ArchiveRecord } from "./archive";
import type { DailyNote, Event, EventNotification, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, NotificationDelivery, NotificationTemplate, RecurrenceRule, UserSettings } from "../worker/types";

export const BACKUP_FORMAT = "lifehub-backup" as const;
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export const APP_VERSION = "0.1.0";

export type BackupCloudPayload = {
  settings: UserSettings;
  events: Event[];
  recurrenceRules: RecurrenceRule[];
  eventOverrides: EventOccurrenceOverride[];
  eventNotifications: EventNotification[];
  notificationTemplates: NotificationTemplate[];
  notificationDeliveries: NotificationDelivery[];
  dailyNotes: DailyNote[];
  moneyCategories: MoneyCategory[];
  moneyItems: MoneyItem[];
  moneyOverrides: MoneyOccurrenceOverride[];
  moneySettlements: MoneyOccurrenceSettlement[];
};

export type BackupArchivePayload = {
  schemaVersion: number;
  batches: ArchiveMetadata[];
  records: ArchiveRecord[];
};

export type BackupManifest = {
  recordCount: number;
  cloudRecordCount: number;
  archiveRecordCount: number;
  countsByType: Record<string, number>;
  minDate: string | null;
  maxDate: string | null;
  payloadChecksum: string;
};

export type LifeHubBackup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  user: { id: string };
  cloud: BackupCloudPayload;
  archive: BackupArchivePayload;
  manifest: BackupManifest;
  checksum: string;
};

export type BackupExportResponse = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  user: { id: string };
  cloud: BackupCloudPayload;
  cloudChecksum: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
    return result;
  }, {});
  return value;
};

export const canonicalBackupSerialize = (value: unknown) => JSON.stringify(canonicalValue(value));

export const backupSha256Hex = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sortCollections = (cloud: BackupCloudPayload): BackupCloudPayload => {
  const sortById = <T extends { id: string }>(items: T[]) => [...items].sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...cloud,
    events: sortById(cloud.events),
    recurrenceRules: sortById(cloud.recurrenceRules),
    eventOverrides: sortById(cloud.eventOverrides),
    eventNotifications: sortById(cloud.eventNotifications),
    notificationTemplates: sortById(cloud.notificationTemplates).map((template) => ({ ...template, offsets: sortById(template.offsets) })),
    notificationDeliveries: sortById(cloud.notificationDeliveries),
    dailyNotes: sortById(cloud.dailyNotes),
    moneyCategories: sortById(cloud.moneyCategories),
    moneyItems: sortById(cloud.moneyItems),
    moneyOverrides: sortById(cloud.moneyOverrides),
    moneySettlements: sortById(cloud.moneySettlements)
  };
};

export const normalizeBackup = (backup: LifeHubBackup): LifeHubBackup => ({ ...backup, cloud: sortCollections(backup.cloud), archive: { ...backup.archive, batches: [...backup.archive.batches].sort((left, right) => left.archiveBatchId.localeCompare(right.archiveBatchId)), records: [...backup.archive.records].sort((left, right) => `${left.archiveBatchId ?? ""}:${left.type}:${left.id}`.localeCompare(`${right.archiveBatchId ?? ""}:${right.type}:${right.id}`)) } });

const cloudArrays = (cloud: BackupCloudPayload) => [
  ["event", cloud.events], ["recurrenceRule", cloud.recurrenceRules], ["eventOverride", cloud.eventOverrides], ["eventNotification", cloud.eventNotifications],
  ["notificationTemplate", cloud.notificationTemplates], ["notificationDelivery", cloud.notificationDeliveries], ["dailyNote", cloud.dailyNotes], ["moneyCategory", cloud.moneyCategories],
  ["moneyItem", cloud.moneyItems], ["moneyOverride", cloud.moneyOverrides], ["moneySettlement", cloud.moneySettlements]
] as Array<[string, Array<{ id: string }>]>;

const dateValues = (backup: LifeHubBackup) => [
  ...backup.cloud.events.flatMap((item) => [item.startDate, item.endDate, item.periodStartDate, item.periodEndDate]),
  ...backup.cloud.dailyNotes.map((item) => item.date), ...backup.cloud.moneyItems.map((item) => item.date),
  ...backup.archive.records.map((item) => item.recordDate)
].filter((value): value is string => Boolean(value)).sort();

export const backupPayloadWithoutChecksum = (backup: Omit<LifeHubBackup, "checksum"> | LifeHubBackup) => {
  const { checksum: _checksum, ...payload } = backup as LifeHubBackup;
  void _checksum;
  return payload;
};

export const backupPayloadChecksum = async (backup: LifeHubBackup) => backupSha256Hex(canonicalBackupSerialize({ cloud: backup.cloud, archive: backup.archive }));
export const backupChecksum = async (backup: Omit<LifeHubBackup, "checksum"> | LifeHubBackup) => backupSha256Hex(canonicalBackupSerialize(backupPayloadWithoutChecksum(backup)));

export const createBackupManifest = async (userId: string, cloud: BackupCloudPayload, archive: BackupArchivePayload): Promise<BackupManifest> => {
  const normalizedCloud = sortCollections(cloud);
  const normalizedArchive = { ...archive, batches: [...archive.batches].sort((left, right) => left.archiveBatchId.localeCompare(right.archiveBatchId)), records: [...archive.records].sort((left, right) => `${left.archiveBatchId ?? ""}:${left.type}:${left.id}`.localeCompare(`${right.archiveBatchId ?? ""}:${right.type}:${right.id}`)) };
  const countsByType: Record<string, number> = {};
  cloudArrays(normalizedCloud).forEach(([type, values]) => { countsByType[`cloud.${type}`] = values.length; });
  countsByType["cloud.notificationTemplateOffset"] = normalizedCloud.notificationTemplates.reduce((sum, template) => sum + template.offsets.length, 0);
  normalizedArchive.records.forEach((record) => { countsByType[`archive.${record.type}`] = (countsByType[`archive.${record.type}`] ?? 0) + 1; });
  const dates = [...dateValues({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: "", appVersion: APP_VERSION, user: { id: userId }, cloud: normalizedCloud, archive: normalizedArchive, manifest: {} as BackupManifest, checksum: "" })];
  const payload = { cloud: normalizedCloud, archive: normalizedArchive };
  return { recordCount: Object.values(countsByType).reduce((sum, count) => sum + count, 0), cloudRecordCount: cloudArrays(normalizedCloud).reduce((sum, [, values]) => sum + values.length, 0) + countsByType["cloud.notificationTemplateOffset"], archiveRecordCount: normalizedArchive.records.length, countsByType, minDate: dates[0] ?? null, maxDate: dates.at(-1) ?? null, payloadChecksum: await backupSha256Hex(canonicalBackupSerialize(payload)) };
};

const forbiddenKey = /^(password|passwordHash|password_hash|token|tokenHash|token_hash|cookie|sessionToken|session_token|vapidPrivateKey|vapid_private_key|workerSecret|worker_secret|cloudflareSecret|cloudflare_secret|oauthToken|oauth_token|apiToken|api_token|pbkdf2|credentialMaterial|credential_material|pushSubscriptions)$/i;
const containsForbiddenKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => forbiddenKey.test(key) || containsForbiddenKey(child));
};
const duplicateIds = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size !== items.length;

export type BackupValidationResult = { backup: LifeHubBackup; byteLength: number; manifest: BackupManifest };

export const validateBackup = async (input: unknown, options: { currentUserId?: string; byteLength?: number } = {}): Promise<BackupValidationResult> => {
  if (!isObject(input)) throw new Error("バックアップJSONの形式が不正です。");
  const backup = input as unknown as LifeHubBackup;
  if (options.byteLength !== undefined && options.byteLength > BACKUP_MAX_BYTES) throw new Error("バックアップファイルが大きすぎます。");
  if (backup.format === undefined || backup.schemaVersion === undefined || backup.exportedAt === undefined || backup.appVersion === undefined || backup.user === undefined || backup.cloud === undefined || backup.archive === undefined || backup.manifest === undefined || backup.checksum === undefined) throw new Error("バックアップに必要な項目がありません。");
  if (backup.format !== BACKUP_FORMAT || backup.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error("対応していないバックアップ形式です。");
  if (typeof backup.exportedAt !== "string" || typeof backup.appVersion !== "string" || !isObject(backup.user) || typeof backup.user.id !== "string" || !isObject(backup.cloud) || !isObject(backup.archive) || !isObject(backup.manifest) || typeof backup.checksum !== "string") throw new Error("バックアップに必要な項目がありません。");
  if (options.currentUserId && backup.user.id !== options.currentUserId) throw new Error("別のアカウントのバックアップです。");
  if (containsForbiddenKey(input)) throw new Error("バックアップに保存できない情報が含まれています。");
  const cloud = backup.cloud;
  const arrays = cloudArrays(cloud);
  if (arrays.some(([, values]) => !Array.isArray(values) || values.some((item) => !isObject(item) || typeof item.id !== "string" || item.id.length === 0 || item.id.length > 200 || (item as { userId?: unknown }).userId !== backup.user.id) || duplicateIds(values))) throw new Error("バックアップのIDまたは所有者が不正です。");
  if (!isObject(cloud.settings) || cloud.settings.userId !== backup.user.id || !Array.isArray(cloud.notificationTemplates) || cloud.notificationTemplates.some((template) => !Array.isArray(template.offsets) || template.offsets.some((offset) => !isObject(offset) || typeof offset.id !== "string" || typeof offset.templateId !== "string"))) throw new Error("設定または通知テンプレートが不正です。");
  const rules = new Set(cloud.recurrenceRules.map((item) => item.id));
  const events = new Set(cloud.events.map((item) => item.id));
  const moneyItems = new Set(cloud.moneyItems.map((item) => item.id));
  const categories = new Set(cloud.moneyCategories.map((item) => item.id));
  const eventNotifications = new Set(cloud.eventNotifications.map((item) => item.id));
  const offsetIds = cloud.notificationTemplates.flatMap((template) => template.offsets.map((offset) => offset.id));
  const allIds = [...cloud.events, ...cloud.recurrenceRules, ...cloud.eventOverrides, ...cloud.eventNotifications, ...cloud.notificationTemplates, ...cloud.notificationDeliveries, ...cloud.dailyNotes, ...cloud.moneyCategories, ...cloud.moneyItems, ...cloud.moneyOverrides, ...cloud.moneySettlements].map((item) => item.id);
  if (new Set(allIds).size !== allIds.length || new Set(offsetIds).size !== offsetIds.length || new Set([...allIds, ...offsetIds]).size !== allIds.length + offsetIds.length) throw new Error("バックアップ内のIDが重複しています。");
  if (cloud.events.some((item) => item.recurrenceRuleId && !rules.has(item.recurrenceRuleId)) || cloud.moneyItems.some((item) => item.recurrenceRuleId && !rules.has(item.recurrenceRuleId))) throw new Error("繰り返し定義の参照が不正です。");
  if (cloud.eventOverrides.some((item) => !events.has(item.eventId)) || cloud.eventNotifications.some((item) => !events.has(item.eventId)) || cloud.notificationTemplates.some((template) => template.offsets.some((offset) => offset.templateId !== template.id))) throw new Error("予定または通知の参照が不正です。");
  if (cloud.moneyItems.some((item) => !categories.has(item.categoryId)) || cloud.moneyOverrides.some((item) => !moneyItems.has(item.moneyItemId)) || cloud.moneySettlements.some((item) => !moneyItems.has(item.moneyItemId))) throw new Error("お金の参照が不正です。");
  if (cloud.notificationDeliveries.some((item) => (item.eventId && !events.has(item.eventId)) || (item.eventNotificationId && !eventNotifications.has(item.eventNotificationId)))) throw new Error("通知履歴の参照が不正です。");
  if (!Number.isInteger(backup.archive.schemaVersion) || backup.archive.schemaVersion < 1 || !Array.isArray(backup.archive.batches) || !Array.isArray(backup.archive.records)) throw new Error("アーカイブ情報が不正です。");
  if (backup.archive.records.some((record) => record.userId !== backup.user.id || !record.archiveBatchId) || backup.archive.batches.some((batch) => batch.userId !== backup.user.id) || new Set(backup.archive.records.map((record) => `${record.archiveBatchId}:${record.type}:${record.id}`)).size !== backup.archive.records.length || new Set(backup.archive.batches.map((batch) => batch.archiveBatchId)).size !== backup.archive.batches.length || backup.archive.records.some((record) => !backup.archive.batches.some((batch) => batch.archiveBatchId === record.archiveBatchId))) throw new Error("アーカイブのIDまたは所有者が不正です。");
  for (const batch of backup.archive.batches) {
    const records = backup.archive.records.filter((record) => record.archiveBatchId === batch.archiveBatchId);
    if (batch.recordCount !== records.length) throw new Error("アーカイブmetadataの件数が一致しません。");
  }
  const normalized = normalizeBackup(backup);
  const calculatedManifest = await createBackupManifest(backup.user.id, normalized.cloud, normalized.archive);
  if (canonicalBackupSerialize(calculatedManifest) !== canonicalBackupSerialize(backup.manifest)) throw new Error("manifestの件数またはchecksumが一致しません。");
  if (await backupPayloadChecksum(normalized) !== backup.manifest.payloadChecksum || await backupChecksum(normalized) !== backup.checksum) throw new Error("checksumが一致しません。");
  return { backup: normalized, byteLength: options.byteLength ?? new TextEncoder().encode(JSON.stringify(input)).byteLength, manifest: calculatedManifest };
};

export const serializeBackup = (backup: LifeHubBackup) => JSON.stringify(backup, null, 2);
