import type { DailyNote, Event, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, RecurrenceRule } from "../worker/types";

export const ARCHIVE_DB_NAME = "lifehub-archive";
export const ARCHIVE_SCHEMA_VERSION = 1;
export const ARCHIVE_MANIFEST_VERSION = 1;

export type ArchiveRecordType = "event" | "recurrence_rule" | "event_override" | "event_notification" | "daily_note" | "money_item" | "money_override" | "money_settlement" | "money_category";
export type ArchiveRecord = { type: ArchiveRecordType; id: string; userId: string; record: unknown; recordDate?: string; updatedAt?: string };
export type ArchiveRecords = {
  events: Event[];
  recurrenceRules: RecurrenceRule[];
  eventOverrides: EventOccurrenceOverride[];
  eventNotifications: Array<{ id: string; userId: string; eventId: string; offsetMinutes: number; sortOrder: number; createdAt: string }>;
  dailyNotes: DailyNote[];
  moneyItems: MoneyItem[];
  moneyOverrides: MoneyOccurrenceOverride[];
  moneySettlements: MoneyOccurrenceSettlement[];
  moneyCategories: MoneyCategory[];
};
export type ArchiveManifestEntry = { type: ArchiveRecordType; id: string };
export type ArchiveManifest = { version: number; records: ArchiveManifestEntry[] };
export type ArchiveBundle = {
  schemaVersion: number;
  generatedAt: string;
  userId: string;
  retentionBoundary: string;
  archiveBatchId: string;
  records: ArchiveRecords;
  manifest: ArchiveManifest;
  checksum: string;
};
export type ArchiveMetadata = {
  archiveBatchId: string;
  userId: string;
  schemaVersion: number;
  archivedAt: string;
  retentionBoundary: string;
  minDate: string | null;
  maxDate: string | null;
  recordCount: number;
  recordCountsByType: Record<ArchiveRecordType, number>;
  checksum: string;
  status: "verified" | "confirm_pending" | "confirmed" | "error";
  confirmedAt?: string;
};
export type ArchiveCandidateResponse = ArchiveBundle & { metadata: Omit<ArchiveMetadata, "status" | "confirmedAt">; manifestVersion: number };

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    const next = value[key];
    if (next !== undefined) result[key] = canonicalValue(next);
    return result;
  }, {});
  return value;
};

/** Stable JSON used by both the Worker and the browser before SHA-256. */
export const canonicalSerialize = (value: unknown) => JSON.stringify(canonicalValue(value));
export const archiveChecksumInput = (bundle: Omit<ArchiveBundle, "checksum">) => {
  const { checksum: _checksum, metadata: _metadata, manifestVersion: _manifestVersion, ...payload } = bundle as ArchiveBundle & { metadata?: unknown; manifestVersion?: unknown };
  void _checksum;
  void _metadata;
  void _manifestVersion;
  return { ...payload, checksum: undefined };
};
export const archiveRecordCount = (records: ArchiveRecords) => Object.values(records).reduce((total, values) => total + values.length, 0);
export const emptyArchiveRecords = (): ArchiveRecords => ({ events: [], recurrenceRules: [], eventOverrides: [], eventNotifications: [], dailyNotes: [], moneyItems: [], moneyOverrides: [], moneySettlements: [], moneyCategories: [] });

export const sha256Hex = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const archiveChecksum = async (bundle: Omit<ArchiveBundle, "checksum">) => sha256Hex(canonicalSerialize(archiveChecksumInput(bundle)));

export const archiveRecordsToRows = (records: ArchiveRecords, userId: string): ArchiveRecord[] => {
  const rows: ArchiveRecord[] = [];
  const push = (type: ArchiveRecordType, id: string, record: unknown, recordDate?: string, updatedAt?: string) => rows.push({ type, id, userId, record, recordDate, updatedAt });
  records.events.forEach((record) => push("event", record.id, record, record.startDate ?? record.periodStartDate ?? undefined, record.updatedAt));
  records.recurrenceRules.forEach((record) => push("recurrence_rule", record.id, record, record.startsOn, record.updatedAt));
  records.eventOverrides.forEach((record) => push("event_override", record.id, record, record.occurrenceKey.slice(-16, -6), record.updatedAt));
  records.eventNotifications.forEach((record) => push("event_notification", record.id, record, undefined, record.createdAt));
  records.dailyNotes.forEach((record) => push("daily_note", record.id, record, record.date, record.updatedAt));
  records.moneyItems.forEach((record) => push("money_item", record.id, record, record.date, record.updatedAt));
  records.moneyOverrides.forEach((record) => push("money_override", record.id, record, record.occurrenceKey.split(":").at(-1), record.updatedAt));
  records.moneySettlements.forEach((record) => push("money_settlement", record.id, record, record.occurrenceKey.split(":").at(-1), record.updatedAt));
  records.moneyCategories.forEach((record) => push("money_category", record.id, record, undefined, record.updatedAt));
  return rows;
};
