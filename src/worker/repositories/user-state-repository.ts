import type { LifeHubUserState } from "../types";

type StateRow = {
  user_id: string;
  migration_state: "active" | "migration_locked";
  migration_started_at: string | null;
  migration_backup_checksum: string | null;
  migration_backup_created_at: string | null;
  created_at: string;
  updated_at: string;
};

const toState = (row: StateRow): LifeHubUserState => ({
  userId: row.user_id,
  migrationState: row.migration_state,
  migrationStartedAt: row.migration_started_at,
  migrationBackupChecksum: row.migration_backup_checksum,
  migrationBackupCreatedAt: row.migration_backup_created_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class UserStateRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string): Promise<LifeHubUserState | null> {
    const row = await this.db.prepare("SELECT user_id, migration_state, migration_started_at, migration_backup_checksum, migration_backup_created_at, created_at, updated_at FROM lifehub_user_state WHERE user_id = ?").bind(userId).first<StateRow>();
    return row ? toState(row) : null;
  }

  async getOrCreate(userId: string, now: string): Promise<LifeHubUserState> {
    const existing = await this.db.prepare("SELECT user_id, migration_state, migration_started_at, migration_backup_checksum, migration_backup_created_at, created_at, updated_at FROM lifehub_user_state WHERE user_id = ?").bind(userId).first<StateRow>();
    if (existing) return toState(existing);
    await this.db.prepare("INSERT INTO lifehub_user_state (user_id, migration_state, created_at, updated_at) VALUES (?, 'active', ?, ?)").bind(userId, now, now).run();
    const created = await this.db.prepare("SELECT user_id, migration_state, migration_started_at, migration_backup_checksum, migration_backup_created_at, created_at, updated_at FROM lifehub_user_state WHERE user_id = ?").bind(userId).first<StateRow>();
    if (!created) throw new Error("LifeHubUserState could not be created");
    return toState(created);
  }
}
