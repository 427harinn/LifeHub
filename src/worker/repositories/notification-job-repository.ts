import type { NotificationJob } from "../types";

type NotificationJobRow = {
  id: string; user_id: string; event_id: string; occurrence_key: string | null; event_notification_id: string;
  scheduled_for: string; payload_json: string; status: "pending" | "sent"; sent_at: string | null; created_at: string; updated_at: string;
};

const select = "id, user_id, event_id, occurrence_key, event_notification_id, scheduled_for, payload_json, status, sent_at, created_at, updated_at";
const toJob = (row: NotificationJobRow): NotificationJob => ({ id: row.id, userId: row.user_id, eventId: row.event_id, occurrenceKey: row.occurrence_key, eventNotificationId: row.event_notification_id, scheduledFor: row.scheduled_for, payload: JSON.parse(row.payload_json) as NotificationJob["payload"], status: row.status, sentAt: row.sent_at, createdAt: row.created_at, updatedAt: row.updated_at });

export class NotificationJobRepository {
  constructor(private readonly db: D1Database) {}

  async replacePendingForEvent(userId: string, eventId: string, jobs: NotificationJob[]): Promise<void> {
    const statements = [
      this.db.prepare("DELETE FROM notification_jobs WHERE user_id = ? AND event_id = ? AND status = 'pending'").bind(userId, eventId),
      ...jobs.map((job) => this.db.prepare(`INSERT OR IGNORE INTO notification_jobs (${select}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(job.id, job.userId, job.eventId, job.occurrenceKey, job.eventNotificationId, job.scheduledFor, JSON.stringify(job.payload), job.status, job.sentAt, job.createdAt, job.updatedAt))
    ];
    await this.db.batch(statements);
  }

  async listDue(at: string, deliveryWindowMinutes: number): Promise<NotificationJob[]> {
    const lowerBound = new Date(Date.parse(at) - deliveryWindowMinutes * 60_000).toISOString();
    const result = await this.db.prepare(`SELECT ${select} FROM notification_jobs WHERE status = 'pending' AND scheduled_for > ? AND scheduled_for <= ? ORDER BY scheduled_for, user_id, event_id`).bind(lowerBound, at).all<NotificationJobRow>();
    return result.results.map(toJob);
  }

  async markSent(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE notification_jobs SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, now, id).run();
  }

  async deletePending(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM notification_jobs WHERE id = ? AND status = 'pending'").bind(id).run();
  }

  async deletePendingForEvent(userId: string, eventId: string): Promise<void> {
    await this.db.prepare("DELETE FROM notification_jobs WHERE user_id = ? AND event_id = ? AND status = 'pending'").bind(userId, eventId).run();
  }
}
