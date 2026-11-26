import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const user = { id: "user-1", email: "me@example.com", displayName: "自分" };
const settings = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestPath = (input: RequestInfo | URL) => typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

const mockFetch = (overrides: Record<string, () => Promise<Response>> = {}) => {
  const calls: Array<{ path: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = requestPath(input);
    calls.push({ path, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    for (const [suffix, handler] of Object.entries(overrides)) if (path.endsWith(suffix)) return handler();
    if (path.endsWith("/api/auth/me")) return response({ error: { message: "認証が必要です。" } }, 401);
    if (path.endsWith("/api/settings")) return response({ settings });
    if (path.endsWith("/api/user-state")) return response({ state: { migrationState: "active" } });
    return response({});
  });
  return calls;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  window.history.pushState({}, "", "/calendar");
});

describe("password reset UI", () => {
  it("requests a reset link from the login page and confirms neutrally", async () => {
    window.history.pushState({}, "", "/");
    const calls = mockFetch({ "/api/auth/password-reset/request": () => Promise.resolve(response({ accepted: true }, 202)) });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "パスワードを忘れた場合" }));
    expect(screen.getByRole("heading", { name: "パスワードの再設定" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), { target: { value: "me@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定リンクを送る" }));

    expect(await screen.findByText(/再設定用のリンクを送信しました/)).toBeInTheDocument();
    const requestCall = calls.find((call) => call.path.endsWith("/api/auth/password-reset/request"));
    expect(requestCall?.body).toEqual({ email: "me@example.com" });
  });

  it("sets a new password from the emailed link and enters the app", async () => {
    window.history.pushState({}, "", "/password-reset?token=reset-token-1");
    const calls = mockFetch({ "/api/auth/password-reset/confirm": () => Promise.resolve(response({ user })) });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "新しいパスワードを設定" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-456" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), { target: { value: "new-password-456" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを設定する" }));

    expect(await screen.findByRole("heading", { name: "カレンダー" })).toBeInTheDocument();
    const confirmCall = calls.find((call) => call.path.endsWith("/api/auth/password-reset/confirm"));
    expect(confirmCall?.body).toEqual({ token: "reset-token-1", password: "new-password-456" });
  });

  it("rejects a mismatched confirmation before calling the API", async () => {
    window.history.pushState({}, "", "/password-reset?token=reset-token-1");
    const calls = mockFetch({ "/api/auth/password-reset/confirm": () => Promise.resolve(response({ user })) });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "新しいパスワードを設定" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-456" } });
    fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), { target: { value: "different-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "パスワードを設定する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("確認用パスワードが一致しません。");
    expect(calls.some((call) => call.path.endsWith("/api/auth/password-reset/confirm"))).toBe(false);
  });

  it("explains the next step when the reset link has no token", async () => {
    window.history.pushState({}, "", "/password-reset");
    mockFetch();
    render(<App />);
    expect(await screen.findByText(/再設定リンクが無効です/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "パスワードを設定する" })).not.toBeInTheDocument();
  });
});
