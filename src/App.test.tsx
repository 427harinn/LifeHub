import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allocateCalendarCellRows, App, calendarMoneyEntriesForDate, calendarMoneySummaryForDate, EventForm, formatDate, formatDateRange, recurrenceSummary, weekEnd } from "./App";
import type { Event } from "./api/client";
import { defaultEndTimeForStart } from "./lib/event-time";

const user = { id: "user-1", email: "me@example.com", displayName: "自分" };
const settings = { userId: "user-1", timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestPath = (input: RequestInfo | URL) => typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
const projectedEvent = (id: string) => ({ category: "home" as const, day: 1, date: "2026-09-01", eventId: id, kind: "single" as const, label: id });
const timedEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "event-1", userId: "user-1", category: "home", title: "予定", place: null, memo: null, timingType: "scheduled", allDay: false,
  startDate: "2026-09-10", startTime: "09:00", endDate: "2026-09-10", endTime: "10:00", periodWindowType: null, periodAnchorDate: null,
  periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: null, active: true, deletedAt: null,
  createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z", ...overrides
});

const renderEventForm = (props: Partial<Parameters<typeof EventForm>[0]> = {}) => render(<EventForm category="home" initialDate="2026-09-10" onCancel={vi.fn()} onSaved={vi.fn()} {...props} />);

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

describe("EventForm timed start defaults", () => {
  it("derives a one-hour end time and keeps it in the same day", () => {
    expect(defaultEndTimeForStart("09:00")).toBe("10:00");
    expect(defaultEndTimeForStart("14:30")).toBe("15:30");
    expect(defaultEndTimeForStart("23:30")).toBe("23:59");
  });

  it("follows start changes until the new event end is edited", () => {
    renderEventForm();
    const start = screen.getByLabelText("開始時間");
    const end = screen.getByLabelText("終了時間");

    expect(end).toHaveValue("10:00");
    fireEvent.change(start, { target: { value: "09:00" } });
    expect(end).toHaveValue("10:00");
    fireEvent.change(start, { target: { value: "14:30" } });
    expect(end).toHaveValue("15:30");
    fireEvent.change(end, { target: { value: "16:00" } });
    expect(end).toHaveValue("16:00");
    fireEvent.change(start, { target: { value: "15:00" } });
    expect(end).toHaveValue("16:00");
  });

  it("respects an existing event end time", () => {
    renderEventForm({ event: timedEvent({ startTime: "09:00", endTime: "16:00" }) });
    fireEvent.change(screen.getByLabelText("開始時間"), { target: { value: "15:00" } });
    expect(screen.getByLabelText("終了時間")).toHaveValue("16:00");
  });

  it("respects the end time copied from a recent event", async () => {
    const recent = timedEvent({ id: "recent-1", title: "コピー元", startTime: "11:00", endTime: "12:45" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ events: [recent] }));
    renderEventForm();

    fireEvent.click(screen.getByRole("button", { name: "以前の項目から選ぶ" }));
    fireEvent.click(await screen.findByRole("button", { name: /コピー元/ }));
    fireEvent.change(screen.getByLabelText("開始時間"), { target: { value: "15:00" } });
    expect(screen.getByLabelText("終了時間")).toHaveValue("12:45");
  });

  it("does not change timed values while all-day is on", () => {
    renderEventForm();
    fireEvent.change(screen.getByLabelText("開始時間"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByLabelText("開始時間")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByLabelText("開始時間")).toHaveValue("14:30");
    expect(screen.getByLabelText("終了時間")).toHaveValue("15:30");
  });
});

describe("Calendar adaptive row allocation", () => {
  it("shares rows across bands and single-day events", () => {
    expect(allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b")], 2, null, 4)).toMatchObject({ hiddenCount: 0, visibleEvents: [{ eventId: "a" }, { eventId: "b" }], visibleMoney: [] });
    expect(allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b"), projectedEvent("c")], 2, null, 4).hiddenCount).toBe(1);
  });

  it("switches the form to period and only offers valid window recurrence", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ user }));
      if (path.endsWith("/api/settings")) return Promise.resolve(response({ settings }));
      return Promise.resolve(response({ events: [] }));
    });
    render(<App />);
    await screen.findByRole("heading", { name: "カレンダー" });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    fireEvent.click(screen.getByRole("button", { name: "家を追加" }));
    await screen.findByRole("heading", { name: "予定を追加" });
    fireEvent.click(screen.getByRole("button", { name: /^予定の種類$/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "予定の種類" })).getByRole("button", { name: "期間中にやりたい" }));
    expect(screen.getByRole("button", { name: "実施時期" })).toHaveTextContent("今週中");
    expect(screen.queryByRole("button", { name: /^日付$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "実施時期" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "実施時期" })).getByRole("button", { name: "日付範囲を指定" }));
    expect(screen.getByRole("button", { name: /^期間/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^開始日/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^繰り返し$/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "同日範囲" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("期間は2日以上で指定してください。"));
  });

  it("keeps money in the final row and counts mixed overflow", () => {
    const money = [{ amount: 699, category: "income" as const, isSummary: true, label: "収支" }];
    const threeRowsFourEvents = allocateCalendarCellRows(["a", "b", "c", "d"].map(projectedEvent), 0, money, 3);
    expect(threeRowsFourEvents.visibleEvents).toHaveLength(2);
    expect(threeRowsFourEvents.emptyRows).toBe(0);
    expect(threeRowsFourEvents.visibleMoney).toEqual(money);
    expect(threeRowsFourEvents.hiddenCount).toBe(2);
    const threeRowsOneEvent = allocateCalendarCellRows([projectedEvent("a")], 0, money, 3);
    expect(threeRowsOneEvent.visibleEvents).toHaveLength(1);
    expect(threeRowsOneEvent.emptyRows).toBe(1);
    expect(threeRowsOneEvent.visibleMoney).toEqual(money);
    expect(threeRowsOneEvent.hiddenCount).toBe(0);
    const threeRowsNoEvents = allocateCalendarCellRows([], 0, money, 3);
    expect(threeRowsNoEvents.emptyRows).toBe(2);
    expect(threeRowsNoEvents.visibleMoney).toEqual(money);
    expect(threeRowsNoEvents.hiddenCount).toBe(0);
    const fourRowsFourEvents = allocateCalendarCellRows(["a", "b", "c", "d"].map(projectedEvent), 0, money, 4);
    expect(fourRowsFourEvents.visibleEvents).toHaveLength(3);
    expect(fourRowsFourEvents.visibleMoney).toEqual(money);
    expect(fourRowsFourEvents.hiddenCount).toBe(1);
    const noMoney = allocateCalendarCellRows(["a", "b", "c", "d"].map(projectedEvent), 0, null, 3);
    expect(noMoney.visibleEvents).toHaveLength(3);
    expect(noMoney.emptyRows).toBe(0);
    expect(noMoney.hiddenCount).toBe(1);
    const homeRows = allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b"), projectedEvent("c")], 0, null, 3);
    const workRows = allocateCalendarCellRows([projectedEvent("a"), projectedEvent("b"), projectedEvent("c")], 0, null, 3);
    expect(homeRows.visibleEvents).toHaveLength(3);
    expect(workRows.visibleEvents).toHaveLength(3);
    const moneyTab = allocateCalendarCellRows([], 0, [{ amount: -1500, category: "expense" as const, label: "夜ごはん" }, { amount: -800, category: "expense" as const, label: "歯医者" }, { amount: -2300, category: "expense" as const, isSummary: true, label: "収支" }], 3);
    expect(moneyTab.emptyRows).toBe(0);
    expect(moneyTab.visibleMoney.map((entry) => entry.label)).toEqual(["夜ごはん", "歯医者", "収支"]);
    const moneyTabOneDetail = allocateCalendarCellRows([], 0, [{ amount: -1500, category: "expense" as const, label: "夜ごはん" }, { amount: -1500, category: "expense" as const, isSummary: true, label: "収支" }], 3);
    expect(moneyTabOneDetail.emptyRows).toBe(1);
    expect(moneyTabOneDetail.visibleMoney.at(-1)?.isSummary).toBe(true);
  });
});

describe("Calendar date and money projections", () => {
  it("formats weekdays and period boundaries from weekStartsOn", () => {
    expect(formatDate("2026-09-10")).toBe("9月10日(木)");
    expect(formatDate("2026-09-10", true)).toBe("2026年9月10日(木)");
    expect(formatDateRange("2026-09-10", "2026-09-13")).toBe("9月10日(木)〜9月13日(日)");
    expect(weekEnd("2026-09-10", 0)).toBe("2026-09-12");
    expect(weekEnd("2026-09-10", 1)).toBe("2026-09-13");
    expect(weekEnd("2026-09-10", 6)).toBe("2026-09-11");
  });

  it("projects money details and the daily total separately", () => {
    const entries = calendarMoneyEntriesForDate("2026-09-10", "2026-09-10");
    expect(entries.map((entry) => entry.amount)).toEqual([-1500, 2999, -800]);
    expect(calendarMoneySummaryForDate("2026-09-10", "2026-09-10")).toMatchObject({ amount: 699, category: "income" });
    expect(calendarMoneySummaryForDate("2026-09-11", "2026-09-10")).toBeNull();
  });
});

describe("recurrence form summaries", () => {
  it("renders human-readable interval and weekday summaries", () => {
    expect(recurrenceSummary({ frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("毎日");
    expect(recurrenceSummary({ frequency: "daily", interval: 2, weekdays: null, dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("2日ごと");
    expect(recurrenceSummary({ frequency: "weekly", interval: 1, weekdays: [2], dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("毎週火曜");
    expect(recurrenceSummary({ frequency: "weekly", interval: 2, weekdays: [1, 3], dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("2週間ごと 月・水");
    expect(recurrenceSummary({ frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 25, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("毎月25日");
    expect(recurrenceSummary({ frequency: "monthly", interval: 2, weekdays: null, dayOfMonth: 15, startsOn: "2026-09-08", endsOn: "2026-09-22" }, "2026-09-08")).toBe("2か月ごと15日（〜9月22日(火)）");
  });

  it("uses the event start weekday when weekly weekdays are omitted", () => {
    expect(recurrenceSummary({ frequency: "weekly", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08")).toBe("毎週火曜");
  });

  it("keeps period recurrence summaries independent from the anchor date", () => {
    expect(recurrenceSummary({ frequency: "weekly", interval: 1, weekdays: [2], dayOfMonth: null, startsOn: "2026-09-08", endsOn: null }, "2026-09-08", true)).toBe("毎週");
    expect(recurrenceSummary({ frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 8, startsOn: "2026-09-08", endsOn: null }, "2026-09-08", true)).toBe("毎月");
    expect(recurrenceSummary({ frequency: "weekly", interval: 2, weekdays: [1, 3], dayOfMonth: null, startsOn: "2026-09-08", endsOn: "2026-09-22" }, "2026-09-08", true)).toBe("2週間ごと（〜9月22日(火)）");
  });
});
