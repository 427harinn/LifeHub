import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const password = "correct-horse-battery";
const evidenceDir = path.resolve("artifacts/evidence/debug/calendar-date-sheet-delete");
const uniqueEmail = () => `calendar-delete-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("Calendar削除確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function revealEdit(page: import("@playwright/test").Page, title: string) {
  const row = page.getByRole("dialog").locator(".tap-expand-row").filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await row.locator(".tap-expand-row__trigger").click();
  const edit = row.locator(".event-inline-detail").getByRole("button", { name: "編集", exact: true });
  await expect(edit).toBeVisible();
  await edit.click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
  test.describe(`Calendar Date Sheet delete ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("closes Date Sheet before delete confirmation and keeps cancel usable", async ({ page }) => {
      await mkdir(evidenceDir, { recursive: true });
      await registerThroughUi(page);
      const title = `Date Sheet削除 ${viewport.width}`;
      const date = today();
      const response = await page.request.post("/api/events", { data: { category: "home", title, place: null, memo: null, timingType: "scheduled", allDay: false, startDate: date, startTime: "12:00", endDate: date, endTime: "13:00" } });
      expect(response.status()).toBe(201);
      await page.reload();
      await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

      await page.getByRole("button", { name: `${Number(date.slice(-2))}日`, exact: true }).click();
      await expect(page.getByRole("dialog", { name: new RegExp(`${Number(date.slice(-2))}日`) })).toBeVisible();
      await page.screenshot({ path: path.join(evidenceDir, `date-sheet-before-${viewport.width}x${viewport.height}.png`) });
      await revealEdit(page, title);
      await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
      await page.getByRole("button", { name: "削除", exact: true }).click();

      const confirmation = page.getByRole("dialog", { name: "予定を削除" });
      await expect(confirmation).toBeVisible();
      await expect(confirmation.getByRole("button", { name: "削除する", exact: true })).toBeEnabled();
      await expect(page.getByRole("dialog", { name: new RegExp(`${Number(date.slice(-2))}日`) })).toHaveCount(0);
      await page.screenshot({ path: path.join(evidenceDir, `delete-confirm-${viewport.width}x${viewport.height}.png`) });

      await confirmation.getByRole("button", { name: "キャンセル", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

      await page.getByRole("button", { name: `${Number(date.slice(-2))}日`, exact: true }).click();
      await revealEdit(page, title);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      const secondConfirmation = page.getByRole("dialog", { name: "予定を削除" });
      await expect(secondConfirmation).toBeVisible();
      await secondConfirmation.getByRole("button", { name: "削除する", exact: true }).click();
      await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    });
  });
}

test.use({ viewport: { width: 390, height: 844 } });
test("Daily edit delete remains a single-sheet flow", async ({ page }) => {
  await registerThroughUi(page);
  const title = "Daily削除確認";
  const date = today();
  const response = await page.request.post("/api/events", { data: { category: "work", title, place: null, memo: null, timingType: "scheduled", allDay: false, startDate: date, startTime: "14:00", endDate: date, endTime: "15:00" } });
  expect(response.status()).toBe(201);
  await page.goto(`/daily?date=${date}`);
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  const dateSheet = page.getByRole("dialog");
  if (await dateSheet.count()) await dateSheet.getByRole("button", { name: "閉じる", exact: true }).click();
  const row = page.locator(".daily-page .tap-expand-row").filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await row.locator(".tap-expand-row__trigger").click();
  await row.locator(".event-inline-detail").getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "予定を削除" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "削除する", exact: true })).toBeEnabled();
  await confirmation.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
});
