export type SummaryJobType = "morning" | "evening";
export type NotificationSummaryJob = {
  id: string;
  userId: string;
  summaryType: SummaryJobType;
  localDate: string;
  scheduledFor: string;
  status: "pending" | "sent";
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SummaryJobRow = {
  id: string; user_id: string; summary_type: SummaryJobType; local_date: string; scheduled_for: string;
  status: "pending" | "sent"; sent_at: string | null; created_at: string; updated_at: string;
};
const select = "id, user_id, summary_type, local_date, scheduled_for, status, sent_at, created_at, updated_at";
const toJob = (row: SummaryJobRow): NotificationSummaryJob => ({ id: row.id, userId: row.user_id, summaryType: row.summary_type, localDate: row.local_date, scheduledFor: row.scheduled_for, status: row.status, sentAt: row.sent_at, createdAt: row.created_at, updatedAt: row.updated_at });

export class NotificationSummaryJobRepository {
  constructor(private readonly db: D1Database) {}

  async replacePendingForUser(userId: string, jobs: NotificationSummaryJob[]): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM notification_summary_jobs WHERE user_id = ? AND status = 'pending'").bind(userId),
      ...jobs.map((job) => this.db.prepare(`INSERT OR IGNORE INTO notification_summary_jobs (${select}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(job.id, job.userId, job.summaryType, job.localDate, job.scheduledFor, job.status, job.sentAt, job.createdAt, job.updatedAt))
    ]);
  }

  async listDue(at: string, deliveryWindowMinutes: number): Promise<NotificationSummaryJob[]> {
    const lowerBound = new Date(Date.parse(at) - deliveryWindowMinutes * 60_000).toISOString();
    const result = await this.db.prepare(`SELECT ${select} FROM notification_summary_jobs WHERE status = 'pending' AND scheduled_for > ? AND scheduled_for <= ? ORDER BY scheduled_for, user_id, summary_type`).bind(lowerBound, at).all<SummaryJobRow>();
    return result.results.map(toJob);
  }

  async markSent(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE notification_summary_jobs SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, now, id).run();
  }

  async deleteExpiredPending(before: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM notification_summary_jobs WHERE status = 'pending' AND scheduled_for <= ?").bind(before).run();
    return result.meta.changes ?? 0;
  }
}
