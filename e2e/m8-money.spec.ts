import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve("artifacts/evidence/m8");
const password = "correct-horse-battery";
const uniqueEmail = () => `m8-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M8確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function chooseDate(page: import("@playwright/test").Page, date: string) {
  await page.getByLabel("日付").fill(date);
}

async function fillMoney(page: import("@playwright/test").Page, type: "expense" | "income", title: string, amount: string, date: string) {
  if (type === "income") { await page.getByRole("button", { name: "お金の種類" }).click(); await page.getByRole("dialog", { name: "種類" }).getByRole("button", { name: "収入" }).click(); }
  if (type === "income") { await page.getByRole("button", { name: "金額の状態" }).click(); await page.getByRole("dialog", { name: "金額の状態" }).getByRole("button", { name: "予定" }).click(); }
  await page.getByLabel("項目名").fill(title);
  await page.getByLabel("金額", { exact: true }).fill(amount);
  await chooseDate(page, date);
}

async function swipeLeft(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("swipe target is not visible");
  await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("Money MVP recurrence, projections, UI grammar, and swipe actions", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const date = today();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "時間" })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-expense-390x844.png") });
  await page.getByRole("button", { name: /以前の項目から選ぶ/ }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
  await page.getByRole("dialog", { name: "以前の項目から選ぶ" }).getByRole("button", { name: "閉じる" }).click();
  await fillMoney(page, "expense", "家賃", "70000", date);
  await page.getByRole("button", { name: "お金カテゴリ" }).click();
  await page.getByRole("dialog", { name: "カテゴリ" }).getByRole("button", { name: "固定費" }).click();
  await page.getByRole("button", { name: "お金の繰り返し" }).click();
  const recurrenceSheet = page.getByRole("dialog", { name: "繰り返し" });
  await expect(recurrenceSheet.getByRole("button", { name: "毎月" })).toBeVisible();
  await recurrenceSheet.getByRole("button", { name: "毎月" }).click();
  await expect(page.getByRole("button", { name: "お金の繰り返し" })).toContainText("毎月");
  await page.screenshot({ path: path.join(evidenceDir, "money-form-recurrence-monthly-390x844.png") });
  await page.getByRole("button", { name: "登録", exact: true }).click();

  await page.locator("nav.mobile-nav button[aria-label='お金']").click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await expect(page.locator(".money-summary > div:nth-child(1) .money-summary__expense")).toContainText("70,000円");
  await page.screenshot({ path: path.join(evidenceDir, "money-month-summary-recurring-390x844.png") });

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await fillMoney(page, "income", "給料", "210000", date);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-income-390x844.png") });
  await page.getByRole("button", { name: "登録", exact: true }).click();
  await expect(page.locator(".money-summary > div:nth-child(2) .money-summary__income")).toContainText("210,000円");
  await expect(page.locator(".money-summary > div:nth-child(3) .money-summary__income")).toContainText("140,000円");
  await page.screenshot({ path: path.join(evidenceDir, "money-month-summary-390x844.png") });

  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.locator(".money-summary > div:nth-child(1) .money-summary__expense")).toContainText("70,000円");
  await page.screenshot({ path: path.join(evidenceDir, "money-next-month-recurring-390x844.png") });
  await page.getByRole("button", { name: "前の月" }).click();

  await page.getByRole("button", { name: "カレンダー" }).click();
  const dayButton = page.getByRole("button", { name: `${Number(date.slice(-2))}日`, exact: true });
  await expect(dayButton.locator(".calendar-cell__money")).toHaveText("+140,000");
  await page.getByRole("tab", { name: "お金" }).click();
  await expect(dayButton).toContainText("家賃");
  await expect(dayButton).toContainText("給料");
  await expect(dayButton).toContainText("+140,000");
  await dayButton.click();
  const moneySheet = page.getByRole("dialog", { name: /9月/ });
  await expect(moneySheet.locator(".sheet-money-entry")).toHaveCount(2);
  await expect(moneySheet.locator(".sheet-money-summary")).toContainText("+140,000円");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-detail-390x844.png") });
  await moneySheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByText("+140,000円")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-all-money-390x844.png") });
  await page.getByRole("tab", { name: "お金" }).click();
  await expect(page.locator(".daily-money-row").filter({ hasText: "家賃" })).toBeVisible();
  await expect(page.locator(".daily-money-row").filter({ hasText: "給料" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-money-390x844.png") });

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "お金を開く" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await expect(page.getByText("食費")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "settings-money-category-390x844.png") });
  const categoryRow = page.locator(".money-category-settings .event-swipe-row").filter({ hasText: "食費" });
  await swipeLeft(page, categoryRow);
  await expect(categoryRow.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(categoryRow.getByRole("button", { name: "無効化" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "settings-money-category-swipe-390x844.png") });
  await categoryRow.getByRole("button", { name: "編集" }).click();
  await page.getByRole("textbox", { name: "カテゴリ名" }).fill("食費テスト編集");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const editedCategoryRow = page.locator(".money-category-settings .event-swipe-row").filter({ hasText: "食費テスト編集" });
  await swipeLeft(page, editedCategoryRow);
  await editedCategoryRow.getByRole("button", { name: "無効化" }).click();
  await expect(editedCategoryRow).toContainText("（無効）");
  await page.getByText("収入カテゴリ").click();
  await expect(editedCategoryRow.getByRole("button", { name: "編集" })).toHaveCount(0);

  await page.getByRole("button", { name: "お金" }).last().click();
  const moneyRow = page.locator(".money-list .tap-expand-row").filter({ hasText: "家賃" }).first();
  await moneyRow.locator(".money-list-row").click();
  await expect(moneyRow.getByRole("button", { name: "編集" })).toBeVisible();
  await moneyRow.getByRole("button", { name: "編集" }).click();
  await page.getByRole("dialog", { name: "編集する範囲" }).getByRole("button", { name: "すべての項目" }).click();
  await expect(page.getByRole("heading", { name: "お金を編集" })).toBeVisible();
  const movedDate = `${date.slice(0, 8)}15`;
  await chooseDate(page, movedDate);
  await expect(page.getByRole("button", { name: "お金の繰り返し" })).toContainText("毎月15日");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.locator(".money-list-row").filter({ hasText: "家賃" })).toBeVisible();
  const nextMonthDate = new Date(`${movedDate}T00:00:00`);
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.locator(".money-list-row").filter({ hasText: "家賃" })).toBeVisible();
  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await page.getByRole("button", { name: "お金一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
});
