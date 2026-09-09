import type { EventNotification, NotificationTemplate, NotificationTemplateOffset } from "../types";

export type EventNotificationRow = { id: string; user_id: string; event_id: string; offset_minutes: number; sort_order: number; created_at: string };
export type TemplateRow = { id: string; user_id: string; name: string; target_category: "home" | "work" | null; is_default: number; active: number; created_at: string; updated_at: string };
export type TemplateOffsetRow = { id: string; template_id: string; offset_minutes: number; sort_order: number };
const eventSelect = "id, user_id, event_id, offset_minutes, sort_order, created_at";
const templateSelect = "id, user_id, name, target_category, is_default, active, created_at, updated_at";

const toEventNotification = (row: EventNotificationRow): EventNotification => ({ id: row.id, userId: row.user_id, eventId: row.event_id, offsetMinutes: row.offset_minutes, sortOrder: row.sort_order, createdAt: row.created_at });
const toTemplate = (row: TemplateRow, offsets: NotificationTemplateOffset[]): NotificationTemplate => ({ id: row.id, userId: row.user_id, name: row.name, targetCategory: row.target_category, isDefault: row.is_default === 1, active: row.active === 1, offsets, createdAt: row.created_at, updatedAt: row.updated_at });

export class NotificationRepository {
  constructor(private readonly db: D1Database) {}

  async listEventNotifications(userId: string): Promise<EventNotification[]> {
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM event_notifications WHERE user_id = ? ORDER BY event_id, sort_order, offset_minutes`).bind(userId).all<EventNotificationRow>();
    return result.results.map(toEventNotification);
  }

  async listEventNotificationsForEvent(userId: string, eventId: string): Promise<EventNotification[]> {
    const result = await this.db.prepare(`SELECT ${eventSelect} FROM event_notifications WHERE user_id = ? AND event_id = ? ORDER BY sort_order, offset_minutes`).bind(userId, eventId).all<EventNotificationRow>();
    return result.results.map(toEventNotification);
  }

  async replaceEventNotifications(userId: string, eventId: string, offsets: number[], now: string): Promise<void> {
    const statements = [this.db.prepare("DELETE FROM event_notifications WHERE user_id = ? AND event_id = ?").bind(userId, eventId), ...offsets.map((offset, index) => this.db.prepare("INSERT INTO event_notifications (id, user_id, event_id, offset_minutes, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), userId, eventId, offset, index, now))];
    await this.db.batch(statements);
  }

  async listTemplates(userId: string): Promise<NotificationTemplate[]> {
    const templates = await this.db.prepare(`SELECT ${templateSelect} FROM notification_templates WHERE user_id = ? AND active = 1 ORDER BY is_default DESC, updated_at DESC`).bind(userId).all<TemplateRow>();
    return Promise.all(templates.results.map(async (template) => {
      const offsets = await this.db.prepare("SELECT id, template_id, offset_minutes, sort_order FROM notification_template_offsets WHERE template_id = ? ORDER BY sort_order, offset_minutes").bind(template.id).all<TemplateOffsetRow>();
      return toTemplate(template, offsets.results.map((row) => ({ id: row.id, templateId: row.template_id, offsetMinutes: row.offset_minutes, sortOrder: row.sort_order })));
    }));
  }

  async createTemplate(userId: string, name: string, targetCategory: "home" | "work" | null, isDefault: boolean, offsets: number[], now: string): Promise<NotificationTemplate> {
    const id = crypto.randomUUID();
    const statements = [this.db.prepare("INSERT INTO notification_templates (id, user_id, name, target_category, is_default, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").bind(id, userId, name, targetCategory, isDefault ? 1 : 0, now, now), ...offsets.map((offset, index) => this.db.prepare("INSERT INTO notification_template_offsets (id, template_id, offset_minutes, sort_order) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, offset, index))];
    await this.db.batch(statements);
    const created = (await this.listTemplates(userId)).find((template) => template.id === id);
    if (!created) throw new Error("NotificationTemplate could not be created");
    return created;
  }

  async updateTemplate(userId: string, id: string, input: { name?: string; targetCategory?: "home" | "work" | null; isDefault?: boolean; offsets?: number[] }, now: string): Promise<NotificationTemplate | null> {
    const current = (await this.listTemplates(userId)).find((template) => template.id === id);
    if (!current) return null;
    const name = input.name ?? current.name;
    const targetCategory = input.targetCategory === undefined ? current.targetCategory : input.targetCategory;
    const isDefault = input.isDefault ?? current.isDefault;
    const statements = [this.db.prepare("UPDATE notification_templates SET name = ?, target_category = ?, is_default = ?, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1").bind(name, targetCategory, isDefault ? 1 : 0, now, id, userId)];
    if (input.offsets !== undefined) {
      statements.push(this.db.prepare("DELETE FROM notification_template_offsets WHERE template_id = ?").bind(id));
      statements.push(...input.offsets.map((offset, index) => this.db.prepare("INSERT INTO notification_template_offsets (id, template_id, offset_minutes, sort_order) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, offset, index)));
    }
    await this.db.batch(statements);
    return (await this.listTemplates(userId)).find((template) => template.id === id) ?? null;
  }

  async deleteTemplate(userId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE notification_templates SET active = 0, updated_at = ? WHERE id = ? AND user_id = ? AND active = 1").bind(new Date().toISOString(), id, userId).run();
    return Boolean(result.meta.changes);
  }
}

export type DeliveryClaim = { id: string; userId: string; notificationType: "event" | "morning_summary" | "evening_summary"; eventId: string | null; occurrenceKey: string | null; eventNotificationId: string | null; scheduledFor: string; dedupeKey: string; now: string };
export const NOTIFICATION_CLAIM_LEASE_MS = 10 * 60 * 1000;
const staleBefore = (now: string) => new Date(Date.parse(now) - NOTIFICATION_CLAIM_LEASE_MS).toISOString();

export class NotificationDeliveryRepository {
  constructor(private readonly db: D1Database) {}
  async claim(input: DeliveryClaim): Promise<boolean> {
    const result = await this.db.prepare(`INSERT INTO notification_deliveries (id, user_id, notification_type, event_id, occurrence_key, event_notification_id, scheduled_for, dedupe_key, sent_at, status, claimed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET id = excluded.id, status = 'pending', claimed_at = excluded.claimed_at, updated_at = excluded.updated_at
      WHERE notification_deliveries.status = 'pending' AND notification_deliveries.claimed_at <= ?`).bind(input.id, input.userId, input.notificationType, input.eventId, input.occurrenceKey, input.eventNotificationId, input.scheduledFor, input.dedupeKey, input.now, input.now, input.now, staleBefore(input.now)).run();
    return Boolean(result.meta.changes);
  }
  async markSent(dedupeKey: string, now: string): Promise<void> {
    const result = await this.db.prepare("UPDATE notification_deliveries SET status = 'sent', sent_at = ?, updated_at = ? WHERE dedupe_key = ? AND status = 'pending'").bind(now, now, dedupeKey).run();
    if ((result.meta.changes ?? 0) > 0) return;
    const current = await this.db.prepare("SELECT status FROM notification_deliveries WHERE dedupe_key = ?").bind(dedupeKey).first<{ status: string }>();
    if (current?.status === "sent") return;
    throw new Error("notification-delivery-mark-sent-failed");
  }
  async release(dedupeKey: string): Promise<void> { await this.db.prepare("DELETE FROM notification_deliveries WHERE dedupe_key = ? AND status = 'pending'").bind(dedupeKey).run(); }
}
