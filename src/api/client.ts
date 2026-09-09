export type AuthUser = { id: string; email: string; displayName: string };
export type UserSettings = {
  userId: string;
  timezone: string;
  weekStartsOn: number;
  morningSummaryEnabled: boolean;
  morningSummaryTime: string;
  eveningSummaryEnabled: boolean;
  eveningSummaryTime: string;
  periodDefaultDeadlineTime: string;
  createdAt: string;
  updatedAt: string;
};

export type Event = {
  id: string;
  userId: string;
  category: "home" | "work";
  title: string;
  place: string | null;
  memo: string | null;
  timingType: "scheduled" | "period";
  allDay: boolean | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  periodWindowType: "this_week" | "this_month" | "custom_range" | null;
  periodAnchorDate: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  deadlineTime: string | null;
  recurrenceRuleId?: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  occurrenceKey?: string | null;
  recurrence?: RecurrenceRule | null;
  notifications?: number[];
};

export type ScheduledEventInput = Pick<Event, "category" | "title" | "place" | "memo" | "timingType" | "allDay" | "startDate" | "startTime" | "endDate" | "endTime">;
export type PeriodEventInput = Pick<Event, "category" | "title" | "place" | "memo" | "timingType" | "allDay" | "startDate" | "startTime" | "endDate" | "endTime" | "periodWindowType" | "periodAnchorDate" | "periodStartDate" | "periodEndDate" | "deadlineTime">;
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
export type RecurrenceRule = { id: string; userId: string; frequency: RecurrenceFrequency; interval: number; weekdays: number[] | null; dayOfMonth: number | null; startsOn: string; endsOn: string | null; createdAt: string; updatedAt: string };
export type RecurrenceRuleInput = Pick<RecurrenceRule, "frequency" | "interval" | "weekdays" | "dayOfMonth" | "startsOn" | "endsOn">;
export type EventScope = "occurrence" | "following" | "series";
export type EventCommandInput = Partial<ScheduledEventInput & PeriodEventInput> & { recurrence?: RecurrenceRuleInput | null; notifications?: number[]; scope?: EventScope; occurrenceKey?: string };
export type DailyNote = { id: string; userId: string; date: string; content: string; createdAt: string; updatedAt: string };
export type CalendarRange = { startDate: string; endDate: string };
export type MoneyType = "expense" | "income";
export type MoneyCategory = { id: string; userId: string; type: MoneyType; name: string; colorKey: string | null; sortOrder: number; active: boolean; createdAt: string; updatedAt: string };
export type MoneyItem = { id: string; userId: string; type: MoneyType; title: string; categoryId: string; plannedAmount: number; date: string; time: null; recurrenceRuleId: string | null; memo: string | null; active: boolean; deletedAt: string | null; createdAt: string; updatedAt: string; category?: MoneyCategory | null; signedAmount?: number; occurrenceKey?: string | null; definitionDate?: string; recurrence?: RecurrenceRuleInput | null };
export type MoneySummary = { expenseForecast: number; incomeForecast: number; remaining: number };
export type MoneyDay = MoneySummary & { date: string };
export type MoneyProjection = { occurrences: MoneyItem[]; summary: MoneySummary; days: MoneyDay[] };

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string" ? payload.error.message : "通信に失敗しました。";
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const apiRequest = request;

export const apiErrorStatus = (error: unknown) => error instanceof ApiError ? error.status : null;

export const authMe = () => request<{ user: AuthUser }>("/api/auth/me");
export const login = (email: string, password: string) => request<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (displayName: string, email: string, password: string) => request<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ displayName, email, password }) });
export const logout = () => request<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
export const getSettings = () => request<{ settings: UserSettings }>("/api/settings");
export const updateSettings = (input: Partial<UserSettings>) => request<{ settings: UserSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(input) });
export const getEvents = (startDate: string, endDate: string) => request<{ events: Event[] }>(`/api/events?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
export const getCalendar = (month: string) => request<{ month: string; range: CalendarRange; events: Event[]; money: MoneyProjection }>(`/api/calendar?month=${encodeURIComponent(month.slice(0, 7))}`);
export const getDaily = (date: string) => request<{ date: string; events: Event[]; dailyNote: DailyNote | null; money: MoneyProjection }>(`/api/daily?date=${encodeURIComponent(date)}`);
export const upsertDailyNote = (date: string, content: string) => request<{ dailyNote: DailyNote | null }>(`/api/daily-notes/${encodeURIComponent(date)}`, { method: "PUT", body: JSON.stringify({ content }) });
export const deleteDailyNote = (date: string) => request<{ dailyNote: null }>(`/api/daily-notes/${encodeURIComponent(date)}`, { method: "DELETE" });
export const getEvent = (id: string) => request<{ event: Event }>(`/api/events/${encodeURIComponent(id)}`);
export const getRecentEventDefinitions = (limit = 20) => request<{ events: Event[] }>(`/api/events/recent-definitions?limit=${limit}`);
export const createEvent = (input: EventCommandInput) => request<{ event: Event }>("/api/events", { method: "POST", body: JSON.stringify(input) });
export const updateEvent = (id: string, input: EventCommandInput) => request<{ event: Event }>(`/api/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteEvent = (id: string, scope: EventScope = "series", occurrenceKey?: string) => request<{ deleted: boolean }>(`/api/events/${encodeURIComponent(id)}?scope=${scope}${occurrenceKey ? `&occurrenceKey=${encodeURIComponent(occurrenceKey)}` : ""}`, { method: "DELETE" });
export const getMoneyCategories = (type?: MoneyType, includeInactive = false) => request<{ categories: MoneyCategory[] }>(`/api/money-categories${type || includeInactive ? `?${type ? `type=${type}` : ""}${type && includeInactive ? "&" : ""}${includeInactive ? "includeInactive=true" : ""}` : ""}`);
export const createMoneyCategory = (input: { type: MoneyType; name: string; colorKey?: string | null }) => request<{ category: MoneyCategory }>("/api/money-categories", { method: "POST", body: JSON.stringify(input) });
export const updateMoneyCategory = (id: string, input: { name?: string; colorKey?: string | null }) => request<{ category: MoneyCategory }>(`/api/money-categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteMoneyCategory = (id: string) => request<{ deleted: boolean }>(`/api/money-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getMoneyMonth = (month: string) => request<{ month: string } & MoneyProjection>(`/api/money/month?month=${encodeURIComponent(month.slice(0, 7))}`);
export const getRecentMoneyDefinitions = (limit = 20) => request<{ definitions: MoneyItem[] }>(`/api/money/recent-definitions?limit=${limit}`);
export const createMoney = (input: { type: MoneyType; title: string; plannedAmount: number; categoryId: string; date: string; memo: string | null; recurrence: RecurrenceRuleInput | null }) => request<{ money: MoneyItem }>("/api/money", { method: "POST", body: JSON.stringify(input) });
export const updateMoney = (id: string, input: Partial<{ type: MoneyType; title: string; plannedAmount: number; categoryId: string; date: string; memo: string | null; recurrence: RecurrenceRuleInput | null }>) => request<{ money: MoneyItem }>(`/api/money/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteMoney = (id: string) => request<{ deleted: boolean }>(`/api/money/${encodeURIComponent(id)}`, { method: "DELETE" });
