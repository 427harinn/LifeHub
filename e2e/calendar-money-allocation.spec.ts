import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidenceDir = path.resolve("artifacts/evidence/pr10-calendar-money");
const password = "correct-horse-battery";
const uniqueEmail = () => `pr10-calendar-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("PR10 Calendar確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function createEvent(page: import("@playwright/test").Page, input: { category: "home" | "work"; title: string; startDate: string; endDate: string; allDay?: boolean; startTime?: string | null; endTime?: string | null }) {
  const response = await page.request.post("/api/events", { data: { place: null, memo: null, timingType: "scheduled", allDay: false, startTime: "09:00", endTime: "10:00", ...input } });
  expect(response.status()).toBe(201);
}

test("Calendar All and Money allocation stays inside the cell across mobile viewports", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const today = todayKey();
  const todayDay = Number(today.slice(-2));
  await register(page);

  for (const [index, category] of (["home", "work"] as const).entries()) {
    await createEvent(page, { category, title: `帯${index + 1}`, startDate: shiftDate(today, -2), endDate: shiftDate(today, 2), allDay: true, startTime: null, endTime: null });
  }
  for (let index = 0; index < 3; index += 1) {
    await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `超過予定${index + 1}`, startDate: today, endDate: today, startTime: `${String(10 + index).padStart(2, "0")}:00`, endTime: `${String(10 + index).padStart(2, "0")}:30` });
  }

  const categoriesResponse = await page.request.get("/api/money-categories?type=expense");
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json() as { categories: Array<{ id: string }> };
  const moneyItems = [] as Array<{ id: string; title: string }>;
  for (const [title, amount] of [["電気代", 10000], ["水道代", 4000]] as const) {
    const response = await page.request.post("/api/money", { data: { type: "expense", title, plannedAmount: amount, categoryId: categories.categories[0].id, date: today, memo: null, recurrence: null } });
    expect(response.status()).toBe(201);
    const body = await response.json() as { money: { id: string; title: string } };
    moneyItems.push(body.money);
  }
  const monthResponse = await page.request.get(`/api/money/month?month=${today.slice(0, 7)}`);
  expect(monthResponse.ok()).toBeTruthy();
  const month = await monthResponse.json() as { occurrences: Array<{ id: string; title: string; occurrenceKey: string }> };
  const settled = month.occurrences.find((item) => item.id === moneyItems[0].id && item.title === "電気代");
  expect(settled).toBeTruthy();
  const settlement = await page.request.put(`/api/money/${settled?.id}/occurrences/${encodeURIComponent(settled?.occurrenceKey ?? "")}/actual`, { data: { amount: 5200 } });
  expect(settlement.ok()).toBeTruthy();

  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/calendar?calendarMax=3");
    await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    const allCell = page.getByRole("button", { name: `${todayDay}日`, exact: true });
    const allMoney = allCell.locator(".calendar-cell__money");
    await expect(allMoney).toHaveText("-9,200");
    await expect(allCell.locator(".calendar-cell__count")).toHaveCount(1);
    const cellBox = await allCell.boundingBox();
    const amountBox = await allMoney.boundingBox();
    if (!cellBox || !amountBox) throw new Error("Calendar All Money bounds unavailable");
    expect(amountBox.y).toBeGreaterThanOrEqual(cellBox.y);
    expect(amountBox.y + amountBox.height).toBeLessThanOrEqual(cellBox.y + cellBox.height);
    console.log(JSON.stringify({ viewport, cellTop: cellBox.y, cellBottom: cellBox.y + cellBox.height, moneyTop: amountBox.y, moneyBottom: amountBox.y + amountBox.height, renderedEventCount: await allCell.locator(".calendar-event").count(), hiddenCount: await allCell.locator(".calendar-cell__count").textContent() }));
    await page.screenshot({ path: path.join(evidenceDir, `calendar-all-money-overflow-${viewport.width}x${viewport.height}.png`) });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar?calendarMax=3");
  await page.getByRole("tab", { name: "お金" }).click();
  const moneyCell = page.getByRole("button", { name: `${todayDay}日`, exact: true });
  await expect(moneyCell.locator(".calendar-cell__money")).toHaveCount(3);
  expect(await moneyCell.locator(".calendar-cell__money").allTextContents()).toEqual(expect.arrayContaining(["電気代", "水道代", "-9,200"]));
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-tab-390x844.png") });
  await moneyCell.locator(".calendar-cell__date").click();
  const dateSheet = page.getByRole("dialog", { name: /月/ });
  await expect(dateSheet.locator(".money-sheet-row")).toHaveCount(2);
  const hiddenCategoryLabels = dateSheet.locator(".money-sheet-row small");
  await expect(hiddenCategoryLabels).toHaveCount(2);
  for (const label of await hiddenCategoryLabels.all()) await expect(label).toBeHidden();
  await expect(dateSheet.locator(".money-sheet-row").filter({ hasText: "電気代" }).locator(".money-status-icon")).toHaveAttribute("aria-label", "確定");
  await expect(dateSheet.locator(".money-sheet-row").filter({ hasText: "水道代" }).locator(".money-status-icon")).toHaveAttribute("aria-label", "予定");
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-money-normal-390x844.png") });
  await dateSheet.locator(".money-sheet-row").first().click();
  const detail = dateSheet.locator(".money-inline-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("カテゴリ");
  await expect(detail).toContainText("食費");
  await expect(detail.locator(".money-inline-detail__list > div")).toHaveCount(3);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-money-expanded-390x844.png") });
  const firstRow = dateSheet.locator(".event-swipe-row").filter({ hasText: "電気代" }).first();
  const firstRowBox = await firstRow.boundingBox();
  if (!firstRowBox) throw new Error("Date Sheet Money row bounds unavailable");
  await page.mouse.move(firstRowBox.x + firstRowBox.width - 24, firstRowBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(firstRowBox.x + 24, firstRowBox.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(firstRow.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(firstRow.locator(".money-inline-detail")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-money-swipe-390x844.png") });
});
