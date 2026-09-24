import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidenceDir = path.resolve("artifacts/evidence/debug/maintenance-staging-regression");
const password = "correct-horse-battery";
const uniqueEmail = () => `maintenance-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayKey = () => new Date().toISOString().slice(0, 10);

test.use({ serviceWorkers: "block" });

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("maintenance regression確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openAdd(page: import("@playwright/test").Page, category: "家" | "仕事") {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: `${category}を追加` }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
}

async function createEvent(page: import("@playwright/test").Page, title: string, date: string) {
  const response = await page.request.post("/api/events", { data: { category: "home", title, place: null, memo: null, timingType: "scheduled", allDay: true, startDate: date, startTime: null, endDate: date, endTime: null, notifications: [], recurrence: null } });
  expect(response.status()).toBe(201);
}

async function snapshotGeometry(page: import("@playwright/test").Page, day: number) {
  const grid = page.locator(".calendar-grid");
  const cell = page.getByRole("button", { name: new RegExp(`^${day}日$`) });
  const summary = cell.locator(".calendar-cell__money--summary");
  await expect(summary).toBeVisible();
  const gridBox = await grid.boundingBox();
  const cellBox = await cell.boundingBox();
  const summaryBox = await summary.boundingBox();
  if (!gridBox || !cellBox || !summaryBox) throw new Error("Calendar geometry bounds unavailable");
  const cellHeight = gridBox.height / 6;
  const rowCapacity = Math.max(1, Math.min(4, Math.floor((cellHeight - 33) / 14)));
  const visibleEventCount = await cell.locator(".calendar-event").count();
  const hiddenCount = Number((await cell.locator(".calendar-cell__count").textContent()) ?? "0");
  return {
    cellHeight,
    gridHeight: gridBox.height,
    rowCapacity,
    visibleEventCount,
    hiddenCount,
    moneyBottom: summaryBox.y + summaryBox.height,
    cellBottom: cellBox.y + cellBox.height,
    moneyInsideCell: summaryBox.y >= cellBox.y && summaryBox.y + summaryBox.height <= cellBox.y + cellBox.height
  };
}

test("last-used notification waits for delayed PATCH before reopening", async ({ page }) => {
  await register(page);
  let patchStarted = false;
  let patchFinished = false;
  await page.route("**/api/settings*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    patchStarted = true;
    await new Promise((resolve) => setTimeout(resolve, 700));
    const response = await route.fetch();
    patchFinished = true;
    await route.fulfill({ response });
  });

  await openAdd(page, "家");
  await page.getByLabel("タイトル").fill("遅延PATCHの家予定");
  await page.getByRole("button", { name: "通知" }).click();
  const notification = page.getByRole("dialog", { name: "通知" });
  await notification.getByLabel("30分前").check();
  await notification.getByRole("button", { name: "この設定にする" }).click();
  const settingsPatch = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "登録" }).click();

  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
  await expect.poll(() => patchStarted).toBe(true);
  expect(patchFinished).toBe(false);
  await expect(page.locator(".event-form button[type='submit']")).toBeDisabled();

  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  expect((await settingsPatch).ok()).toBe(true);
  await expect.poll(() => patchFinished).toBe(true);
  await openAdd(page, "家");
  await expect(page.getByRole("button", { name: "通知" })).toContainText("30分前");
});

test("Calendar geometry stays measured after Event save at both mobile sizes", async ({ page }, testInfo) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const today = todayKey();
  const todayDay = Number(today.slice(-2));
  const categoriesResponse = await page.request.get("/api/money-categories?type=expense");
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json() as { categories: Array<{ id: string }> };
  const moneyResponse = await page.request.post("/api/money", { data: { type: "expense", title: "geometry regression money", plannedAmount: 5200, categoryId: categories.categories[0].id, date: today, memo: null, recurrence: null } });
  expect(moneyResponse.status()).toBe(201);
  for (let index = 0; index < 3; index += 1) await createEvent(page, `geometry fixture ${index + 1}`, today);

  const evidence: Record<string, unknown> = {};
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/calendar");
    await expect(page.locator(".calendar-grid")).toBeVisible();
    const coldStart = await snapshotGeometry(page, todayDay);
    expect(coldStart.moneyInsideCell).toBe(true);
    expect(coldStart.rowCapacity).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: path.join(evidenceDir, `01-cold-start-${viewport.width}x${viewport.height}.png`) });

    await openAdd(page, "家");
    await page.getByLabel("タイトル").fill(`geometry saved ${viewport.width}`);
    await page.getByRole("button", { name: "登録" }).click();
    await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    await expect(page.locator(".calendar-grid")).toBeVisible();
    const afterSave = await snapshotGeometry(page, todayDay);
    expect(afterSave.moneyInsideCell).toBe(true);
    expect(afterSave.rowCapacity).toBe(coldStart.rowCapacity);
    expect(afterSave.moneyBottom).toBeLessThanOrEqual(afterSave.cellBottom + 0.5);
    await page.screenshot({ path: path.join(evidenceDir, `02-after-event-save-${viewport.width}x${viewport.height}.png`) });

    await page.getByRole("button", { name: "デイリー" }).click();
    await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
    await page.getByRole("button", { name: "カレンダー" }).click();
    await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    await expect(page.locator(".calendar-grid")).toBeVisible();
    const afterDailyRoundTrip = await snapshotGeometry(page, todayDay);
    expect(afterDailyRoundTrip.moneyInsideCell).toBe(true);
    expect(afterDailyRoundTrip.rowCapacity).toBe(coldStart.rowCapacity);
    expect(afterDailyRoundTrip.moneyBottom).toBeLessThanOrEqual(afterDailyRoundTrip.cellBottom + 0.5);
    await page.screenshot({ path: path.join(evidenceDir, `03-after-daily-roundtrip-${viewport.width}x${viewport.height}.png`) });

    evidence[`${viewport.width}x${viewport.height}`] = { coldStart, afterSave, afterDailyRoundTrip };
  }
  await testInfo.attach("calendar-geometry.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});
