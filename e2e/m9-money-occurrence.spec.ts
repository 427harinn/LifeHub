import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve("artifacts/evidence/m9");
const password = "correct-horse-battery";
const uniqueEmail = () => `m9-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const monthKey = (date: string) => date.slice(0, 7);
const addMonths = (date: string, months: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCMonth(value.getUTCMonth() + months); return value.toISOString().slice(0, 10); };

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M9確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function chooseDate(page: import("@playwright/test").Page, date: string) {
  await page.getByRole("button", { name: "お金の日付" }).click();
  const sheet = page.getByRole("dialog", { name: "日付" });
  await sheet.locator("#money-sheet-date").fill(date);
  await sheet.getByRole("button", { name: "この日付にする" }).click();
}

async function swipeLeft(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("swipe target is not visible");
  await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("M9 Money occurrence override, actual, shared calendar/daily projection, and split", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const today = dateKey();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await page.getByLabel("タイトル").fill("電気代");
  await page.getByLabel("金額").fill("10000");
  await chooseDate(page, today);
  await page.getByRole("button", { name: "お金の繰り返し" }).click();
  await page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "毎月" }).click();
  await page.getByRole("button", { name: "登録" }).click();
  await page.locator("nav.mobile-nav button[aria-label='お金']").click();
  const row = page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first();
  await expect(row).toContainText("10,000円");
  await page.screenshot({ path: path.join(evidenceDir, "money-planned-390x844.png") });

  await swipeLeft(page, row);
  await row.getByRole("button", { name: "編集" }).click();
  const scopeSheet = page.getByRole("dialog", { name: "編集する範囲" });
  await expect(scopeSheet).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-scope-390x844.png") });
  await scopeSheet.getByRole("button", { name: "この項目のみ" }).click();
  await page.getByLabel("金額").fill("5000");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first()).toContainText("5,000円");
  await page.screenshot({ path: path.join(evidenceDir, "money-occurrence-only-390x844.png") });

  const editedRow = page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first();
  await swipeLeft(page, editedRow);
  await editedRow.getByRole("button", { name: "実績" }).click();
  await expect(page.getByRole("dialog", { name: "実際の金額" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-actual-input-390x844.png") });
  const actualSheet = page.getByRole("dialog", { name: "実際の金額" });
  await actualSheet.getByLabel("実際の金額").fill("5200");
  await actualSheet.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first()).toContainText("5,200円");
  await expect(page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first()).toContainText("実績");
  await page.screenshot({ path: path.join(evidenceDir, "money-actual-saved-390x844.png") });

  const currentMonth = await page.request.get(`/api/money/month?month=${monthKey(today)}`).then(async (response) => { expect(response.ok()).toBeTruthy(); return await response.json() as { occurrences: Array<{ id: string; occurrenceKey: string; effectiveAmount: number; settlementStatus: string | null }> }; });
  const currentOccurrence = currentMonth.occurrences.find((entry) => entry.id && entry.occurrenceKey && entry.effectiveAmount === 5200);
  expect(currentOccurrence).toBeTruthy();
  const correction = await page.request.put(`/api/money/${currentOccurrence?.id}/occurrences/${encodeURIComponent(currentOccurrence?.occurrenceKey ?? "")}/actual`, { data: { amount: 5300 } });
  expect(correction.ok()).toBeTruthy();
  const correctedMonth = await page.request.get(`/api/money/month?month=${monthKey(today)}`).then(async (response) => await response.json() as { occurrences: Array<{ occurrenceKey: string; effectiveAmount: number }> });
  expect(correctedMonth.occurrences.find((entry) => entry.occurrenceKey === currentOccurrence?.occurrenceKey)?.effectiveAmount).toBe(5300);
  const cleared = await page.request.delete(`/api/money/${currentOccurrence?.id}/occurrences/${encodeURIComponent(currentOccurrence?.occurrenceKey ?? "")}/actual`);
  expect(cleared.ok()).toBeTruthy();
  const restoredMonth = await page.request.get(`/api/money/month?month=${monthKey(today)}`).then(async (response) => await response.json() as { occurrences: Array<{ occurrenceKey: string; effectiveAmount: number; settlementStatus: string | null }> });
  expect(restoredMonth.occurrences.find((entry) => entry.occurrenceKey === currentOccurrence?.occurrenceKey)).toMatchObject({ effectiveAmount: 5000, settlementStatus: null });
  const restoredActual = await page.request.put(`/api/money/${currentOccurrence?.id}/occurrences/${encodeURIComponent(currentOccurrence?.occurrenceKey ?? "")}/actual`, { data: { amount: 5200 } });
  expect(restoredActual.ok()).toBeTruthy();

  await page.getByRole("button", { name: "カレンダー" }).click();
  const dayButton = page.getByRole("button", { name: `${Number(today.slice(-2))}日`, exact: true });
  await expect(dayButton.locator(".calendar-cell__money")).toHaveText("-5,200");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-actual-390x844.png") });
  await page.getByRole("tab", { name: "お金" }).click();
  await dayButton.click();
  const dateSheet = page.getByRole("dialog", { name: /月/ });
  await expect(dateSheet).toContainText("-5,200円");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-date-sheet-actual-390x844.png") });
  await dateSheet.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "デイリー" }).click();
  await page.getByRole("tab", { name: "お金" }).click();
  await expect(page.getByText("-5,200円")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-actual-390x844.png") });

  const categories = await page.request.get("/api/money-categories?type=expense").then(async (response) => { expect(response.ok()).toBeTruthy(); return (await response.json() as { categories: Array<{ id: string }> }).categories; });
  const created = await page.request.post("/api/money", { data: { type: "expense", title: "分割テスト", plannedAmount: 70000, categoryId: categories[0].id, date: today, memo: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: null, startsOn: today, endsOn: null } } });
  expect(created.ok()).toBeTruthy();
  const createdMoney = await created.json() as { money: { id: string } };
  const nextDate = addMonths(today, 1);
  const nextMonth = await page.request.get(`/api/money/month?month=${monthKey(nextDate)}`).then(async (response) => { expect(response.ok()).toBeTruthy(); return await response.json() as { occurrences: Array<{ id: string; occurrenceKey: string; title: string }> }; });
  const nextOccurrence = nextMonth.occurrences.find((entry) => entry.id === createdMoney.money.id && entry.title === "分割テスト");
  expect(nextOccurrence).toBeTruthy();
  const split = await page.request.patch(`/api/money/${createdMoney.money.id}`, { data: { scope: "following", occurrenceKey: nextOccurrence?.occurrenceKey, plannedAmount: 75000, title: "分割テスト", categoryId: categories[0].id, date: nextDate, memo: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: null, startsOn: nextDate, endsOn: null } } });
  expect(split.ok()).toBeTruthy();
  const splitPayload = await split.json() as { money: { recurrence: { startsOn: string }; plannedAmount: number } };
  expect(splitPayload.money).toMatchObject({ plannedAmount: 75000, recurrence: { startsOn: nextDate } });
});
