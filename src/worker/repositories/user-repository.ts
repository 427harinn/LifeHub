import type { AuthenticatedUser } from "../types";

type UserRow = { id: string; email: string; password_hash: string; display_name: string };

const toUser = (row: UserRow | null): (AuthenticatedUser & { passwordHash: string }) | null =>
  row
    ? { id: row.id, email: row.email, passwordHash: row.password_hash, displayName: row.display_name }
    : null;

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findByEmail(email: string) {
    const row = await this.db.prepare("SELECT id, email, password_hash, display_name FROM users WHERE email = ?").bind(email).first<UserRow>();
    return toUser(row);
  }

  async findById(id: string) {
    const row = await this.db.prepare("SELECT id, email, password_hash, display_name FROM users WHERE id = ?").bind(id).first<UserRow>();
    return toUser(row);
  }

  async create(input: { id: string; email: string; passwordHash: string; displayName: string; now: string }) {
    await this.db.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(input.id, input.email, input.passwordHash, input.displayName, input.now, input.now).run();
    return { id: input.id, email: input.email, passwordHash: input.passwordHash, displayName: input.displayName };
  }

  async updatePassword(id: string, passwordHash: string, now: string) {
    await this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(passwordHash, now, id).run();
  }
}
