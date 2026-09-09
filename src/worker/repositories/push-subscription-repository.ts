export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  enabled: number;
  disabled_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SavePushSubscription = Omit<PushSubscriptionRecord, "enabled" | "disabled_at" | "last_success_at" | "last_failure_at" | "created_at" | "updated_at"> & { now: string };

const select = "id, user_id, endpoint, endpoint_hash, p256dh, auth, enabled, disabled_at, last_success_at, last_failure_at, created_at, updated_at";

export class PushSubscriptionRepository {
  constructor(private readonly db: D1Database) {}

  async upsert(input: SavePushSubscription): Promise<void> {
    await this.db.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, endpoint_hash, p256dh, auth, enabled, disabled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
       ON CONFLICT(user_id, endpoint) DO UPDATE SET endpoint_hash = excluded.endpoint_hash, p256dh = excluded.p256dh, auth = excluded.auth, enabled = 1, disabled_at = NULL, updated_at = excluded.updated_at`
    ).bind(input.id, input.user_id, input.endpoint, input.endpoint_hash, input.p256dh, input.auth, input.now, input.now).run();
  }

  async delete(userId: string, endpoint: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(userId, endpoint).run();
    return Boolean(result.meta.changes);
  }

  async listActive(userId: string): Promise<PushSubscriptionRecord[]> {
    const result = await this.db.prepare(`SELECT ${select} FROM push_subscriptions WHERE user_id = ? AND enabled = 1 AND disabled_at IS NULL`).bind(userId).all<PushSubscriptionRecord>();
    return result.results;
  }

  async markDisabled(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE push_subscriptions SET enabled = 0, disabled_at = ?, last_failure_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, id).run();
  }

  async markSuccess(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE push_subscriptions SET last_success_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
  }

  async markFailure(id: string, now: string): Promise<void> {
    await this.db.prepare("UPDATE push_subscriptions SET last_failure_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
  }
}
