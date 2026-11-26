import { PASSWORD_RESET_TOKEN_TTL_SECONDS, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../lib/constants";
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { readCookie } from "../lib/cookies";
import { conflictError, passwordResetTokenInvalidError, unauthenticatedError } from "../lib/errors";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token-repository";
import { SessionRepository } from "../repositories/session-repository";
import { UserRepository } from "../repositories/user-repository";
import type { AuthenticatedUser } from "../types";

const nowIso = () => new Date().toISOString();
const expiresAt = () => new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

export type AuthSessionResult = { user: AuthenticatedUser; token: string };

const publicUser = (user: { id: string; email: string; displayName: string }): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName
});

export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly resetTokens: PasswordResetTokenRepository;

  constructor(private readonly db: D1Database) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
    this.resetTokens = new PasswordResetTokenRepository(db);
  }

  async register(input: { email: string; password: string; displayName: string }): Promise<AuthSessionResult> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) throw conflictError("このメールアドレスはすでに登録されています。");
    const now = nowIso();
    const user = await this.users.create({ id: crypto.randomUUID(), email, passwordHash: await hashPassword(input.password), displayName: input.displayName.trim(), now });
    return this.createSession(user);
  }

  async login(emailInput: string, password: string): Promise<AuthSessionResult> {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw unauthenticatedError();
    return this.createSession(user);
  }

  // Returns null when no account exists for the email. Callers must not leak
  // the difference to the client (the request endpoint always responds the
  // same way), so account existence stays server-side.
  async createPasswordResetToken(emailInput: string): Promise<{ user: AuthenticatedUser; token: string } | null> {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
    if (!user) return null;
    await this.resetTokens.deleteAllForUser(user.id);
    const token = generateSessionToken();
    const now = new Date();
    await this.resetTokens.create({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000).toISOString(),
      now: now.toISOString()
    });
    return { user: publicUser(user), token };
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthSessionResult> {
    const record = await this.resetTokens.findByTokenHash(await sha256Hex(token));
    const now = nowIso();
    if (!record || record.used_at || record.expires_at <= now) throw passwordResetTokenInvalidError();
    const user = await this.users.findById(record.user_id);
    if (!user) throw passwordResetTokenInvalidError();
    await this.users.updatePassword(user.id, await hashPassword(newPassword), now);
    await this.resetTokens.markUsed(record.id, now);
    await this.resetTokens.deleteUnusedForUser(user.id);
    await this.sessions.deleteAllForUser(user.id);
    return this.createSession(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw unauthenticatedError();
    await this.users.updatePassword(userId, await hashPassword(newPassword), nowIso());
  }

  async logout(request: Request): Promise<void> {
    const token = readCookie(request, SESSION_COOKIE_NAME);
    if (token) await this.sessions.deleteByTokenHash(await sha256Hex(token));
  }

  async authenticate(request: Request): Promise<AuthenticatedUser> {
    const token = readCookie(request, SESSION_COOKIE_NAME);
    if (!token) throw unauthenticatedError();
    const session = await this.sessions.findValidByTokenHash(await sha256Hex(token), nowIso());
    if (!session) throw unauthenticatedError();
    const user = await this.users.findById(session.user_id);
    if (!user) throw unauthenticatedError();
    return publicUser(user);
  }

  private async createSession(user: { id: string; email: string; displayName: string }): Promise<AuthSessionResult> {
    const now = nowIso();
    const token = generateSessionToken();
    await this.sessions.create({ id: crypto.randomUUID(), userId: user.id, tokenHash: await sha256Hex(token), expiresAt: expiresAt(), now });
    return { user: publicUser(user), token };
  }
}
