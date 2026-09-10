import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 } });
const evidenceDir = path.resolve("artifacts/evidence/m10-ui-regression");
const password = "correct-horse-battery";
const dateKey = () => new Date().toISOString().slice(0, 10);
const uniqueEmail = () => `m10-ui-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M10 UI確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openMoneyForm(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
}

test("Money UI regression evidence at 390x844", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const today = dateKey();
  await register(page);

  await openMoneyForm(page);
  await page.getByLabel("項目名").fill("電気代");
  await page.getByRole("textbox", { name: "金額" }).fill("10000");
  await page.getByLabel("日付").fill(today);
  await page.getByRole("button", { name: "お金の繰り返し" }).click();
  await page.getByRole("dialog", { name: "繰り返し" }).getByRole("button", { name: "毎月" }).click();
  await page.getByRole("button", { name: "登録", exact: true }).click();

  await page.locator("nav.mobile-nav button[aria-label='お金']").click();
  const row = page.locator(".money-list .event-swipe-row").filter({ hasText: "電気代" }).first();
  await row.locator(".money-list-row").click();
  await expect(row.getByRole("button", { name: "金額を確定" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-planned-detail-full-width-390x844.png") });
  await row.getByRole("button", { name: "金額を確定" }).click();
  const actualSheet = page.getByRole("dialog", { name: "確定額" });
  await actualSheet.getByLabel("確定額").fill("5200");
  await actualSheet.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("button", { name: "確定額を変更" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-confirmed-detail-full-width-390x844.png") });

  await page.getByRole("button", { name: "カレンダー" }).click();
  await page.getByRole("tab", { name: "お金" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-tab-390x844.png") });
  const dayButton = page.getByRole("button", { name: `${Number(today.slice(-2))}日`, exact: true });
  await dayButton.locator(".calendar-cell__date").click();
  const dateSheet = page.getByRole("dialog", { name: /月/ });
  await expect(dateSheet).toContainText("電気代");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-date-sheet-money-normal-390x844.png") });
  const dateRow = dateSheet.locator(".event-swipe-row").filter({ hasText: "電気代" }).first();
  const box = await dateRow.boundingBox();
  if (!box) throw new Error("date sheet money row is not visible");
  await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(dateRow.getByRole("button", { name: "編集" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-date-sheet-money-swipe-390x844.png") });

  await dateSheet.getByRole("button", { name: "閉じる" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-tab-375x812.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "お金", exact: true }).click();
  await openMoneyForm(page);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-direct-date-memo-390x844.png") });
  await page.getByRole("button", { name: "お金の種類" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "money-form-type-sheet-390x844.png") });
  await page.getByRole("dialog", { name: "種類" }).getByRole("button", { name: "支出" }).click();
  await page.getByRole("button", { name: "金額の状態" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "money-form-settlement-sheet-390x844.png") });
});
