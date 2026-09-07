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
  timingType: "scheduled";
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledEventInput = Pick<Event, "category" | "title" | "place" | "memo" | "timingType" | "allDay" | "startDate" | "startTime" | "endDate" | "endTime">;

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

export const apiErrorStatus = (error: unknown) => error instanceof ApiError ? error.status : null;

export const authMe = () => request<{ user: AuthUser }>("/api/auth/me");
export const login = (email: string, password: string) => request<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (displayName: string, email: string, password: string) => request<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ displayName, email, password }) });
export const logout = () => request<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
export const getSettings = () => request<{ settings: UserSettings }>("/api/settings");
export const getEvents = (startDate: string, endDate: string) => request<{ events: Event[] }>(`/api/events?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
export const getEvent = (id: string) => request<{ event: Event }>(`/api/events/${encodeURIComponent(id)}`);
export const getRecentEventDefinitions = (limit = 20) => request<{ events: Event[] }>(`/api/events/recent-definitions?limit=${limit}`);
export const createEvent = (input: ScheduledEventInput) => request<{ event: Event }>("/api/events", { method: "POST", body: JSON.stringify(input) });
export const updateEvent = (id: string, input: ScheduledEventInput) => request<{ event: Event }>(`/api/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteEvent = (id: string) => request<{ deleted: boolean }>(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
