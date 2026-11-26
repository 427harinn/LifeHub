type PasswordResetTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export class PasswordResetTokenRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: { id: string; userId: string; tokenHash: string; expiresAt: string; now: string }) {
    await this.db.prepare(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
    ).bind(input.id, input.userId, input.tokenHash, input.expiresAt, input.now).run();
  }

  async findByTokenHash(tokenHash: string) {
    return this.db.prepare(
      "SELECT id, user_id, token_hash, expires_at, used_at, created_at FROM password_reset_tokens WHERE token_hash = ?"
    ).bind(tokenHash).first<PasswordResetTokenRow>();
  }

  async markUsed(id: string, now: string) {
    await this.db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").bind(now, id).run();
  }

  async deleteUnusedForUser(userId: string) {
    await this.db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").bind(userId).run();
  }

  async deleteAllForUser(userId: string) {
    await this.db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(userId).run();
  }
}
