import { createExpiredSessionCookie, createSessionCookie } from "./lib/cookies";
import { DEFAULT_TIMEZONE, DISPLAY_NAME_MAX_LENGTH, EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./lib/constants";
import { AppError, validationError } from "./lib/errors";
import { requireAuth, type Handler, type RequestContext } from "./middleware/auth";
import { requireWritableUserState } from "./middleware/migration-guard";
import { SettingsRepository } from "./repositories/settings-repository";
import { EventRepository } from "./repositories/event-repository";
import { EventOccurrenceOverrideRepository } from "./repositories/event-occurrence-override-repository";
import { RecurrenceRepository } from "./repositories/recurrence-repository";
import { DailyNoteRepository } from "./repositories/daily-note-repository";
import { UserStateRepository } from "./repositories/user-state-repository";
import { AuthService } from "./services/auth-service";
import { EventService } from "./services/event-service";
import { EventProjectionService, dayToRange, isDateKey, monthKeyToGridRange } from "./services/event-projection-service";
import type { UserSettings } from "./types";

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
  return json({ user: result.user }, { status: 201, headers: { "set-cookie": createSessionCookie(result.token, env.APP_ENV) } });
};

const authLogin: Handler = async ({ request, env }) => {
  const input = validateCredentials(await parseObject(request), false);
  const result = await new AuthService(env.DB).login(input.email, input.password);
  const now = nowIso();
  await new UserStateRepository(env.DB).getOrCreate(result.user.id, now);
  await new SettingsRepository(env.DB).getOrCreate(result.user.id, now, DEFAULT_TIMEZONE);
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
  if (Object.keys(details).length > 0) throw validationError(details);
  const settings = await new SettingsRepository(env.DB).update(user.id, input, nowIso());
  return json({ settings });
});

const getUserState = requireAuth(async ({ env, user }) => {
  const state = await new UserStateRepository(env.DB).getOrCreate(user.id, nowIso());
  return json({ state });
});

const eventProjection = (env: Env) => new EventProjectionService(new EventRepository(env.DB), new RecurrenceRepository(env.DB), new EventOccurrenceOverrideRepository(env.DB));
const eventService = (env: Env) => new EventService(new EventRepository(env.DB), new RecurrenceRepository(env.DB), new EventOccurrenceOverrideRepository(env.DB), eventProjection(env));

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
  const events = await eventProjection(env).project(user.id, { startDate, endDate }, { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn });
  return json({ events });
});

const getCalendar = requireAuth(async ({ request, env, user }) => {
  const month = stringValue(new URL(request.url).searchParams.get("month"));
  const range = monthKeyToGridRange(month);
  if (!range) throw validationError({ month: "表示月をYYYY-MM形式で指定してください。" });
  const settings = await new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE);
  const events = await eventProjection(env).project(user.id, range, { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn });
  return json({ month, range, events });
});

const getDaily = requireAuth(async ({ request, env, user }) => {
  const date = requireDate(stringValue(new URL(request.url).searchParams.get("date")));
  const [dailyNote, settings] = await Promise.all([
    new DailyNoteRepository(env.DB).getByDate(user.id, date),
    new SettingsRepository(env.DB).getOrCreate(user.id, nowIso(), DEFAULT_TIMEZONE)
  ]);
  const projectedEvents = await eventProjection(env).project(user.id, dayToRange(date), { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn });
  const dailyEvents = [...new Map(projectedEvents.map((event) => [event.occurrenceKey ?? event.id, event])).values()];
  return json({ date, events: dailyEvents, dailyNote });
});

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
  const enrichedEvents = await Promise.all(events.map(async (event) => ({ ...event, recurrence: event.recurrenceRuleId ? await recurrenceRepository.getById(user.id, event.recurrenceRuleId) : null })));
  return json({ events: enrichedEvents });
});

const getEvent = requireAuth(async ({ env, user, request }) => {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const event = await new EventRepository(env.DB).getById(user.id, id);
  if (!event) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
  const recurrence = event.recurrenceRuleId ? await new RecurrenceRepository(env.DB).getById(user.id, event.recurrenceRuleId) : null;
  return json({ event: { ...event, recurrence } });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const context: RequestContext = { request, env };
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, app: "LifeHub", environment: env.APP_ENV ?? "local" });
      if (url.pathname === "/api/auth/register" && request.method === "POST") return await authRegister(context);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return await authLogin(context);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return await authLogout(context);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return await authMe(context);
      if (url.pathname === "/api/settings" && request.method === "GET") return await getSettings(context);
      if (url.pathname === "/api/settings" && request.method === "PATCH") return await patchSettings(context);
      if (url.pathname === "/api/user-state" && request.method === "GET") return await getUserState(context);
      if (url.pathname === "/api/calendar" && request.method === "GET") return await getCalendar(context);
      if (url.pathname === "/api/daily" && request.method === "GET") return await getDaily(context);
      const dailyNotePath = url.pathname.match(/^\/api\/daily-notes\/([^/]+)$/);
      if (dailyNotePath && request.method === "PUT") return await putDailyNote(context);
      if (dailyNotePath && request.method === "DELETE") return await deleteDailyNote(context);
      if (url.pathname === "/api/events" && request.method === "GET") return await listEvents(context);
      if (url.pathname === "/api/events" && request.method === "POST") return await createEvent(context);
      if (url.pathname === "/api/events/recent-definitions" && request.method === "GET") return await listRecentEventDefinitions(context);
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
  }
};
