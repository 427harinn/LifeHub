import type { DailyNote, Event, MoneyProjection } from "../api/client";
import {
  deleteActiveSnapshotRecordsForUser,
  evictCalendarSnapshotRecords,
  evictMoneySnapshotRecords,
  readActiveSnapshotMetadataRecord,
  readActiveSnapshotRecord,
  writeActiveSnapshotMetadataRecord,
  writeActiveSnapshotRecord,
  type ActiveSnapshotMetadataRecord,
  type ActiveSnapshotRecord
} from "./active-snapshot-idb";

export const ACTIVE_SNAPSHOT_SCHEMA_VERSION = 1;

export type CalendarSnapshotData = {
  month: string;
  range: { startDate: string; endDate: string };
  events: Event[];
  money: MoneyProjection;
};

export type DailySnapshotData = {
  date: string;
  events: Event[];
  dailyNote: DailyNote | null;
  money: MoneyProjection;
};

export type CalendarSnapshotIdentity = {
  userId: string;
  timezone: string;
  weekStartsOn: number;
  month: string;
};

export type DailySnapshotIdentity = {
  userId: string;
  timezone: string;
  weekStartsOn: number;
  date: string;
};

export type MoneySnapshotIdentity = {
  kind: "money";
  userId: string;
  timezone: string;
  weekStartsOn: number;
  month: string;
};

export type ActiveSnapshotMetadata = Pick<ActiveSnapshotMetadataRecord, "userId" | "timezone" | "weekStartsOn" | "savedAt" | "serverConfirmedAt">;

const memorySnapshots = new Map<string, ActiveSnapshotRecord>();
let cacheEpoch = 0;

export const calendarSnapshotKey = (identity: CalendarSnapshotIdentity) =>
  `calendar-month:${identity.userId}:${identity.timezone}:${identity.weekStartsOn}:${identity.month.slice(0, 7)}`;

export const dailySnapshotKey = (identity: DailySnapshotIdentity) =>
  `daily:${identity.userId}:${identity.timezone}:${identity.weekStartsOn}:${identity.date}`;

export const moneySnapshotKey = (identity: MoneySnapshotIdentity) =>
  `money-month:${identity.userId}:${identity.timezone}:${identity.weekStartsOn}:${identity.month.slice(0, 7)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isString = (value: unknown): value is string => typeof value === "string";
const isDateKey = (value: unknown): value is string => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMonthKey = (value: unknown): value is string => isString(value) && /^\d{4}-\d{2}$/.test(value);

const isMoneyProjection = (value: unknown): value is MoneyProjection => {
  if (!isRecord(value) || !Array.isArray(value.occurrences) || !isRecord(value.summary) || !Array.isArray(value.days)) return false;
  return value.occurrences.every(isRecord) && value.days.every((day) => isRecord(day) && isDateKey(day.date));
};

const isEventList = (value: unknown): value is Event[] => Array.isArray(value) && value.every((event) => isRecord(event) && isString(event.id) && isString(event.userId));

export const isCalendarSnapshotData = (value: unknown): value is CalendarSnapshotData => {
  if (!isRecord(value) || !isMonthKey(value.month) || !isRecord(value.range) || !isDateKey(value.range.startDate) || !isDateKey(value.range.endDate)) return false;
  return isEventList(value.events) && isMoneyProjection(value.money);
};

export const isDailySnapshotData = (value: unknown): value is DailySnapshotData => {
  if (!isRecord(value) || !isDateKey(value.date) || !isEventList(value.events) || !isMoneyProjection(value.money)) return false;
  if (value.dailyNote !== null && (!isRecord(value.dailyNote) || !isString(value.dailyNote.id) || !isDateKey(value.dailyNote.date))) return false;
  return true;
};

export const isMoneySnapshotData = isMoneyProjection;

const isValidRecord = (value: unknown, identity: { key: string; userId: string; timezone: string; weekStartsOn: number }, validate: (data: unknown) => boolean): value is ActiveSnapshotRecord => {
  if (!isRecord(value) || value.schemaVersion !== ACTIVE_SNAPSHOT_SCHEMA_VERSION || value.key !== identity.key || value.userId !== identity.userId || value.timezone !== identity.timezone || value.weekStartsOn !== identity.weekStartsOn || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) || !isString(value.serverConfirmedAt) || !validate(value.data)) return false;
  return true;
};

const identityFor = (identity: CalendarSnapshotIdentity | DailySnapshotIdentity | MoneySnapshotIdentity) => ({
  key: "date" in identity ? dailySnapshotKey(identity) : "kind" in identity && identity.kind === "money" ? moneySnapshotKey(identity) : calendarSnapshotKey(identity),
  userId: identity.userId,
  timezone: identity.timezone,
  weekStartsOn: identity.weekStartsOn
});

export const getActiveSnapshotEpoch = () => cacheEpoch;

export const invalidateActiveSnapshotEpoch = () => {
  cacheEpoch += 1;
  return cacheEpoch;
};

const isValidSnapshotMetadata = (value: unknown, userId: string): value is ActiveSnapshotMetadataRecord => {
  if (!isRecord(value) || value.schemaVersion !== ACTIVE_SNAPSHOT_SCHEMA_VERSION || value.key !== `active-snapshot-metadata:${userId}` || value.userId !== userId || !isString(value.timezone) || (value.weekStartsOn !== 0 && value.weekStartsOn !== 1) || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) || !isString(value.serverConfirmedAt)) return false;
  return true;
};

export const readActiveSnapshotMetadata = async (userId: string): Promise<ActiveSnapshotMetadata | null> => {
  try {
    const record = await readActiveSnapshotMetadataRecord(userId);
    return record && isValidSnapshotMetadata(record, userId) ? record : null;
  } catch {
    return null;
  }
};

export const writeActiveSnapshotMetadata = async (userId: string, timezone: string, weekStartsOn: number, expectedEpoch = cacheEpoch): Promise<boolean> => {
  if (expectedEpoch !== cacheEpoch || !isString(timezone) || (weekStartsOn !== 0 && weekStartsOn !== 1)) return false;
  const record: ActiveSnapshotMetadataRecord = {
    schemaVersion: ACTIVE_SNAPSHOT_SCHEMA_VERSION,
    key: `active-snapshot-metadata:${userId}`,
    userId,
    timezone,
    weekStartsOn,
    savedAt: Date.now(),
    serverConfirmedAt: new Date().toISOString()
  };
  try {
    if (expectedEpoch === cacheEpoch) await writeActiveSnapshotMetadataRecord(record);
  } catch {
    // Metadata persistence is optional; network settings remain authoritative.
  }
  return true;
};

export const readMemoryActiveSnapshot = <T>(identity: CalendarSnapshotIdentity | DailySnapshotIdentity | MoneySnapshotIdentity, validate: (data: unknown) => data is T): T | null => {
  const expected = identityFor(identity);
  const record = memorySnapshots.get(expected.key);
  return record && isValidRecord(record, expected, validate) ? record.data as T : null;
};

export const readPersistentActiveSnapshot = async <T>(identity: CalendarSnapshotIdentity | DailySnapshotIdentity | MoneySnapshotIdentity, validate: (data: unknown) => data is T): Promise<T | null> => {
  const expected = identityFor(identity);
  try {
    const record = await readActiveSnapshotRecord(expected.key);
    return record && isValidRecord(record, expected, validate) ? record.data as T : null;
  } catch {
    return null;
  }
};

export const getActiveSnapshotSavedAt = async (identity: CalendarSnapshotIdentity | DailySnapshotIdentity | MoneySnapshotIdentity): Promise<number | null> => {
  const expected = identityFor(identity);
  const memory = memorySnapshots.get(expected.key);
  if (memory && isValidRecord(memory, expected, () => true)) return memory.savedAt;
  try {
    const record = await readActiveSnapshotRecord(expected.key);
    return record && isValidRecord(record, expected, () => true) ? record.savedAt : null;
  } catch {
    return null;
  }
};

type SnapshotWriteOptions = {
  evictCalendarSnapshots?: { preserveMonths: string[]; maxRecords?: number };
  evictMoneySnapshots?: { preserveMonths: string[]; maxRecords?: number };
};

const evictMemoryMonthSnapshots = (identity: { userId: string; timezone: string; weekStartsOn: number }, snapshotKind: "calendar" | "money", preserveMonths: string[], maxRecords: number) => {
  const prefix = `${snapshotKind === "calendar" ? "calendar-month" : "money-month"}:${identity.userId}:${identity.timezone}:${identity.weekStartsOn}:`;
  const scoped = [...memorySnapshots.entries()]
    .filter(([key, record]) => key.startsWith(prefix) && record.userId === identity.userId && record.timezone === identity.timezone && record.weekStartsOn === identity.weekStartsOn)
    .sort(([, left], [, right]) => (right.lastAccessedAt ?? right.savedAt) - (left.lastAccessedAt ?? left.savedAt));
  const protectedKeys = new Set(preserveMonths.map((month) => `${prefix}${month.slice(0, 7)}`));
  const keep = new Set(scoped.filter(([key]) => protectedKeys.has(key)).map(([key]) => key));
  for (const [key] of scoped) {
    if (keep.size >= maxRecords || keep.has(key)) continue;
    keep.add(key);
  }
  scoped.forEach(([key]) => { if (!keep.has(key)) memorySnapshots.delete(key); });
};

export const writeServerConfirmedActiveSnapshot = async <T>(identity: CalendarSnapshotIdentity | DailySnapshotIdentity | MoneySnapshotIdentity, data: T, validate: (value: unknown) => value is T, expectedEpoch = cacheEpoch, options?: SnapshotWriteOptions): Promise<boolean> => {
  const expected = identityFor(identity);
  if (expectedEpoch !== cacheEpoch || !validate(data)) return false;
  const record: ActiveSnapshotRecord = {
    schemaVersion: ACTIVE_SNAPSHOT_SCHEMA_VERSION,
    key: expected.key,
    userId: expected.userId,
    timezone: expected.timezone,
    weekStartsOn: expected.weekStartsOn,
    savedAt: Date.now(),
    lastAccessedAt: Date.now(),
    serverConfirmedAt: new Date().toISOString(),
    data
  };
  const previous = memorySnapshots.get(record.key);
  if (previous && previous.savedAt > record.savedAt) return false;
  memorySnapshots.set(record.key, record);
  const snapshotKind = "date" in identity ? undefined : "kind" in identity && identity.kind === "money" ? "money" : "calendar";
  const monthEviction = snapshotKind === "money" ? options?.evictMoneySnapshots : options?.evictCalendarSnapshots;
  const maxRecords = monthEviction?.maxRecords ?? 5;
  if (expectedEpoch === cacheEpoch && snapshotKind && monthEviction) evictMemoryMonthSnapshots(identity, snapshotKind, monthEviction.preserveMonths, maxRecords);
  try {
    if (expectedEpoch === cacheEpoch) await writeActiveSnapshotRecord(record);
    if (expectedEpoch === cacheEpoch && snapshotKind && monthEviction) {
      const deletedKeys = await (snapshotKind === "money" ? evictMoneySnapshotRecords(identity, monthEviction.preserveMonths, maxRecords) : evictCalendarSnapshotRecords(identity, monthEviction.preserveMonths, maxRecords));
      if (expectedEpoch === cacheEpoch) deletedKeys.forEach((key) => memorySnapshots.delete(key));
    }
  } catch {
    // IndexedDB is an optional acceleration layer.
  }
  return expectedEpoch === cacheEpoch;
};

export const clearActiveSnapshotsForUser = async (userId: string): Promise<void> => {
  cacheEpoch += 1;
  for (const [key, record] of memorySnapshots) if (record.userId === userId) memorySnapshots.delete(key);
  try {
    await deleteActiveSnapshotRecordsForUser(userId);
  } catch {
    // Logout must not be blocked by an unavailable IndexedDB implementation.
  }
};

export const clearMemoryActiveSnapshots = () => {
  cacheEpoch += 1;
  memorySnapshots.clear();
};
