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
