import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allocateCalendarCellRows, App } from "./App";

const user = { id: "user-1", email: "me@example.com", displayName: "自分" };
const settings = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestPath = (input: RequestInfo | URL) => typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
const projectedEvent = (id: string) => ({ category: "home" as const, day: 1, date: "2026-09-01", eventId: id, kind: "single" as const, label: id });

describe("LifeHub M2 shell", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/calendar");
    vi.restoreAllMocks();
  });

  it("shows the login screen when there is no session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { message: "認証が必要です。" } }, 401));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "メールアドレス" })).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  });

  it("restores a session and navigates between shells", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ user }));
      if (path.endsWith("/api/settings")) return Promise.resolve(response({ settings }));
      return Promise.resolve(response({}));
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "カレンダー" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "デイリー" }));
    expect(screen.getByRole("heading", { name: "デイリー" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "お金" }));
    expect(screen.getByRole("heading", { name: "お金" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    expect(screen.getByRole("heading", { name: /^設定$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "カレンダーを開く" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "カレンダーを開く" }));
    expect(screen.getByRole("heading", { name: /^カレンダー$/ })).toBeInTheDocument();
    expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
  });

  it("opens the add choice sheet and handles login failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ user }));
      if (path.endsWith("/api/settings")) return Promise.resolve(response({ settings }));
      return Promise.resolve(response({ error: { message: "メールアドレスまたはパスワードが正しくありません。" } }, 401));
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "カレンダー" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(screen.getByRole("dialog", { name: "追加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "家を追加" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "家を追加" }));
    expect(await screen.findByRole("heading", { name: "予定を追加" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("opens calendar date details and the search placeholder", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ user }));
      if (path.endsWith("/api/settings")) return Promise.resolve(response({ settings }));
      return Promise.resolve(response({}));
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /^カレンダー$/ })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /\d+日$/ })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "当日に追加" }));
    expect(screen.getByRole("menu", { name: "この日に追加" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("menu", { name: "この日に追加" })).getByRole("menuitem", { name: "家" }));
    expect(await screen.findByRole("heading", { name: "予定を追加" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "予定一覧へ戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    expect(screen.getByRole("dialog", { name: "検索" })).toBeInTheDocument();
    expect(screen.getByText("検索は後のMilestoneで追加します。")).toBeInTheDocument();
  });

  it("shows login failure from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ error: { message: "認証が必要です。" } }, 401));
      return Promise.resolve(response({ error: { message: "ログインできません。" } }, 401));
    });
    render(<App />);
    await screen.findByRole("heading", { name: "ログイン" });
    fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "invalid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ログインできません。"));
  });
});

describe("Calendar four-row allocation", () => {
  it("shares rows across bands and single-day events", () => {
    expect(allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b")], 2, null, 4)).toMatchObject({ hiddenCount: 0, visibleEvents: [{ eventId: "a" }, { eventId: "b" }], visibleMoney: false });
    expect(allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b"), projectedEvent("c")], 2, null, 4).hiddenCount).toBe(1);
  });

  it("keeps money in the final row and counts mixed overflow", () => {
    const money = { amount: "-1,500円", kind: "expense" as const, label: "食費" };
    const mixed = allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b"), projectedEvent("c")], 1, money, 4);
    expect(mixed.hiddenCount).toBe(1);
    expect(mixed.visibleEvents).toHaveLength(2);
    expect(mixed.visibleMoney).toBe(true);
    const fourEventsAndMoney = allocateCalendarCellRows(["a", "b", "c", "d"].map(projectedEvent), 0, money, 4);
    expect(fourEventsAndMoney.hiddenCount).toBe(1);
    expect(fourEventsAndMoney.visibleEvents).toHaveLength(3);
    expect(fourEventsAndMoney.visibleMoney).toBe(true);
    expect(allocateCalendarCellRows([], 3, money, 4)).toMatchObject({ hiddenCount: 0, visibleEvents: [], visibleMoney: true });
  });
});
