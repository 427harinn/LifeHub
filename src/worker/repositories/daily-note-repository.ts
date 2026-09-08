import type { DailyNote } from "../types";

type DailyNoteRow = {
  id: string;
  user_id: string;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const toDailyNote = (row: DailyNoteRow): DailyNote => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class DailyNoteRepository {
  constructor(private readonly db: D1Database) {}

  async getByDate(userId: string, date: string): Promise<DailyNote | null> {
    const row = await this.db.prepare(
      "SELECT id, user_id, date, content, created_at, updated_at FROM daily_notes WHERE user_id = ? AND date = ?"
    ).bind(userId, date).first<DailyNoteRow>();
    return row ? toDailyNote(row) : null;
  }

  async upsert(userId: string, date: string, content: string, now: string): Promise<DailyNote> {
    const id = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO daily_notes (id, user_id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at"
    ).bind(id, userId, date, content, now, now).run();
    const note = await this.getByDate(userId, date);
    if (!note) throw new Error("DailyNote could not be saved");
    return note;
  }

  async deleteByDate(userId: string, date: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM daily_notes WHERE user_id = ? AND date = ?").bind(userId, date).run();
    return Boolean(result.meta.changes);
  }
}
