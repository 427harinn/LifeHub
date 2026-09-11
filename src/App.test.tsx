import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { allocateCalendarCellRows, App, calendarMoneyEntriesForDate, calendarMoneySummaryForDate, EventForm, formatDate, formatDateRange, MoneyCategoryDonut, MoneyForm, MoneyInlineDetail, MoneyStatusIcon, recurrenceAfterBaseDateChange, recurrenceSummary, weekEnd } from "./App";
import type { Event, MoneyItem } from "./api/client";
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

const renderEventForm = (props: Partial<Parameters<typeof EventForm>[0]> = {}) => render(<EventForm category="home" initialDate="2026-09-10" onCancel={vi.fn()} onSaved={vi.fn()} suppressInitialRecentOpen={false} {...props} />);

const moneyItem = (overrides: Partial<MoneyItem> = {}): MoneyItem => ({
  id: "money-1", userId: "user-1", type: "expense", title: "支出", categoryId: "category-1", plannedAmount: 1000, date: "2026-09-01", time: null,
  recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...overrides
});

describe("Money category donut colors", () => {
  it("keeps income out and shares each category color between donut and legend", () => {
    const expense = { id: "food", userId: "user-1", type: "expense" as const, name: "食費", colorKey: null, sortOrder: 0, active: true, createdAt: "", updatedAt: "" };
    const fixed = { id: "fixed", userId: "user-1", type: "expense" as const, name: "固定費", colorKey: null, sortOrder: 1, active: true, createdAt: "", updatedAt: "" };
    render(<MoneyCategoryDonut occurrences={[
      moneyItem({ id: "food-item", categoryId: expense.id, category: expense, plannedAmount: 1000, effectiveAmount: 1000 }),
      moneyItem({ id: "fixed-item", categoryId: fixed.id, category: fixed, plannedAmount: 2000, effectiveAmount: 1800, settlementStatus: "actual" }),
      moneyItem({ id: "income-item", type: "income", categoryId: "income", plannedAmount: 9000, category: { ...expense, id: "income", type: "income", name: "給料" } })
    ]} />);

    const dots = screen.getAllByTestId("money-chart-legend-dot");
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute("data-color-key", "blue");
    expect(dots[1]).toHaveAttribute("data-color-key", "orange");
    const donut = screen.getByLabelText("今月の支出 2,800円");
    expect(donut.getAttribute("style")).toContain("#527c9c");
    expect(donut.getAttribute("style")).toContain("#d47b4f");
    expect(screen.queryByText("給料")).not.toBeInTheDocument();
  });

  it("keeps a category color when the amount state changes", () => {
    const category = { id: "food", userId: "user-1", type: "expense" as const, name: "食費", colorKey: "orange", sortOrder: 0, active: true, createdAt: "", updatedAt: "" };
    const { rerender } = render(<MoneyCategoryDonut occurrences={[moneyItem({ category, effectiveAmount: 1200, settlementStatus: "actual" })]} />);
    expect(screen.getByTestId("money-chart-legend-dot")).toHaveAttribute("data-color-key", "orange");
    rerender(<MoneyCategoryDonut occurrences={[moneyItem({ category, effectiveAmount: 900, settlementStatus: null })]} />);
    expect(screen.getByTestId("money-chart-legend-dot")).toHaveAttribute("data-color-key", "orange");
  });
});

describe("Money category donut modes", () => {
  const food = { id: "food", userId: "user-1", type: "expense" as const, name: "食費", colorKey: "orange", sortOrder: 0, active: true, createdAt: "", updatedAt: "" };
  const fixed = { id: "fixed", userId: "user-1", type: "expense" as const, name: "固定費", colorKey: "blue", sortOrder: 1, active: true, createdAt: "", updatedAt: "" };
  const daily = { id: "daily", userId: "user-1", type: "expense" as const, name: "日用品", colorKey: "green", sortOrder: 2, active: true, createdAt: "", updatedAt: "" };
  const entertainment = { id: "entertainment", userId: "user-1", type: "expense" as const, name: "娯楽", colorKey: "pink", sortOrder: 3, active: true, createdAt: "", updatedAt: "" };

  it("defaults to forecast, includes planned amounts, and switches actual aggregation", () => {
    render(<MoneyCategoryDonut occurrences={[
      moneyItem({ id: "planned-food", categoryId: food.id, category: food, plannedAmount: 1000, effectiveAmount: 1000, settlementStatus: null }),
      moneyItem({ id: "actual-food", categoryId: food.id, category: food, plannedAmount: 700, effectiveAmount: 500, settlementStatus: "actual" }),
      moneyItem({ id: "actual-fixed", categoryId: fixed.id, category: fixed, plannedAmount: 2000, effectiveAmount: 1800, settlementStatus: "actual" }),
      moneyItem({ id: "estimated-daily", categoryId: daily.id, category: daily, plannedAmount: 3000, effectiveAmount: 2500, settlementStatus: "estimated_actual" }),
      moneyItem({ id: "planned-entertainment", categoryId: entertainment.id, category: entertainment, plannedAmount: 1000, effectiveAmount: 1000, settlementStatus: null }),
      moneyItem({ id: "income", type: "income", categoryId: "income", plannedAmount: 9000, effectiveAmount: 9000, settlementStatus: "actual" })
    ]} />);

    expect(screen.getByRole("button", { name: "見込み" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("今月の支出 6,800円")).toBeInTheDocument();
    expect(screen.getAllByTestId("money-chart-legend-dot")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "実績" }));
    expect(screen.getByRole("button", { name: "実績" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("確定した支出 4,800円")).toBeInTheDocument();
    expect(screen.getAllByTestId("money-chart-legend-dot")).toHaveLength(3);
    expect(screen.queryByText("娯楽")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("money-chart-legend-dot").map((dot) => dot.getAttribute("data-color-key"))).toEqual(expect.arrayContaining(["orange", "blue", "green"]));
  });

  it("shows the actual empty state when no occurrence is settled", () => {
    render(<MoneyCategoryDonut occurrences={[moneyItem({ category: food, effectiveAmount: 1000, settlementStatus: null })]} />);
    fireEvent.click(screen.getByRole("button", { name: "実績" }));
    expect(screen.getByText("まだ確定した支出はありません")).toBeInTheDocument();
    expect(screen.queryByLabelText(/確定した支出/)).not.toBeInTheDocument();
  });
});

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
    expect(screen.queryByRole("dialog", { name: "以前の項目から選ぶ" })).not.toBeInTheDocument();
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
  it("uses direct date inputs and always-visible memo without duplicate headings", () => {
    renderEventForm();
    expect(screen.getByLabelText("日付")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("終了日")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("メモ")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "予定の種類" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "日時" })).not.toBeInTheDocument();
  });

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
    expect(screen.queryByRole("button", { name: /^期間/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("開始日")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("終了日")).toHaveValue("2026-09-10");
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
    expect(threeRowsOneEvent.contentRows).toBe(2);
    expect(threeRowsOneEvent.emptyRows).toBe(0);
    expect(threeRowsOneEvent.visibleMoney).toEqual(money);
    expect(threeRowsOneEvent.hiddenCount).toBe(0);
    const threeRowsNoEvents = allocateCalendarCellRows([], 0, money, 3);
    expect(threeRowsNoEvents.contentRows).toBe(1);
    expect(threeRowsNoEvents.emptyRows).toBe(0);
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
    expect(moneyTabOneDetail.contentRows).toBe(2);
    expect(moneyTabOneDetail.emptyRows).toBe(0);
    expect(moneyTabOneDetail.visibleMoney.at(-1)?.isSummary).toBe(true);
  });

  it("reserves the final rendered row for All-tab Money summary before events", () => {
    const money = [{ amount: -5200, category: "expense" as const, isSummary: true, label: "収支" }];
    const allocation = allocateCalendarCellRows([projectedEvent("event-a"), projectedEvent("event-b")], 2, money, 4);
    expect(allocation.visibleBandCount).toBe(2);
    expect(allocation.visibleEvents).toHaveLength(1);
    expect(allocation.visibleMoney).toEqual(money);
    expect(allocation.contentRows).toBe(2);
    expect(allocation.summaryRowIndex).toBe(2);
    expect(allocation.hiddenCount).toBe(1);

    const overflow = allocateCalendarCellRows([projectedEvent("event-a")], 3, money, 3);
    expect(overflow.visibleBandCount).toBe(2);
    expect(overflow.visibleEvents).toHaveLength(0);
    expect(overflow.visibleMoney).toEqual(money);
    expect(overflow.contentRows).toBe(1);
    expect(overflow.summaryRowIndex).toBe(1);
    expect(overflow.hiddenCount).toBe(2);
  });

  it("allocates only rendered rows across compact calendar capacities", () => {
    const money = [
      { amount: -5200, category: "expense" as const, label: "電気代" },
      { amount: -800, category: "expense" as const, label: "交通費" },
      { amount: -6000, category: "expense" as const, isSummary: true, label: "収支" },
    ];
    for (const rowCapacity of [3, 4]) {
      const allocation = allocateCalendarCellRows([projectedEvent("event-a"), projectedEvent("event-b")], 2, money, rowCapacity);
      expect(allocation.visibleEvents.length + allocation.visibleMoney.length + allocation.emptyRows).toBeLessThanOrEqual(rowCapacity);
      expect(allocation.visibleMoney.at(-1)?.isSummary).toBe(true);
      expect(allocation.hiddenCount).toBeGreaterThanOrEqual(0);
    }

    const moneyTab = allocateCalendarCellRows([], 0, money, 3);
    expect(moneyTab.visibleMoney.map((item) => item.label)).toEqual(["電気代", "交通費", "収支"]);
    expect(moneyTab.hiddenCount).toBe(0);
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

  it("moves default monthly and weekly anchors with a base date change", () => {
    expect(recurrenceAfterBaseDateChange({ frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 9, startsOn: "2026-09-09", endsOn: null }, "2026-09-09", "2026-09-15")).toMatchObject({ startsOn: "2026-09-15", dayOfMonth: 15 });
    expect(recurrenceAfterBaseDateChange({ frequency: "weekly", interval: 1, weekdays: [3], dayOfMonth: null, startsOn: "2026-09-09", endsOn: null }, "2026-09-09", "2026-09-15")).toMatchObject({ startsOn: "2026-09-15", weekdays: [2] });
  });

  it("preserves explicitly customized cadence fields when the base date changes", () => {
    expect(recurrenceAfterBaseDateChange({ frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 31, startsOn: "2026-09-09", endsOn: null }, "2026-09-09", "2026-09-15")).toMatchObject({ startsOn: "2026-09-15", dayOfMonth: 31 });
    expect(recurrenceAfterBaseDateChange({ frequency: "weekly", interval: 1, weekdays: [4], dayOfMonth: null, startsOn: "2026-09-09", endsOn: null }, "2026-09-09", "2026-09-15")).toMatchObject({ startsOn: "2026-09-15", weekdays: [4] });
  });
});

describe("MoneyForm settlement mode", () => {
  const category = { id: "food", userId: "user-1", type: "expense" as const, name: "食費", colorKey: "green", sortOrder: 0, active: true, createdAt: "", updatedAt: "" };
  const createdMoney = { id: "money-1", userId: "user-1", type: "expense" as const, title: "ランチ", categoryId: category.id, plannedAmount: 1200, date: "2026-09-10", time: null, recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "", updatedAt: "" };
  const renderMoneyForm = () => render(<MoneyForm initialDate="2026-09-10" onCancel={vi.fn()} onSaved={vi.fn()} suppressInitialRecentOpen={false} />);

  it("defaults to actual and auto-selects planned when recurrence is added", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ categories: [category] }));
    renderMoneyForm();
    await screen.findByRole("button", { name: "お金カテゴリ" });
    expect(screen.getByRole("button", { name: "金額の状態" })).toHaveTextContent("確定");
    fireEvent.click(screen.getByRole("button", { name: "お金の繰り返し" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "繰り返し" })).getByRole("button", { name: "毎月" }));
    expect(screen.getByRole("button", { name: "金額の状態" })).toHaveTextContent("予定");
  });

  it("uses the shared direct date/memo grammar and terminal choices have no chevron", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ categories: [category] }));
    renderMoneyForm();
    await screen.findByRole("button", { name: "お金カテゴリ" });
    expect(screen.getByLabelText("日付")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("メモ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "お金の種類" }));
    const typeSheet = screen.getByRole("dialog", { name: "種類" });
    expect(within(typeSheet).getByRole("button", { name: "支出" }).querySelector(".form-row__chevron")).toBeNull();
    fireEvent.click(within(typeSheet).getByRole("button", { name: "支出" }));
    fireEvent.click(screen.getByRole("button", { name: "金額の状態" }));
    const settlementSheet = screen.getByRole("dialog", { name: "金額の状態" });
    expect(within(settlementSheet).getByRole("button", { name: "確定" }).querySelector(".form-row__chevron")).toBeNull();
  });

  it("requires a fresh pointer lifecycle before opening Recent after mount", () => {
    render(<MoneyForm initialDate="2026-09-10" onCancel={vi.fn()} onSaved={vi.fn()} suppressInitialRecentOpen />);
    const recentTrigger = screen.getByRole("button", { name: "以前の項目から選ぶ" });
    fireEvent.click(recentTrigger);
    expect(screen.queryByRole("dialog", { name: "以前の項目から選ぶ" })).not.toBeInTheDocument();
    fireEvent.pointerDown(recentTrigger);
    fireEvent.click(recentTrigger);
    expect(screen.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeInTheDocument();
  });

  it("keeps a manually selected mode when recurrence changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ categories: [category] }));
    renderMoneyForm();
    await screen.findByRole("button", { name: "お金カテゴリ" });
    fireEvent.click(screen.getByRole("button", { name: "金額の状態" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "金額の状態" })).getByRole("button", { name: "予定" }));
    fireEvent.click(screen.getByRole("button", { name: "お金の繰り返し" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "繰り返し" })).getByRole("button", { name: "毎月" }));
    expect(screen.getByRole("button", { name: "金額の状態" })).toHaveTextContent("予定");
  });

  it("creates an actual settlement for actual registration and none for planned registration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const path = requestPath(input);
      if (path.includes("/api/money-categories")) return Promise.resolve(response({ categories: [category] }));
      if (path === "/api/money" && init?.method === "POST") return Promise.resolve(response({ money: createdMoney }));
      if (path.includes("/actual")) return Promise.resolve(response({ settlement: { status: "actual", amount: 1200 } }));
      return Promise.resolve(response({}));
    });
    const firstForm = renderMoneyForm();
    await screen.findByRole("button", { name: "お金カテゴリ" });
    fireEvent.change(screen.getByLabelText("項目名"), { target: { value: "ランチ" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => requestPath(input).includes("/actual") && init?.method === "PUT")).toBe(true));
    fetchMock.mockClear();
    firstForm.unmount();
    renderMoneyForm();
    await screen.findByRole("button", { name: "お金カテゴリ" });
    fireEvent.click(screen.getByRole("button", { name: "金額の状態" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "金額の状態" })).getByRole("button", { name: "予定" }));
    fireEvent.change(screen.getByLabelText("項目名"), { target: { value: "ランチ予定" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input).includes("/actual"))).toBe(false));
  });
});

describe("Money status check grammar", () => {
  it("matches the HouseToDo empty and final checked states", () => {
    const { rerender } = render(<MoneyStatusIcon />);
    expect(screen.getByRole("img", { name: "予定" })).toHaveClass("money-status-icon");
    expect(screen.getByRole("img", { name: "予定" }).querySelector("svg")).toBeNull();
    rerender(<MoneyStatusIcon status="actual" />);
    expect(screen.getByRole("img", { name: "確定" })).toHaveClass("money-status-icon--settled");
    expect(screen.getByRole("img", { name: "確定" }).querySelector("svg")).toBeInTheDocument();
  });

  it("uses a full-width primary action in inline Money detail", () => {
    const item = { id: "money-1", userId: "user-1", type: "expense", title: "電気代", categoryId: "cat-1", plannedAmount: 5000, date: "2026-09-10", time: null, recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", settlementStatus: null } as MoneyItem;
    render(<MoneyInlineDetail item={item} onActual={vi.fn()} />);
    expect(screen.getByRole("button", { name: "金額を確定" })).toHaveClass("money-inline-detail__action");
  });
});
