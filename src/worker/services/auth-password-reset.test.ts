import { describe, expect, it } from "vitest";
import { AuthService } from "./auth-service";
import { sha256Hex } from "../lib/crypto";

type UserRow = { id: string; email: string; password_hash: string; display_name: string };
type SessionRow = { id: string; user_id: string; token_hash: string; expires_at: string; created_at: string; last_used_at: string };
type ResetRow = { id: string; user_id: string; token_hash: string; expires_at: string; used_at: string | null; created_at: string };

// Minimal in-memory D1 stand-in covering exactly the statements issued by
// UserRepository, SessionRepository and PasswordResetTokenRepository.
const createFakeDb = () => {
  const users: UserRow[] = [];
  const sessions: SessionRow[] = [];
  const resetTokens: ResetRow[] = [];

  const prepare = (sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { bindings = values; return statement; },
      first: <T>() => {
        if (sql.includes("FROM users WHERE email = ?")) return Promise.resolve((users.find((row) => row.email === bindings[0]) ?? null) as T | null);
        if (sql.includes("FROM users WHERE id = ?")) return Promise.resolve((users.find((row) => row.id === bindings[0]) ?? null) as T | null);
        if (sql.includes("FROM sessions WHERE token_hash = ?")) return Promise.resolve((sessions.find((row) => row.token_hash === bindings[0] && row.expires_at > String(bindings[1])) ?? null) as T | null);
        if (sql.includes("FROM password_reset_tokens WHERE token_hash = ?")) return Promise.resolve((resetTokens.find((row) => row.token_hash === bindings[0]) ?? null) as T | null);
        return Promise.resolve(null);
      },
      run: () => {
        if (sql.startsWith("INSERT INTO users")) users.push({ id: String(bindings[0]), email: String(bindings[1]), password_hash: String(bindings[2]), display_name: String(bindings[3]) });
        else if (sql.startsWith("UPDATE users SET password_hash")) { const row = users.find((entry) => entry.id === bindings[2]); if (row) row.password_hash = String(bindings[0]); }
        else if (sql.startsWith("INSERT INTO sessions")) sessions.push({ id: String(bindings[0]), user_id: String(bindings[1]), token_hash: String(bindings[2]), expires_at: String(bindings[3]), created_at: String(bindings[4]), last_used_at: String(bindings[5]) });
        else if (sql.startsWith("DELETE FROM sessions WHERE token_hash = ?")) { const index = sessions.findIndex((row) => row.token_hash === bindings[0]); if (index >= 0) sessions.splice(index, 1); }
        else if (sql.startsWith("DELETE FROM sessions WHERE user_id = ?")) { for (let index = sessions.length - 1; index >= 0; index -= 1) if (sessions[index].user_id === bindings[0]) sessions.splice(index, 1); }
        else if (sql.startsWith("INSERT INTO password_reset_tokens")) resetTokens.push({ id: String(bindings[0]), user_id: String(bindings[1]), token_hash: String(bindings[2]), expires_at: String(bindings[3]), used_at: null, created_at: String(bindings[4]) });
        else if (sql.startsWith("UPDATE password_reset_tokens SET used_at")) { const row = resetTokens.find((entry) => entry.id === bindings[1]); if (row) row.used_at = String(bindings[0]); }
        else if (sql.startsWith("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL")) { for (let index = resetTokens.length - 1; index >= 0; index -= 1) if (resetTokens[index].user_id === bindings[0] && resetTokens[index].used_at === null) resetTokens.splice(index, 1); }
        else if (sql.startsWith("DELETE FROM password_reset_tokens WHERE user_id = ?")) { for (let index = resetTokens.length - 1; index >= 0; index -= 1) if (resetTokens[index].user_id === bindings[0]) resetTokens.splice(index, 1); }
        return Promise.resolve({ success: true });
      },
      all: <T>() => Promise.resolve({ results: [] as T[] })
    };
    return statement;
  };

  return { db: { prepare } as unknown as D1Database, users, sessions, resetTokens };
};

const sessionRequest = (token: string) => new Request("https://lifehub.test", { headers: { cookie: `lifehub_session=${token}` } });

describe("password reset", () => {
  it("returns null for an unknown email without creating a token", async () => {
    const { db, resetTokens } = createFakeDb();
    const service = new AuthService(db);
    await expect(service.createPasswordResetToken("nobody@example.com")).resolves.toBeNull();
    expect(resetTokens).toHaveLength(0);
  });

  it("resets the password, invalidates old sessions, and burns the token", async () => {
    const { db, resetTokens } = createFakeDb();
    const service = new AuthService(db);
    const registered = await service.register({ email: "me@example.com", password: "old-password-123", displayName: "自分" });

    const created = await service.createPasswordResetToken("ME@example.com");
    expect(created?.user.email).toBe("me@example.com");
    expect(resetTokens).toHaveLength(1);
    expect(resetTokens[0].token_hash).toBe(await sha256Hex(created!.token));
    expect(resetTokens[0].token_hash).not.toBe(created!.token);

    const reset = await service.resetPassword(created!.token, "new-password-456");
    expect(reset.user.email).toBe("me@example.com");

    // Old password and old session are dead; the new password and the fresh
    // session issued by the reset both work.
    await expect(service.login("me@example.com", "old-password-123")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(service.login("me@example.com", "new-password-456")).resolves.toMatchObject({ user: { email: "me@example.com" } });
    await expect(service.authenticate(sessionRequest(registered.token))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(service.authenticate(sessionRequest(reset.token))).resolves.toMatchObject({ email: "me@example.com" });

    // A reset token is single-use.
    await expect(service.resetPassword(created!.token, "another-password-789")).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });
  });

  it("rejects unknown and expired tokens with the same error", async () => {
    const { db, resetTokens } = createFakeDb();
    const service = new AuthService(db);
    await service.register({ email: "me@example.com", password: "old-password-123", displayName: "自分" });
    await expect(service.resetPassword("no-such-token", "new-password-456")).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });

    const created = await service.createPasswordResetToken("me@example.com");
    resetTokens[0].expires_at = "2000-01-01T00:00:00.000Z";
    await expect(service.resetPassword(created!.token, "new-password-456")).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });
    await expect(service.login("me@example.com", "old-password-123")).resolves.toMatchObject({ user: { email: "me@example.com" } });
  });

  it("replaces a pending token when a new reset is requested", async () => {
    const { db, resetTokens } = createFakeDb();
    const service = new AuthService(db);
    await service.register({ email: "me@example.com", password: "old-password-123", displayName: "自分" });
    const first = await service.createPasswordResetToken("me@example.com");
    const second = await service.createPasswordResetToken("me@example.com");
    expect(resetTokens).toHaveLength(1);
    await expect(service.resetPassword(first!.token, "new-password-456")).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });
    await expect(service.resetPassword(second!.token, "new-password-456")).resolves.toMatchObject({ user: { email: "me@example.com" } });
  });
});
