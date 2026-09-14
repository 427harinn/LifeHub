import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve(process.env.M11_EVIDENCE_DIR ?? "artifacts/evidence/m11");
const password = "correct-horse-battery";
const uniqueEmail = () => `m11-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const dateKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const dateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日(${weekdays[date.getUTCDay()]})`;
};

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M11確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function createFixtures(page: import("@playwright/test").Page) {
  const start = dateKey(7);
  const periodStart = dateKey(14);
  const periodEnd = dateKey(16);
  const weekday = new Date(`${start}T00:00:00Z`).getUTCDay();
  const events = [
    { category: "home", title: "博多歯科", place: "博多駅前", memo: "定期検診メモ", timingType: "scheduled", allDay: false, startDate: start, startTime: "10:00", endDate: start, endTime: "11:00", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrence: null },
    { category: "work", title: "とても長い週次レビューのタイトル確認用", place: "東京オフィス", memo: "議事録メモ", timingType: "scheduled", allDay: false, startDate: start, startTime: "14:00", endDate: start, endTime: "15:00", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrence: { frequency: "weekly", interval: 1, weekdays: [weekday], dayOfMonth: null, startsOn: start, endsOn: dateKey(28) } },
    { category: "home", title: "終日予定", place: null, memo: null, timingType: "scheduled", allDay: true, startDate: start, startTime: null, endDate: start, endTime: null, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrence: null },
    { category: "home", title: "春の整理", place: null, memo: "期間メモ", timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType: "custom_range", periodAnchorDate: null, periodStartDate: periodStart, periodEndDate: periodEnd, deadlineTime: "21:00", recurrence: null }
  ];
  const createdIds: string[] = [];
  for (const event of events) {
    const response = await page.request.post("/api/events", { data: event });
    expect(response.status()).toBe(201);
    createdIds.push((await response.json() as { event: { id: string } }).event.id);
  }
  const categories = await page.request.get("/api/money-categories?includeInactive=false").then(async (response) => { expect(response.ok()).toBeTruthy(); return await response.json() as { categories: Array<{ id: string; type: "expense" | "income"; name: string }> }; });
  const expense = categories.categories.find((category) => category.type === "expense");
  if (!expense) throw new Error("expense category is missing");
  const moneyResponse = await page.request.post("/api/money", { data: { type: "expense", title: "電気代", plannedAmount: 8500, categoryId: expense.id, date: dateKey(-20), memo: "毎月の請求", recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 10, startsOn: dateKey(-60), endsOn: null } } });
  expect(moneyResponse.status()).toBe(201);
  return { start, periodStart, periodEnd, recurringId: createdIds[1] };
}

async function openAddChoice(page: import("@playwright/test").Page, label: "家を追加" | "仕事を追加" | "お金を追加") {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: label }).click();
}

test("M11 Calendar Search shows server results and jumps to the occurrence", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const { start, periodStart, periodEnd } = await (async () => { await register(page); return await createFixtures(page); })();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-entry-390x844.png") });
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByRole("heading", { name: "検索", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-empty-390x844.png") });
  const input = page.getByRole("textbox", { name: "予定を検索" });
  await input.fill("博多");
  await expect(page.getByRole("button", { name: /博多歯科/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-home-result-390x844.png") });
  await input.fill("駅前");
  const placeResult = page.getByRole("button", { name: /博多歯科/ });
  await expect(placeResult.locator(".calendar-search-result__context")).toHaveText("場所 博多駅前");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-place-hit-390x844.png") });
  await input.fill("定期");
  await expect(page.getByRole("button", { name: /博多歯科/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-memo-390x844.png") });
  await input.fill("週次");
  await expect(page.locator(".calendar-search-result")).toHaveCount(4);
  const recurringRow = page.locator(".calendar-search-result").first();
  await expect(recurringRow.locator(".calendar-search-result__title")).toHaveCSS("text-overflow", "ellipsis");
  const rowLayout = await recurringRow.evaluate((element) => { const title = element.querySelector(".calendar-search-result__title")?.getBoundingClientRect(); const datetime = element.querySelector(".calendar-search-result__datetime")?.getBoundingClientRect(); return { titleRight: title?.right ?? 0, datetimeLeft: datetime?.left ?? 0, datetimeWidth: datetime?.width ?? 0 }; });
  expect(rowLayout.datetimeWidth).toBeGreaterThan(0);
  expect(rowLayout.titleRight).toBeLessThanOrEqual(rowLayout.datetimeLeft - 8);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-multiple-occurrences-390x844.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(recurringRow.locator(".calendar-search-result__datetime")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-narrow-375x812.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("期間");
  const periodResult = page.getByRole("button", { name: /春の整理/ });
  await expect(periodResult).toBeVisible();
  await expect(periodResult).toContainText(`${dateLabel(periodStart)}〜${dateLabel(periodEnd)}`);
  await expect(periodResult).not.toContainText("9月25日(金) 9月25日");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-period-390x844.png") });
  await input.fill("終日");
  await expect(page.getByRole("button", { name: /終日予定/ })).toContainText("終日");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-all-day-390x844.png") });
  await input.fill("存在しない予定");
  await expect(page.getByText("見つかりませんでした", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-no-results-390x844.png") });
  await input.fill("博多");
  const result = page.getByRole("button", { name: /博多歯科/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${start}`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("博多歯科", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-jump-date-sheet-390x844.png") });
});

test("M11 Event and Money reuse search keep category scope and copy semantics", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await createFixtures(page);

  await openAddChoice(page, "家を追加");
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).not.toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(evidenceDir, "event-home-form-no-click-through-390x844.png") });
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  const homeSheet = page.getByRole("dialog", { name: "以前の項目から選ぶ" });
  await expect(homeSheet).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "event-home-reuse-sheet-390x844.png") });
  await homeSheet.getByRole("textbox", { name: "以前の予定を検索" }).fill("博多");
  await expect(homeSheet.getByRole("button", { name: /博多歯科/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "event-home-reuse-search-390x844.png") });
  await homeSheet.getByRole("button", { name: /博多歯科/ }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).not.toBeVisible();
  await expect(page.getByLabel("タイトル")).toHaveValue("博多歯科");
  await page.screenshot({ path: path.join(evidenceDir, "event-home-reuse-selected-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await openAddChoice(page, "仕事を追加");
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  const workSheet = page.getByRole("dialog", { name: "以前の項目から選ぶ" });
  await workSheet.getByRole("textbox", { name: "以前の予定を検索" }).fill("東京");
  await expect(workSheet.getByRole("button", { name: /週次レビュー/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "event-work-reuse-search-390x844.png") });
  await workSheet.getByRole("button", { name: /週次レビュー/ }).click();
  await expect(page.getByLabel("タイトル")).toHaveValue("とても長い週次レビューのタイトル確認用");
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await page.getByRole("button", { name: "お金", exact: true }).click();
  await openAddChoice(page, "お金を追加");
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  const moneySheet = page.getByRole("dialog", { name: "以前の項目から選ぶ" });
  await expect(moneySheet).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-reuse-sheet-390x844.png") });
  await moneySheet.getByRole("textbox", { name: "以前のお金を検索" }).fill("電気");
  await expect(moneySheet.getByRole("button", { name: /電気代/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-reuse-title-search-390x844.png") });
  await moneySheet.getByRole("textbox", { name: "以前のお金を検索" }).fill("固定費");
  await expect(moneySheet.getByRole("button", { name: /電気代/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-reuse-category-search-390x844.png") });
  await moneySheet.getByRole("button", { name: /電気代/ }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).not.toBeVisible();
  await expect(page.getByLabel("項目名")).toHaveValue("電気代");
  await expect(page.getByRole("textbox", { name: "金額" })).toHaveValue("8,500");
  await page.screenshot({ path: path.join(evidenceDir, "money-reuse-selected-390x844.png") });
});
