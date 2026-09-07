type SessionRow = { id: string; user_id: string; token_hash: string; expires_at: string; created_at: string; last_used_at: string };

export class SessionRepository {
  constructor(private readonly db: D1Database) {}

  async findValidByTokenHash(tokenHash: string, now: string) {
    return this.db.prepare(
      "SELECT id, user_id, token_hash, expires_at, created_at, last_used_at FROM sessions WHERE token_hash = ? AND expires_at > ?"
    ).bind(tokenHash, now).first<SessionRow>();
  }

  async create(input: { id: string; userId: string; tokenHash: string; expiresAt: string; now: string }) {
    await this.db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(input.id, input.userId, input.tokenHash, input.expiresAt, input.now, input.now).run();
  }

  async deleteByTokenHash(tokenHash: string) {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
}
