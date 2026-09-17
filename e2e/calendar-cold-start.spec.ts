import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidenceDir = path.resolve("artifacts/evidence/debug/calendar-cold-start");
const password = "correct-horse-battery";
const uniqueEmail = () => `calendar-cold-start-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("Calendar cold start確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function createEvent(page: import("@playwright/test").Page, input: { category: "home" | "work"; title: string; startDate: string; endDate: string; allDay?: boolean; startTime?: string | null; endTime?: string | null }) {
  const response = await page.request.post("/api/events", { data: { place: null, memo: null, timingType: "scheduled", allDay: false, startTime: "09:00", endTime: "10:00", ...input } });
  expect(response.status()).toBe(201);
}

async function snapshotCell(page: import("@playwright/test").Page, day: number) {
  const cell = page.getByRole("button", { name: new RegExp(`^${day}日$`) });
  const summary = cell.locator(".calendar-cell__money--summary");
  const cellBox = await cell.boundingBox();
  const summaryBox = await summary.boundingBox();
  if (!cellBox || !summaryBox) throw new Error("Calendar cold-start bounds unavailable");
  return {
    eventCount: await cell.locator(".calendar-event").count(),
    hiddenCount: await cell.locator(".calendar-cell__count").textContent(),
    summaryText: await summary.textContent(),
    summaryInsideCell: summaryBox.y >= cellBox.y && summaryBox.y + summaryBox.height <= cellBox.y + cellBox.height
  };
}

test("Calendar cold start measures before first paint at 390x844 and 375x812", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const today = todayKey();
  const todayDay = Number(today.slice(-2));
  await register(page);

  await createEvent(page, { category: "home", title: "帯予定", startDate: shiftDate(today, -2), endDate: shiftDate(today, 2), allDay: true, startTime: null, endTime: null });
  for (let index = 0; index < 5; index += 1) {
    await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `高密度予定${index + 1}`, startDate: today, endDate: today, startTime: `${String(10 + index).padStart(2, "0")}:00`, endTime: `${String(10 + index).padStart(2, "0")}:30` });
  }
  const categoriesResponse = await page.request.get("/api/money-categories?type=expense");
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json() as { categories: Array<{ id: string }> };
  for (const [title, amount] of [["電気代", 5200], ["水道代", 4000]] as const) {
    const response = await page.request.post("/api/money", { data: { type: "expense", title, plannedAmount: amount, categoryId: categories.categories[0].id, date: today, memo: null, recurrence: null } });
    expect(response.status()).toBe(201);
  }

  await page.route("**/api/calendar**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  let baseline: Awaited<ReturnType<typeof snapshotCell>> | undefined;
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/calendar");
    await expect(page.getByRole("status")).toHaveText("読み込み中…");
    await page.screenshot({ path: path.join(evidenceDir, `01-loading-${viewport.width}x${viewport.height}.png`) });
    await expect(page.locator(".calendar-grid")).toBeVisible();
    const first = await snapshotCell(page, todayDay);
    expect(first.summaryInsideCell).toBe(true);
    await page.screenshot({ path: path.join(evidenceDir, `02-cold-start-money-summary-${viewport.width}x${viewport.height}.png`) });
    if (!baseline) baseline = first;
    else expect(first).toEqual(baseline);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const currentMonth = await page.locator(".calendar-month h2").textContent();
  const beforeMonthChange = await snapshotCell(page, todayDay);
  await page.screenshot({ path: path.join(evidenceDir, "03-before-month-change-390x844.png") });
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.locator(".calendar-month h2")).not.toHaveText(currentMonth ?? "");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page.locator(".calendar-month h2")).toHaveText(currentMonth ?? "");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const afterMonthChange = await snapshotCell(page, todayDay);
  await page.screenshot({ path: path.join(evidenceDir, "04-after-month-change-390x844.png") });
  expect(afterMonthChange).toEqual(beforeMonthChange);

  await page.getByRole("tab", { name: "お金" }).click();
  const moneyCell = page.getByRole("button", { name: new RegExp(`^${todayDay}日$`) });
  await expect(moneyCell.locator(".calendar-cell__money")).toHaveCount(3);
  await moneyCell.locator(".calendar-cell__date").click();
  const dateSheet = page.getByRole("dialog", { name: /月/ });
  await expect(dateSheet.locator(".money-sheet-row")).toHaveCount(2);
  await page.screenshot({ path: path.join(evidenceDir, "05-date-sheet-money-390x844.png") });
});
