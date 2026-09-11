import { archiveChecksum, archiveRecordCount, ARCHIVE_MANIFEST_VERSION, ARCHIVE_SCHEMA_VERSION, type ArchiveBundle, type ArchiveCandidateResponse, type ArchiveManifest, type ArchiveManifestEntry, type ArchiveRecords } from "../../lib/archive";
import { getLocalDate } from "../lib/date-time";
import { AppError } from "../lib/errors";
import type { DailyNote, Event, EventOccurrenceOverride, MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, RecurrenceRule } from "../types";

type NotificationSnapshot = { id: string; userId: string; eventId: string; offsetMinutes: number; sortOrder: number; createdAt: string };
type Candidate = { bundle: ArchiveBundle; deleteManifest: ArchiveManifest };

const eventFields = "id, user_id, category, title, place, memo, timing_type, all_day, start_date, start_time, end_date, end_time, period_window_type, period_anchor_date, period_start_date, period_end_date, deadline_time, recurrence_rule_id, active, deleted_at, created_at, updated_at";
const ruleFields = "id, user_id, frequency, interval, weekdays, day_of_month, starts_on, ends_on, created_at, updated_at";
const moneyFields = "id, user_id, type, title, category_id, planned_amount, date, time, recurrence_rule_id, memo, active, deleted_at, created_at, updated_at";
const eventRow = (row: Record<string, unknown>): Event => ({ id: String(row.id), userId: String(row.user_id), category: row.category as Event["category"], title: String(row.title), place: row.place as string | null, memo: row.memo as string | null, timingType: row.timing_type as Event["timingType"], allDay: row.all_day === null ? null : Number(row.all_day) === 1, startDate: row.start_date as string | null, startTime: row.start_time as string | null, endDate: row.end_date as string | null, endTime: row.end_time as string | null, periodWindowType: row.period_window_type as Event["periodWindowType"], periodAnchorDate: row.period_anchor_date as string | null, periodStartDate: row.period_start_date as string | null, periodEndDate: row.period_end_date as string | null, deadlineTime: row.deadline_time as string | null, recurrenceRuleId: row.recurrence_rule_id as string | null, active: Number(row.active) === 1, deletedAt: row.deleted_at as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const ruleRow = (row: Record<string, unknown>): RecurrenceRule => ({ id: String(row.id), userId: String(row.user_id), frequency: row.frequency as RecurrenceRule["frequency"], interval: Number(row.interval), weekdays: typeof row.weekdays === "string" ? JSON.parse(row.weekdays) as number[] : null, dayOfMonth: row.day_of_month === null ? null : Number(row.day_of_month), startsOn: String(row.starts_on), endsOn: row.ends_on as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const dailyRow = (row: Record<string, unknown>): DailyNote => ({ id: String(row.id), userId: String(row.user_id), date: String(row.date), content: String(row.content), createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const moneyRow = (row: Record<string, unknown>): MoneyItem => ({ id: String(row.id), userId: String(row.user_id), type: row.type as MoneyItem["type"], title: String(row.title), categoryId: String(row.category_id), plannedAmount: Number(row.planned_amount), date: String(row.date), time: row.time as null, recurrenceRuleId: row.recurrence_rule_id as string | null, memo: row.memo as string | null, active: Number(row.active) === 1, deletedAt: row.deleted_at as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const categoryRow = (row: Record<string, unknown>): MoneyCategory => ({ id: String(row.id), userId: String(row.user_id), type: row.type as MoneyCategory["type"], name: String(row.name), colorKey: row.color_key as string | null, sortOrder: Number(row.sort_order), active: Number(row.active) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const eventOverrideRow = (row: Record<string, unknown>): EventOccurrenceOverride => ({ id: String(row.id), userId: String(row.user_id), eventId: String(row.event_id), occurrenceKey: String(row.occurrence_key), overrideType: row.override_type as EventOccurrenceOverride["overrideType"], patch: typeof row.patch_json === "string" ? JSON.parse(row.patch_json) as EventOccurrenceOverride["patch"] : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const moneyOverrideRow = (row: Record<string, unknown>): MoneyOccurrenceOverride => ({ id: String(row.id), userId: String(row.user_id), moneyItemId: String(row.money_item_id), occurrenceKey: String(row.occurrence_key), overrideType: row.override_type as MoneyOccurrenceOverride["overrideType"], patch: typeof row.patch_json === "string" ? JSON.parse(row.patch_json) as MoneyOccurrenceOverride["patch"] : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
const settlementRow = (row: Record<string, unknown>): MoneyOccurrenceSettlement => ({ id: String(row.id), userId: String(row.user_id), moneyItemId: String(row.money_item_id), occurrenceKey: String(row.occurrence_key), status: row.status as MoneyOccurrenceSettlement["status"], amount: Number(row.amount), finalizedAt: String(row.finalized_at), updatedAt: String(row.updated_at), estimatedAmount: row.estimated_amount === null ? null : Number(row.estimated_amount) });
const notificationRow = (row: Record<string, unknown>): NotificationSnapshot => ({ id: String(row.id), userId: String(row.user_id), eventId: String(row.event_id), offsetMinutes: Number(row.offset_minutes), sortOrder: Number(row.sort_order), createdAt: String(row.created_at) });

const dateFromOccurrenceKey = (value: string) => value.match(/(?:event:[^:]+:|money:[^:]+:)(\d{4}-\d{2}-\d{2})/)?.[1]
  ?? value.match(/event:[^:]+:(?:week|range):(\d{4}-\d{2}-\d{2})/)?.[1]
  ?? value.match(/event:[^:]+:month:(\d{4}-\d{2})/)?.[1].concat("-01")
  ?? value.match(/money:[^:]+:(\d{4}-\d{2})/)?.[1].concat("-01")
  ?? null;
const shiftCalendarMonths = (value: string, amount: number) => { const [year, month, day] = value.split("-").map(Number); const target = new Date(Date.UTC(year, month - 1 + amount, 1)); const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(); return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`; };
export const retentionBoundaryFor = (now: Date, timezone: string) => shiftCalendarMonths(getLocalDate(now, timezone), -12);
const occurrenceIsBefore = (key: string, boundary: string) => { const date = dateFromOccurrenceKey(key); return Boolean(date && date < boundary); };
const patchDateIsBefore = (patch: Record<string, unknown> | null, boundary: string) => !patch || ![patch.startDate, patch.endDate, patch.periodStartDate, patch.periodEndDate, patch.date].some((value) => typeof value === "string" && value >= boundary);
const eventArchiveDate = (event: Event, rule: RecurrenceRule | null) => rule ? rule.endsOn : event.timingType === "period" ? event.periodEndDate : event.endDate;
const sortById = <T extends { id: string }>(values: T[]) => [...values].sort((left, right) => left.id.localeCompare(right.id));

const manifestFrom = (records: ArchiveRecords, deleteIds: Partial<Record<keyof ArchiveRecords, Set<string>>>): ArchiveManifest => {
  const entries: ArchiveManifestEntry[] = [];
  const add = (field: keyof ArchiveRecords, type: ArchiveManifestEntry["type"], id: string) => { if (deleteIds[field]?.has(id)) entries.push({ type, id }); };
  records.events.forEach((record) => add("events", "event", record.id));
  records.recurrenceRules.forEach((record) => add("recurrenceRules", "recurrence_rule", record.id));
  records.eventOverrides.forEach((record) => add("eventOverrides", "event_override", record.id));
  records.eventNotifications.forEach((record) => add("eventNotifications", "event_notification", record.id));
  records.dailyNotes.forEach((record) => add("dailyNotes", "daily_note", record.id));
  records.moneyItems.forEach((record) => add("moneyItems", "money_item", record.id));
  records.moneyOverrides.forEach((record) => add("moneyOverrides", "money_override", record.id));
  records.moneySettlements.forEach((record) => add("moneySettlements", "money_settlement", record.id));
  return { version: ARCHIVE_MANIFEST_VERSION, records: entries.sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`)) };
};

export class ArchiveService {
  constructor(private readonly db: D1Database) {}

  async buildCandidate(userId: string, timezone: string, now: Date, archiveBatchId: string = crypto.randomUUID(), generatedAt = now.toISOString()): Promise<Candidate> {
    const retentionBoundary = retentionBoundaryFor(now, timezone);
    const [eventRows, ruleRows, eventOverrideRows, notificationRows, dailyRows, moneyRows, moneyOverrideRows, settlementRows, categoryRows] = await Promise.all([
      this.db.prepare(`SELECT ${eventFields} FROM events WHERE user_id = ?`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare(`SELECT ${ruleFields} FROM recurrence_rules WHERE user_id = ?`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, event_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM event_occurrence_overrides WHERE user_id = ?").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, event_id, offset_minutes, sort_order, created_at FROM event_notifications WHERE user_id = ?").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, date, content, created_at, updated_at FROM daily_notes WHERE user_id = ? AND date < ?").bind(userId, retentionBoundary).all<Record<string, unknown>>(),
      this.db.prepare(`SELECT ${moneyFields} FROM money_items WHERE user_id = ?`).bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, money_item_id, occurrence_key, override_type, patch_json, created_at, updated_at FROM money_occurrence_overrides WHERE user_id = ?").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, money_item_id, occurrence_key, status, amount, finalized_at, updated_at, estimated_amount FROM money_occurrence_settlements WHERE user_id = ?").bind(userId).all<Record<string, unknown>>(),
      this.db.prepare("SELECT id, user_id, type, name, color_key, sort_order, active, created_at, updated_at FROM money_categories WHERE user_id = ?").bind(userId).all<Record<string, unknown>>()
    ]);
    const allEvents = eventRows.results.map(eventRow);
    const activeEvents = allEvents.filter((event) => event.active && !event.deletedAt);
    const allMoney = moneyRows.results.map(moneyRow);
    const activeMoney = allMoney.filter((item) => item.active && !item.deletedAt);
    const rules = ruleRows.results.map(ruleRow);
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    const eventOverrides = eventOverrideRows.results.map(eventOverrideRow);
    const moneyOverrides = moneyOverrideRows.results.map(moneyOverrideRow);
    const settlements = settlementRows.results.map(settlementRow);
    const eventArchiveIds = new Set(activeEvents.filter((event) => { const rule = event.recurrenceRuleId ? rulesById.get(event.recurrenceRuleId) ?? null : null; const date = eventArchiveDate(event, rule); return Boolean(date && date < retentionBoundary); }).map((event) => event.id));
    const moneyArchiveIds = new Set(activeMoney.filter((item) => { const rule = item.recurrenceRuleId ? rulesById.get(item.recurrenceRuleId) ?? null : null; const date = rule ? rule.endsOn : item.date; return Boolean(date && date < retentionBoundary); }).map((item) => item.id));
    const eventSnapshotIds = new Set(eventOverrides.filter((override) => !eventArchiveIds.has(override.eventId) && occurrenceIsBefore(override.occurrenceKey, retentionBoundary) && patchDateIsBefore(override.patch, retentionBoundary)).map((override) => override.eventId));
    const moneySnapshotIds = new Set([...moneyOverrides.filter((override) => !moneyArchiveIds.has(override.moneyItemId) && occurrenceIsBefore(override.occurrenceKey, retentionBoundary) && patchDateIsBefore(override.patch, retentionBoundary)).map((override) => override.moneyItemId), ...settlements.filter((settlement) => !moneyArchiveIds.has(settlement.moneyItemId) && occurrenceIsBefore(settlement.occurrenceKey, retentionBoundary)).map((settlement) => settlement.moneyItemId)]);
    const archivedEventOverrides = eventOverrides.filter((override) => eventArchiveIds.has(override.eventId) || eventSnapshotIds.has(override.eventId) && occurrenceIsBefore(override.occurrenceKey, retentionBoundary) && patchDateIsBefore(override.patch, retentionBoundary));
    const archivedMoneyOverrides = moneyOverrides.filter((override) => moneyArchiveIds.has(override.moneyItemId) || moneySnapshotIds.has(override.moneyItemId) && occurrenceIsBefore(override.occurrenceKey, retentionBoundary) && patchDateIsBefore(override.patch, retentionBoundary));
    const archivedSettlements = settlements.filter((settlement) => moneyArchiveIds.has(settlement.moneyItemId) || moneySnapshotIds.has(settlement.moneyItemId) && occurrenceIsBefore(settlement.occurrenceKey, retentionBoundary));
    const eventIdsInPayload = new Set([...eventArchiveIds, ...eventSnapshotIds]);
    const moneyIdsInPayload = new Set([...moneyArchiveIds, ...moneySnapshotIds]);
    const ruleIdsInPayload = new Set([...activeEvents.filter((event) => eventIdsInPayload.has(event.id) && event.recurrenceRuleId).map((event) => event.recurrenceRuleId as string), ...activeMoney.filter((item) => moneyIdsInPayload.has(item.id) && item.recurrenceRuleId).map((item) => item.recurrenceRuleId as string)]);
    const referencedRuleIds = new Set([...allEvents, ...allMoney].map((record) => record.recurrenceRuleId).filter((id): id is string => Boolean(id)));
    const ruleDeleteIds = new Set([...ruleIdsInPayload].filter((id) => !referencedRuleIds.has(id) || [...allEvents, ...allMoney].filter((record) => record.recurrenceRuleId === id).every((record) => eventArchiveIds.has(record.id) || moneyArchiveIds.has(record.id))));
    const records: ArchiveRecords = {
      events: sortById(allEvents.filter((event) => eventIdsInPayload.has(event.id))),
      recurrenceRules: sortById(rules.filter((rule) => ruleIdsInPayload.has(rule.id))),
      eventOverrides: sortById(archivedEventOverrides),
      eventNotifications: sortById(notificationRows.results.map(notificationRow).filter((row) => eventArchiveIds.has(row.eventId))),
      dailyNotes: sortById(dailyRows.results.map(dailyRow)),
      moneyItems: sortById(allMoney.filter((item) => moneyIdsInPayload.has(item.id))),
      moneyOverrides: sortById(archivedMoneyOverrides),
      moneySettlements: sortById(archivedSettlements),
      moneyCategories: sortById(categoryRows.results.map(categoryRow).filter((category) => moneyIdsInPayload.has(category.id) || allMoney.some((item) => moneyIdsInPayload.has(item.id) && item.categoryId === category.id)))
    };
    const deleteIds: Partial<Record<keyof ArchiveRecords, Set<string>>> = { events: eventArchiveIds, recurrenceRules: ruleDeleteIds, eventOverrides: new Set(archivedEventOverrides.map((row) => row.id)), eventNotifications: new Set(records.eventNotifications.map((row) => row.id)), dailyNotes: new Set(records.dailyNotes.map((row) => row.id)), moneyItems: moneyArchiveIds, moneyOverrides: new Set(archivedMoneyOverrides.map((row) => row.id)), moneySettlements: new Set(archivedSettlements.map((row) => row.id)) };
    const deleteManifest = manifestFrom(records, deleteIds);
    const unsigned = { schemaVersion: ARCHIVE_SCHEMA_VERSION, generatedAt, userId, retentionBoundary, archiveBatchId, records, manifest: deleteManifest };
    const checksum = await archiveChecksum(unsigned);
    return { bundle: { ...unsigned, checksum }, deleteManifest };
  }

  async createCandidate(userId: string, timezone: string, now: Date): Promise<ArchiveCandidateResponse> {
    const candidate = await this.buildCandidate(userId, timezone, now);
    const metadata = { archiveBatchId: candidate.bundle.archiveBatchId, userId, schemaVersion: candidate.bundle.schemaVersion, archivedAt: candidate.bundle.generatedAt, retentionBoundary: candidate.bundle.retentionBoundary, minDate: null, maxDate: null, recordCount: archiveRecordCount(candidate.bundle.records), recordCountsByType: {} as Record<string, number>, checksum: candidate.bundle.checksum };
    const recordCount = archiveRecordCount(candidate.bundle.records);
    await this.db.prepare("INSERT INTO archive_batches (id, user_id, schema_version, manifest_json, checksum, record_count, retention_boundary, status, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?, NULL)").bind(candidate.bundle.archiveBatchId, userId, candidate.bundle.schemaVersion, JSON.stringify(candidate.deleteManifest), candidate.bundle.checksum, recordCount, candidate.bundle.retentionBoundary, candidate.bundle.generatedAt).run();
    return { ...candidate.bundle, metadata, manifestVersion: ARCHIVE_MANIFEST_VERSION };
  }

  async confirm(userId: string, timezone: string, now: Date, input: { archiveBatchId: string; checksum: string; recordCount: number; schemaVersion: number; manifestVersion: number; manifest: ArchiveManifest }) {
    const row = await this.db.prepare("SELECT id, user_id, schema_version, manifest_json, checksum, record_count, retention_boundary, status, created_at, confirmed_at FROM archive_batches WHERE id = ? AND user_id = ?").bind(input.archiveBatchId, userId).first<Record<string, unknown>>();
    if (!row) throw new AppError("ARCHIVE_BATCH_NOT_FOUND", 404, "アーカイブbatchが見つかりません。");
    if (Number(row.schema_version) !== ARCHIVE_SCHEMA_VERSION || input.schemaVersion !== ARCHIVE_SCHEMA_VERSION || input.manifestVersion !== ARCHIVE_MANIFEST_VERSION) throw new AppError("ARCHIVE_SCHEMA_MISMATCH", 409, "アーカイブ形式が更新されています。新しい候補を取得してください。");
    if (input.checksum !== row.checksum || input.recordCount !== Number(row.record_count) || JSON.stringify(input.manifest) !== String(row.manifest_json)) throw new AppError("ARCHIVE_CONFIRM_MISMATCH", 409, "アーカイブ確認内容が一致しません。新しい候補を取得してください。");
    if (row.status === "confirmed") return { confirmed: true, archiveBatchId: input.archiveBatchId, alreadyConfirmed: true, deletedRecordCount: Number(row.record_count) };
    const current = await this.buildCandidate(userId, timezone, now, input.archiveBatchId, String(row.created_at));
    if (current.bundle.checksum !== row.checksum || JSON.stringify(current.deleteManifest) !== String(row.manifest_json)) throw new AppError("ARCHIVE_STALE", 409, "対象データが変化しました。新しい候補を取得してください。");
    const statements: D1PreparedStatement[] = [];
    const idsByType = new Map(current.deleteManifest.records.map((entry) => [`${entry.type}:${entry.id}`, entry]));
    const add = (sql: string, type: ArchiveManifestEntry["type"]) => { for (const entry of idsByType.values()) if (entry.type === type) statements.push(this.db.prepare(sql).bind(userId, entry.id)); };
    add("DELETE FROM event_notifications WHERE user_id = ? AND id = ?", "event_notification");
    add("DELETE FROM event_occurrence_overrides WHERE user_id = ? AND id = ?", "event_override");
    add("DELETE FROM money_occurrence_overrides WHERE user_id = ? AND id = ?", "money_override");
    add("DELETE FROM money_occurrence_settlements WHERE user_id = ? AND id = ?", "money_settlement");
    add("DELETE FROM daily_notes WHERE user_id = ? AND id = ?", "daily_note");
    add("DELETE FROM events WHERE user_id = ? AND id = ? AND active = 1 AND deleted_at IS NULL", "event");
    add("DELETE FROM money_items WHERE user_id = ? AND id = ? AND active = 1 AND deleted_at IS NULL", "money_item");
    for (const entry of current.deleteManifest.records.filter((candidate) => candidate.type === "recurrence_rule")) statements.push(this.db.prepare("DELETE FROM recurrence_rules WHERE user_id = ? AND id = ? AND NOT EXISTS (SELECT 1 FROM events WHERE events.recurrence_rule_id = recurrence_rules.id) AND NOT EXISTS (SELECT 1 FROM money_items WHERE money_items.recurrence_rule_id = recurrence_rules.id)").bind(userId, entry.id));
    statements.push(this.db.prepare("UPDATE archive_batches SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND user_id = ? AND status = 'candidate'").bind(now.toISOString(), input.archiveBatchId, userId));
    if (statements.length > 0) await this.db.batch(statements);
    return { confirmed: true, archiveBatchId: input.archiveBatchId, alreadyConfirmed: false, deletedRecordCount: current.deleteManifest.records.length };
  }
}
