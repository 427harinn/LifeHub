import { createExpiredSessionCookie, createSessionCookie } from "./lib/cookies";
import { DEFAULT_TIMEZONE, DISPLAY_NAME_MAX_LENGTH, EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./lib/constants";
import { AppError, notFoundError, validationError } from "./lib/errors";
import { sha256Hex } from "./lib/crypto";
import { requireAuth, type Handler, type RequestContext } from "./middleware/auth";
import { requireWritableUserState } from "./middleware/migration-guard";
import { SettingsRepository } from "./repositories/settings-repository";
import { EventRepository } from "./repositories/event-repository";
import { EventOccurrenceOverrideRepository } from "./repositories/event-occurrence-override-repository";
import { RecurrenceRepository } from "./repositories/recurrence-repository";
import { DailyNoteRepository } from "./repositories/daily-note-repository";
import { UserStateRepository } from "./repositories/user-state-repository";
import { NotificationRepository } from "./repositories/notification-repository";
import { PushSubscriptionRepository } from "./repositories/push-subscription-repository";
import { MoneyCategoryRepository } from "./repositories/money-category-repository";
import { isMoneyCategoryColorKey } from "../lib/money-category-colors";
import { MoneyRepository } from "./repositories/money-repository";
import { AuthService } from "./services/auth-service";
import { EventService } from "./services/event-service";
import { EventProjectionService, dayToRange, isDateKey, monthKeyToGridRange } from "./services/event-projection-service";
import type { Event, UserSettings } from "./types";
import { normalizeNotificationPreference } from "../lib/notification-preferences";
import { runNotificationScheduler } from "./services/notification-scheduler-service";
import { MoneyService } from "./services/money-service";
import { MoneyOccurrenceOverrideRepository } from "./repositories/money-occurrence-override-repository";
import { MoneyOccurrenceSettlementRepository } from "./repositories/money-occurrence-settlement-repository";
import { runMoneySettlement } from "./services/money-settlement-service";
import { NotificationJobService, runNotificationJobRefill } from "./services/notification-job-service";
import { ArchiveService } from "./services/archive-service";
import { BackupService } from "./services/backup-service";
import { MigrationService } from "./services/migration-service";

const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers: { "cache-control": "no-store", ...init.headers } });
const nowIso = () => new Date().toISOString();

const parseObject = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* handled below */ }
  throw validationError({ body: "JSON形式の入力が必要です。" });
};

const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

const validateCredentials = (body: Record<string, unknown>, includeDisplayName: boolean) => {
  const email = stringValue(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = stringValue(body.displayName);
  const details: Record<string, string> = {};
  if (!email || email.length > EMAIL_MAX_LENGTH || !/^\S+@\S+\.\S+$/.test(email)) details.email = "メールアドレスを入力してください。";
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) details.password = `パスワードは${PASSWORD_MIN_LENGTH}〜${PASSWORD_MAX_LENGTH}文字で入力してください。`;
  if (includeDisplayName && (!displayName || displayName.length > DISPLAY_NAME_MAX_LENGTH)) details.displayName = "表示名を入力してください。";
  if (Object.keys(details).length > 0) throw validationError(details);
  return { email, password, displayName };
};

const authRegister: Handler = async ({ request, env }) => {
  const input = validateCredentials(await parseObject(request), true);
  const result = await new AuthService(env.DB).register(input);
  const now = nowIso();
  await new UserStateRepository(env.DB).getOrCreate(result.user.id, now);
  await new SettingsRepository(env.DB).getOrCreate(result.user.id, now, DEFAULT_TIMEZONE);
  await new MoneyCategoryRepository(env.DB).ensureForUser(result.user.id, now);
  return json({ user: result.user }, { status: 201, headers: { "set-cookie": createSessionCookie(result.token, env.APP_ENV) } });
};

const authLogin: Handler = async ({ request, env }) => {
  const input = validateCredentials(await parseObject(request), false);
  const result = await new AuthService(env.DB).login(input.email, input.password);
  const now = nowIso();
  await new UserStateRepository(env.DB).getOrCreate(result.user.id, now);
  await new SettingsRepository(env.DB).getOrCreate(result.user.id, now, DEFAULT_TIMEZONE);
  await new MoneyCategoryRepository(env.DB).ensureForUser(result.user.id, now);
  return json({ user: result.user }, { headers: { "set-cookie": createSessionCookie(result.token, env.APP_ENV) } });
};

const authLogout: Handler = async ({ request, env }) => {
  await new AuthService(env.DB).logout(request);
  return json({ loggedOut: true }, { headers: { "set-cookie": createExpiredSessionCookie(env.APP_ENV) } });
};

const authMe = requireAuth(({ user }) => Promise.resolve(json({ user })));

const getSettings = requireAuth(async ({ env, user }) => {
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  return json({ settings });
});

const patchSettings = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const details: Record<string, string> = {};
  const input: Partial<Omit<UserSettings, "userId" | "createdAt" | "updatedAt">> = {};
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) details.timezone = "タイムゾーンを入力してください。";
    else input.timezone = body.timezone.trim();
  }
  if (body.weekStartsOn !== undefined) {
    if (!Number.isInteger(body.weekStartsOn) || Number(body.weekStartsOn) < 0 || Number(body.weekStartsOn) > 6) details.weekStartsOn = "週の開始曜日が不正です。";
    else input.weekStartsOn = Number(body.weekStartsOn);
  }
  for (const field of ["morningSummaryEnabled", "eveningSummaryEnabled"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") details[field] = "ON / OFFの値が不正です。";
      else input[field] = body[field];
    }
  }
  for (const field of ["morningSummaryTime", "eveningSummaryTime", "periodDefaultDeadlineTime"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body[field])) details[field] = "時刻はHH:MM形式で入力してください。";
      else input[field] = body[field];
    }
  }
  for (const field of ["lastUsedNotificationHome", "lastUsedNotificationWork"] as const) {
    if (body[field] !== undefined) {
      const preference = normalizeNotificationPreference(body[field]);
      if (!preference) details[field] = "通知の前回設定が不正です。";
      else input[field] = preference;
    }
  }
  if (Object.keys(details).length > 0) throw validationError(details);
  const now = nowIso();
  const repository = new SettingsRepository(env.DB);
  const current = await repository.getOrCreate(user.id, now, DEFAULT_TIMEZONE);
  const settings = await repository.update(user.id, input, now);
  if (settings.timezone !== current.timezone || settings.weekStartsOn !== current.weekStartsOn || settings.periodDefaultDeadlineTime !== current.periodDefaultDeadlineTime) {
    await new NotificationJobService(env.DB).backfillForUser(user.id, new Date(now));
  }
  return json({ settings });
});

const getUserState = requireAuth(async ({ env, user }) => {
  const state = await new UserStateRepository(env.DB).getOrCreate(user.id, nowIso());
  return json({ state });
});

const getArchiveCandidates = requireAuth(async ({ env, user }) => {
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  return json(await archiveService(env).createCandidate(user.id, settings.timezone, new Date()));
});

const confirmArchive = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const manifest = body.manifest;
  if (typeof body.archiveBatchId !== "string" || typeof body.checksum !== "string" || !Number.isInteger(body.recordCount) || !Number.isInteger(body.schemaVersion) || !Number.isInteger(body.manifestVersion) || !manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw validationError({ archive: "アーカイブ確認情報が不正です。" });
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  return json(await archiveService(env).confirm(user.id, settings.timezone, new Date(), { archiveBatchId: body.archiveBatchId, checksum: body.checksum, recordCount: Number(body.recordCount), schemaVersion: Number(body.schemaVersion), manifestVersion: Number(body.manifestVersion), manifest: manifest as never }));
});

const getBackupExport = requireAuth(async ({ env, user }) => json(await new BackupService(env.DB).exportCloud(user.id, new Date())));
const getMigrationStatus = requireAuth(async ({ env, user }) => json(await new MigrationService(env.DB).status(user.id)));
const startMigration = requireAuth(async ({ request, env, user }) => {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 10 * 1024 * 1024) throw new AppError("MIGRATION_PAYLOAD_TOO_LARGE", 413, "バックアップファイルが大きすぎます。");
  const body = await parseObject(request);
  if (!body.manifest || typeof body.manifest !== "object" || Array.isArray(body.manifest) || !body.backup) throw validationError({ manifest: "保存済みバックアップの再確認が必要です。" });
  return json(await new MigrationService(env.DB).start(user.id, { migrationId: stringValue(body.migrationId), backupChecksum: stringValue(body.backupChecksum), schemaVersion: Number(body.schemaVersion), manifest: body.manifest as never, backup: body.backup }));
});
const restoreMigration = requireAuth(async ({ request, env, user }) => {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 10 * 1024 * 1024) throw new AppError("MIGRATION_PAYLOAD_TOO_LARGE", 413, "バックアップファイルが大きすぎます。");
  const body = await parseObject(request);
  if (!stringValue(body.migrationId) || !body.backup) throw validationError({ backup: "バックアップを選択してください。" });
  return json(await new MigrationService(env.DB).restore(user.id, stringValue(body.migrationId), body.backup));
});
const verifyMigration = requireAuth(async ({ request, env, user }) => {
  const body = await parseObject(request);
  if (!stringValue(body.migrationId) || !stringValue(body.backupChecksum) || !Number.isInteger(body.archiveRecordCount)) throw validationError({ migration: "復元確認情報が不正です。" });
  return json(await new MigrationService(env.DB).verify(user.id, stringValue(body.migrationId), stringValue(body.backupChecksum), Number(body.archiveRecordCount)));
});
const completeMigration = requireAuth(async ({ request, env, user }) => {
  const body = await parseObject(request);
  if (!stringValue(body.migrationId)) throw validationError({ migrationId: "機種変更IDが必要です。" });
  return json(await new MigrationService(env.DB).complete(user.id, stringValue(body.migrationId)));
});
const cancelMigration = requireAuth(async ({ request, env, user }) => {
  const body = await parseObject(request);
  if (!stringValue(body.migrationId)) throw validationError({ migrationId: "機種変更IDが必要です。" });
  return json(await new MigrationService(env.DB).cancel(user.id, stringValue(body.migrationId)));
});

const eventProjection = (env: Env) => new EventProjectionService(new EventRepository(env.DB), new RecurrenceRepository(env.DB), new EventOccurrenceOverrideRepository(env.DB));
const eventService = (env: Env) => new EventService(new EventRepository(env.DB), new RecurrenceRepository(env.DB), new EventOccurrenceOverrideRepository(env.DB), eventProjection(env), new NotificationRepository(env.DB), new NotificationJobService(env.DB));
const moneyService = (env: Env) => new MoneyService(new MoneyRepository(env.DB), new MoneyCategoryRepository(env.DB), new RecurrenceRepository(env.DB), new MoneyOccurrenceOverrideRepository(env.DB), new MoneyOccurrenceSettlementRepository(env.DB));
const archiveService = (env: Env) => new ArchiveService(env.DB);
const withEventNotifications = async (userId: string, events: Event[], db: D1Database) => {
  const repository = new NotificationRepository(db);
  const offsets = new Map<string, Promise<number[]>>();
  return Promise.all(events.map(async (event) => {
    let values = offsets.get(event.id);
    if (!values) {
      values = repository.listEventNotificationsForEvent(userId, event.id).then((rows) => rows.map((row) => row.offsetMinutes));
      offsets.set(event.id, values);
    }
    return { ...event, notifications: await values };
  }));
};

const authChangePassword = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  const details: Record<string, string> = {};
  if (!currentPassword) details.currentPassword = "現在のパスワードを入力してください。";
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) details.newPassword = `パスワードは${PASSWORD_MIN_LENGTH}〜${PASSWORD_MAX_LENGTH}文字で入力してください。`;
  if (newPassword !== confirmation) details.confirmation = "新しいパスワードが一致しません。";
  if (Object.keys(details).length > 0) throw validationError(details);
  await new AuthService(env.DB).changePassword(user.id, currentPassword, newPassword);
  return json({ changed: true });
});

type PushBindings = { WEB_PUSH_VAPID_PUBLIC_KEY?: string; WEB_PUSH_VAPID_PRIVATE_KEY?: string; WEB_PUSH_SUBJECT?: string };
const pushBindings = (env: Env) => env as Env & PushBindings;
const notificationOffsets = (value: unknown): number[] => {
  if (!Array.isArray(value)) throw validationError({ notifications: "通知設定が不正です。" });
  const offsets = [...new Set(value as unknown[])];
  if (offsets.some((offset) => typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 525600)) throw validationError({ notifications: "通知時刻が不正です。" });
  return (offsets as number[]).sort((left, right) => right - left);
};
const subscriptionBody = async (request: Request) => {
  const body = await parseObject(request);
  const endpoint = stringValue(body.endpoint);
  const keys = body.keys && typeof body.keys === "object" && !Array.isArray(body.keys) ? body.keys as Record<string, unknown> : {};
  const p256dh = stringValue(keys.p256dh);
  const auth = stringValue(keys.auth);
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw validationError({ endpoint: "Push endpointが不正です。" }); }
  if (parsed.protocol !== "https:" || endpoint.length > 2048) throw validationError({ endpoint: "Push endpointはHTTPSで指定してください。" });
  if (!/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth) || p256dh.length > 512 || auth.length > 512) throw validationError({ subscription: "Push subscriptionの鍵が不正です。" });
  return { endpoint, p256dh, auth };
};

const getVapidPublicKey = requireAuth(({ env }) => {
  const publicKey = pushBindings(env).WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) throw new AppError("PUSH_CONFIG_UNAVAILABLE", 503, "通知の設定が利用できません。");
  return Promise.resolve(json({ publicKey }));
});
const registerSubscription = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const input = await subscriptionBody(request);
  await new PushSubscriptionRepository(env.DB).upsert({ id: crypto.randomUUID(), user_id: user.id, endpoint: input.endpoint, endpoint_hash: await sha256Hex(input.endpoint), p256dh: input.p256dh, auth: input.auth, now: nowIso() });
  return json({ registered: true }, { status: 201 });
});
const unregisterSubscription = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const endpoint = stringValue(body.endpoint);
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw validationError({ endpoint: "Push endpointが不正です。" }); }
  if (parsed.protocol !== "https:") throw validationError({ endpoint: "Push endpointはHTTPSで指定してください。" });
  await new PushSubscriptionRepository(env.DB).delete(user.id, endpoint);
  return json({ removed: true });
});
const getNotificationTemplates = requireAuth(({ env, user }) => new NotificationRepository(env.DB).listTemplates(user.id).then((templates) => json({ templates })));
const createNotificationTemplate = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const name = stringValue(body.name);
  if (!name || name.length > 80) throw validationError({ name: "テンプレート名を入力してください。" });
  const offsets = notificationOffsets(body.offsets ?? []);
  const targetCategory = body.targetCategory === null || body.targetCategory === undefined ? null : body.targetCategory === "home" || body.targetCategory === "work" ? body.targetCategory : (() => { throw validationError({ targetCategory: "カテゴリが不正です。" }); })();
  if (body.isDefault !== undefined && typeof body.isDefault !== "boolean") throw validationError({ isDefault: "デフォルト設定が不正です。" });
  const template = await new NotificationRepository(env.DB).createTemplate(user.id, name, targetCategory, body.isDefault === true, offsets, nowIso());
  return json({ template }, { status: 201 });
});
const updateNotificationTemplate = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const body = await parseObject(request);
  const input: { name?: string; targetCategory?: "home" | "work" | null; isDefault?: boolean; offsets?: number[] } = {};
  if (body.name !== undefined) { const name = stringValue(body.name); if (!name || name.length > 80) throw validationError({ name: "テンプレート名を入力してください。" }); input.name = name; }
  if (body.offsets !== undefined) input.offsets = notificationOffsets(body.offsets);
  if (body.isDefault !== undefined) { if (typeof body.isDefault !== "boolean") throw validationError({ isDefault: "デフォルト設定が不正です。" }); input.isDefault = body.isDefault; }
  if (body.targetCategory !== undefined) { if (body.targetCategory !== null && body.targetCategory !== "home" && body.targetCategory !== "work") throw validationError({ targetCategory: "カテゴリが不正です。" }); input.targetCategory = body.targetCategory; }
  const template = await new NotificationRepository(env.DB).updateTemplate(user.id, id, input, nowIso());
  if (!template) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  return json({ template });
});
const deleteNotificationTemplate = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  if (!await new NotificationRepository(env.DB).deleteTemplate(user.id, id)) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  return json({ deleted: true });
});

const requireDate = (value: string, field = "date") => {
  if (!isDateKey(value)) throw validationError({ [field]: "日付をYYYY-MM-DD形式で指定してください。" });
  return value;
};

const createEvent = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const event = await eventService(env).create(user.id, await parseObject(request), nowIso());
  return json({ event }, { status: 201 });
});

const listEvents = requireAuth(async ({ request, env, user }) => {
  const url = new URL(request.url);
  const startDate = stringValue(url.searchParams.get("startDate"));
  const endDate = stringValue(url.searchParams.get("endDate"));
  if (!startDate || !endDate) throw validationError({ date: "表示期間を指定してください。" });
  requireDate(startDate, "startDate");
  requireDate(endDate, "endDate");
  if (startDate > endDate) throw validationError({ date: "表示期間が不正です。" });
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  const events = await withEventNotifications(user.id, await eventProjection(env).project(user.id, { startDate, endDate }, { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn }), env.DB);
  return json({ events });
});

const getCalendar = requireAuth(async ({ request, env, user }) => {
  const month = stringValue(new URL(request.url).searchParams.get("month"));
  const range = monthKeyToGridRange(month);
  if (!range) throw validationError({ month: "表示月をYYYY-MM形式で指定してください。" });
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  const [events, money] = await Promise.all([
    withEventNotifications(user.id, await eventProjection(env).project(user.id, range, { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn }), env.DB),
    moneyService(env).projectMonth(user.id, month, settings.weekStartsOn, new Date(), settings.timezone)
  ]);
  return json({ month, range, events, money });
});

const getDaily = requireAuth(async ({ request, env, user }) => {
  const date = requireDate(stringValue(new URL(request.url).searchParams.get("date")));
  const [dailyNote, settings] = await Promise.all([
    new DailyNoteRepository(env.DB).getByDate(user.id, date),
    new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE)
  ]);
  const [projectedEvents, money] = await Promise.all([
    withEventNotifications(user.id, await eventProjection(env).project(user.id, dayToRange(date), { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn }), env.DB),
    moneyService(env).projectDate(user.id, date, settings.weekStartsOn, new Date(), settings.timezone)
  ]);
  const dailyEvents = [...new Map(projectedEvents.map((event) => [event.occurrenceKey ?? event.id, event])).values()];
  return json({ date, events: dailyEvents, dailyNote, money });
});

const getMoneyCategories = requireAuth(async ({ request, env, user }) => {
  const service = moneyService(env);
  await service.ensureCategories(user.id, nowIso());
  const url = new URL(request.url);
  const typeValue = stringValue(url.searchParams.get("type"));
  const type = typeValue === "expense" || typeValue === "income" ? typeValue : undefined;
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  return json({ categories: await new MoneyCategoryRepository(env.DB).list(user.id, type, includeInactive) });
});

const createMoneyCategory = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const body = await parseObject(request);
  const type = body.type === "expense" || body.type === "income" ? body.type : null;
  const name = stringValue(body.name);
  const colorKey = body.colorKey === null || body.colorKey === undefined ? null : stringValue(body.colorKey);
  const sortOrder = body.sortOrder === undefined ? 99 : Number(body.sortOrder);
  if (!type || !name || name.length > 40 || !Number.isInteger(sortOrder) || sortOrder < 0 || (colorKey !== null && !isMoneyCategoryColorKey(colorKey))) throw validationError({ category: "カテゴリの入力が不正です。" });
  const category = await new MoneyCategoryRepository(env.DB).create(user.id, { type, name, colorKey, sortOrder }, nowIso());
  return json({ category }, { status: 201 });
});

const updateMoneyCategory = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const body = await parseObject(request); const input: { name?: string; colorKey?: string | null; sortOrder?: number } = {};
  if (body.name !== undefined) { const name = stringValue(body.name); if (!name || name.length > 40) throw validationError({ name: "カテゴリ名を入力してください。" }); input.name = name; }
  if (body.colorKey !== undefined) { if (body.colorKey !== null && !isMoneyCategoryColorKey(stringValue(body.colorKey))) throw validationError({ colorKey: "色を選択してください。" }); input.colorKey = body.colorKey === null ? null : stringValue(body.colorKey); }
  if (body.sortOrder !== undefined) { if (!Number.isInteger(body.sortOrder) || Number(body.sortOrder) < 0) throw validationError({ sortOrder: "並び順が不正です。" }); input.sortOrder = Number(body.sortOrder); }
  const category = await new MoneyCategoryRepository(env.DB).update(user.id, id, input, nowIso());
  if (!category) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  return json({ category });
});

const deleteMoneyCategory = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  if (!await new MoneyCategoryRepository(env.DB).deactivate(user.id, id, nowIso())) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  return json({ deleted: true });
});

const getMoneyMonth = requireAuth(async ({ request, env, user }) => {
  const month = stringValue(new URL(request.url).searchParams.get("month"));
  await moneyService(env).ensureCategories(user.id, nowIso());
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  return json(await moneyService(env).projectMonth(user.id, month, settings.weekStartsOn, new Date(), settings.timezone));
});

const getMoneyYear = requireAuth(async ({ request, env, user }) => {
  const rawYear = stringValue(new URL(request.url).searchParams.get("year"));
  const year = Number(rawYear);
  if (!/^\d{4}$/.test(rawYear) || !Number.isInteger(year) || year < 1 || year > 9999) throw validationError({ year: "表示年をYYYY形式で指定してください。" });
  await moneyService(env).ensureCategories(user.id, nowIso());
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  return json(await moneyService(env).projectYear(user.id, year, settings.weekStartsOn, new Date(), settings.timezone));
});

const listRecentMoneyDefinitions = requireAuth(async ({ request, env, user }) => {
  const parsedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 20;
  await moneyService(env).ensureCategories(user.id, nowIso());
  return json({ definitions: await moneyService(env).recentDefinitions(user.id, limit) });
});

const searchMoneyReuseCandidates = requireAuth(async ({ request, env, user }) => {
  const url = new URL(request.url);
  const query = stringValue(url.searchParams.get("q")).trim();
  const parsedLimit = Number(url.searchParams.get("limit") ?? (query.length >= 2 ? "50" : "8"));
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : query.length >= 2 ? 50 : 8;
  await moneyService(env).ensureCategories(user.id, nowIso());
  const definitions = query.length >= 2 ? await moneyService(env).searchDefinitions(user.id, query, limit) : query.length === 0 ? await moneyService(env).recentDefinitions(user.id, limit) : [];
  return json({ definitions });
});

const createMoney = requireAuth(async ({ request, env, user }) => { await requireWritableUserState({ request, env, user }); const money = await moneyService(env).create(user.id, await parseObject(request), nowIso()); return json({ money }, { status: 201 }); });
const getMoney = requireAuth(async ({ request, env, user }) => { const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? ""); const item = await moneyService(env).get(user.id, id); if (!item) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。"); const category = await new MoneyCategoryRepository(env.DB).getById(user.id, item.categoryId); return json({ money: { ...item, category } }); });
const updateMoney = requireAuth(async ({ request, env, user }) => { await requireWritableUserState({ request, env, user }); const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? ""); const money = await moneyService(env).update(user.id, id, await parseObject(request), nowIso()); if (!money) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。"); return json({ money }); });
const deleteMoney = requireAuth(async ({ request, env, user }) => { await requireWritableUserState({ request, env, user }); const url = new URL(request.url); const id = decodeURIComponent(url.pathname.split("/").pop() ?? ""); await moneyService(env).delete(user.id, id, { scope: stringValue(url.searchParams.get("scope")) as "occurrence" | "following" | "series" | undefined, occurrenceKey: url.searchParams.get("occurrenceKey") ?? undefined }, nowIso()); return json({ deleted: true }); });
const putMoneyActual = requireAuth(async ({ request, env, user }) => { await requireWritableUserState({ request, env, user }); const match = new URL(request.url).pathname.match(/^\/api\/money\/([^/]+)\/occurrences\/([^/]+)\/actual$/); if (!match) throw notFoundError(); const body = await parseObject(request); const amount = body.amount; if (!Number.isInteger(amount) || Number(amount) <= 0) throw validationError({ amount: "実際の金額は1円以上の整数で入力してください。" }); const settlement = await moneyService(env).setActual(user.id, decodeURIComponent(match[1]), decodeURIComponent(match[2]), Number(amount), nowIso()); return json({ settlement }); });
const deleteMoneyActual = requireAuth(async ({ request, env, user }) => { await requireWritableUserState({ request, env, user }); const match = new URL(request.url).pathname.match(/^\/api\/money\/([^/]+)\/occurrences\/([^/]+)\/actual$/); if (!match) throw notFoundError(); await moneyService(env).deleteActual(user.id, decodeURIComponent(match[1]), decodeURIComponent(match[2]), nowIso()); return json({ deleted: true }); });

const putDailyNote = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const date = requireDate(decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? ""));
  const body = await parseObject(request);
  if (typeof body.content !== "string" || body.content.length > 10000) throw validationError({ content: "メモは10000文字以内で入力してください。" });
  const repository = new DailyNoteRepository(env.DB);
  if (!body.content.trim()) {
    await repository.deleteByDate(user.id, date);
    return json({ dailyNote: null });
  }
  const dailyNote = await repository.upsert(user.id, date, body.content, nowIso());
  return json({ dailyNote });
});

const deleteDailyNote = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const date = requireDate(decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? ""));
  await new DailyNoteRepository(env.DB).deleteByDate(user.id, date);
  return json({ dailyNote: null });
});

const listRecentEventDefinitions = requireAuth(async ({ request, env, user }) => {
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 20;
  const events = await new EventRepository(env.DB).recentDefinitions(user.id, limit);
  const recurrenceRepository = new RecurrenceRepository(env.DB);
  const notificationRepository = new NotificationRepository(env.DB);
  const enrichedEvents = await Promise.all(events.map(async (event) => ({ ...event, recurrence: event.recurrenceRuleId ? await recurrenceRepository.getById(user.id, event.recurrenceRuleId) : null, notifications: (await notificationRepository.listEventNotificationsForEvent(user.id, event.id)).map((notification) => notification.offsetMinutes) })));
  return json({ events: enrichedEvents });
});

const searchCalendarEvents = requireAuth(async ({ request, env, user }) => {
  const url = new URL(request.url);
  const query = stringValue(url.searchParams.get("q"));
  const parsedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 50;
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  const service = new EventProjectionService(new EventRepository(env.DB), new RecurrenceRepository(env.DB), new EventOccurrenceOverrideRepository(env.DB));
  return json({ events: await service.search(user.id, query, { limit, timezone: settings.timezone, weekStartsOn: settings.weekStartsOn }) });
});

const searchEventReuseCandidates = requireAuth(async ({ request, env, user }) => {
  const url = new URL(request.url);
  const query = stringValue(url.searchParams.get("q")).trim();
  const category = stringValue(url.searchParams.get("category"));
  if (category !== "home" && category !== "work") throw validationError({ category: "カテゴリを指定してください。" });
  const parsedLimit = Number(url.searchParams.get("limit") ?? (query.length >= 2 ? "50" : "8"));
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : query.length >= 2 ? 50 : 8;
  const repository = new EventRepository(env.DB);
  const events = query.length >= 2 ? await repository.searchDefinitions(user.id, query, limit, category) : query.length === 0 ? await repository.recentDefinitions(user.id, limit, category) : [];
  const recurrenceRepository = new RecurrenceRepository(env.DB);
  const notificationRepository = new NotificationRepository(env.DB);
  const enrichedEvents = await Promise.all(events.map(async (event) => ({ ...event, recurrence: event.recurrenceRuleId ? await recurrenceRepository.getById(user.id, event.recurrenceRuleId) : null, notifications: (await notificationRepository.listEventNotificationsForEvent(user.id, event.id)).map((notification) => notification.offsetMinutes) })));
  return json({ events: enrichedEvents });
});

const getEvent = requireAuth(async ({ env, user, request }) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const event = await new EventRepository(env.DB).getById(user.id, id);
  if (!event) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  const recurrence = event.recurrenceRuleId ? await new RecurrenceRepository(env.DB).getById(user.id, event.recurrenceRuleId) : null;
  const notifications = await new NotificationRepository(env.DB).listEventNotificationsForEvent(user.id, event.id);
  return json({ event: { ...event, recurrence, notifications: notifications.map((notification) => notification.offsetMinutes) } });
});

const updateEvent = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const event = await eventService(env).update(user.id, id, await parseObject(request), nowIso());
  return json({ event });
});

const deleteEvent = requireAuth(async ({ request, env, user }) => {
  await requireWritableUserState({ request, env, user });
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const url = new URL(request.url);
  const scope = stringValue(url.searchParams.get("scope")) as "occurrence" | "following" | "series" | "";
  const occurrenceKey = url.searchParams.get("occurrenceKey") ?? undefined;
  await eventService(env).delete(user.id, id, { scope: scope || undefined, occurrenceKey }, nowIso());
  return json({ deleted: true });
});

const backfillNotificationJobs = requireAuth(async ({ env, user, request }) => {
  if (env.APP_ENV !== "staging") return json({ error: { code: "NOT_FOUND", message: "対象が見つかりません。" } }, { status: 404 });
  await requireWritableUserState({ request, env, user });
  const result = await new NotificationJobService(env.DB).backfillForUser(user.id, new Date());
  return json({ backfill: result });
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const context: RequestContext = { request, env };
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, app: "LifeHub", environment: env.APP_ENV ?? "local" });
      if (url.pathname === "/api/auth/register" && request.method === "POST") return await authRegister(context);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return await authLogin(context);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return await authLogout(context);
      if (url.pathname === "/api/auth/password" && request.method === "POST") return await authChangePassword(context);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return await authMe(context);
      if (url.pathname === "/api/settings" && request.method === "GET") return await getSettings(context);
      if (url.pathname === "/api/settings" && request.method === "PATCH") return await patchSettings(context);
      if (url.pathname === "/api/money-categories" && request.method === "GET") return await getMoneyCategories(context);
      if (url.pathname === "/api/money-categories" && request.method === "POST") return await createMoneyCategory(context);
      const moneyCategoryPath = url.pathname.match(/^\/api\/money-categories\/([^/]+)$/);
      if (moneyCategoryPath && request.method === "PATCH") return await updateMoneyCategory(context);
      if (moneyCategoryPath && request.method === "DELETE") return await deleteMoneyCategory(context);
      if (url.pathname === "/api/notifications/vapid-public-key" && request.method === "GET") return await getVapidPublicKey(context);
      if (url.pathname === "/api/notifications/subscriptions" && request.method === "POST") return await registerSubscription(context);
      if (url.pathname === "/api/notifications/subscriptions" && request.method === "DELETE") return await unregisterSubscription(context);
      if (url.pathname === "/api/notifications/jobs/backfill" && request.method === "POST") return await backfillNotificationJobs(context);
      if (url.pathname === "/api/notification-templates" && request.method === "GET") return await getNotificationTemplates(context);
      if (url.pathname === "/api/notification-templates" && request.method === "POST") return await createNotificationTemplate(context);
      const notificationTemplatePath = url.pathname.match(/^\/api\/notification-templates\/([^/]+)$/);
      if (notificationTemplatePath && request.method === "PATCH") return await updateNotificationTemplate(context);
      if (notificationTemplatePath && request.method === "DELETE") return await deleteNotificationTemplate(context);
      if (url.pathname === "/api/user-state" && request.method === "GET") return await getUserState(context);
      if (url.pathname === "/api/backup/export" && request.method === "GET") return await getBackupExport(context);
      if (url.pathname === "/api/migration/status" && request.method === "GET") return await getMigrationStatus(context);
      if (url.pathname === "/api/migration/start" && request.method === "POST") return await startMigration(context);
      if (url.pathname === "/api/migration/restore" && request.method === "POST") return await restoreMigration(context);
      if (url.pathname === "/api/migration/verify" && request.method === "POST") return await verifyMigration(context);
      if (url.pathname === "/api/migration/complete" && request.method === "POST") return await completeMigration(context);
      if (url.pathname === "/api/migration/cancel" && request.method === "POST") return await cancelMigration(context);
      if (url.pathname === "/api/archive/candidates" && request.method === "GET") return await getArchiveCandidates(context);
      if (url.pathname === "/api/archive/confirm" && request.method === "POST") return await confirmArchive(context);
      if (url.pathname === "/api/calendar" && request.method === "GET") return await getCalendar(context);
      if (url.pathname === "/api/daily" && request.method === "GET") return await getDaily(context);
      if (url.pathname === "/api/money/month" && request.method === "GET") return await getMoneyMonth(context);
      if (url.pathname === "/api/money/year-summary" && request.method === "GET") return await getMoneyYear(context);
      if (url.pathname === "/api/money" && request.method === "POST") return await createMoney(context);
      if (url.pathname === "/api/money/recent-definitions" && request.method === "GET") return await listRecentMoneyDefinitions(context);
      if (url.pathname === "/api/money/reuse-search" && request.method === "GET") return await searchMoneyReuseCandidates(context);
      const moneyActualPath = url.pathname.match(/^\/api\/money\/([^/]+)\/occurrences\/([^/]+)\/actual$/);
      if (moneyActualPath && request.method === "PUT") return await putMoneyActual(context);
      if (moneyActualPath && request.method === "DELETE") return await deleteMoneyActual(context);
      const moneyPath = url.pathname.match(/^\/api\/money\/([^/]+)$/);
      if (moneyPath && request.method === "GET") return await getMoney(context);
      if (moneyPath && request.method === "PATCH") return await updateMoney(context);
      if (moneyPath && request.method === "DELETE") return await deleteMoney(context);
      const dailyNotePath = url.pathname.match(/^\/api\/daily-notes\/([^/]+)$/);
      if (dailyNotePath && request.method === "PUT") return await putDailyNote(context);
      if (dailyNotePath && request.method === "DELETE") return await deleteDailyNote(context);
      if (url.pathname === "/api/events" && request.method === "GET") return await listEvents(context);
      if (url.pathname === "/api/events" && request.method === "POST") return await createEvent(context);
      if (url.pathname === "/api/events/recent-definitions" && request.method === "GET") return await listRecentEventDefinitions(context);
      if (url.pathname === "/api/events/search" && request.method === "GET") return await searchCalendarEvents(context);
      if (url.pathname === "/api/events/reuse-search" && request.method === "GET") return await searchEventReuseCandidates(context);
      const eventIdPath = url.pathname.match(/^\/api\/events\/([^/]+)$/);
      if (eventIdPath && request.method === "GET") return await getEvent(context);
      if (eventIdPath && request.method === "PATCH") return await updateEvent(context);
      if (eventIdPath && request.method === "DELETE") return await deleteEvent(context);
      if (url.pathname.startsWith("/api/")) return json({ error: { code: "NOT_FOUND", message: "対象が見つかりません。" } }, { status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof AppError) return json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
      console.error("lifehub_worker_error", error);
      return json({ error: { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました。" } }, { status: 500 });
    }
  },
  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    const at = new Date(controller.scheduledTime);
    if (controller.cron === "*/5 * * * *") {
      context.waitUntil(runNotificationScheduler(env, at));
      return;
    }
    if (controller.cron === "2 15 * * *") {
      context.waitUntil(runMoneySettlement(env, at));
      context.waitUntil(runNotificationJobRefill(env, at));
    }
  }
};
