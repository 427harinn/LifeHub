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

async function fillMoney(page: import("@playwright/test").Page, type: "expense" | "income", title: string, amount: string, date: string) {
  if (type === "income") await page.getByRole("button", { name: "収入", exact: true }).click();
  await page.getByLabel("タイトル").fill(title);
  await page.getByLabel("金額").fill(amount);
  await page.getByLabel("お金カテゴリ").selectOption({ label: type === "income" ? "給料" : "食費" });
  await page.locator("#money-date").fill(date);
}

test("Money MVP form, month summary, Calendar/Daily adapters, and category settings", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const date = today();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await expect(page.locator(".mobile-nav")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-expense-390x844.png") });
  await page.getByRole("button", { name: /以前の項目から選ぶ/ }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
  await page.getByRole("dialog", { name: "以前の項目から選ぶ" }).getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: /時間を追加/ }).click();
  await page.locator("#money-time").fill("12:30");
  await page.getByRole("button", { name: /メモを追加/ }).click();
  await page.locator("#money-memo").fill("昼食");
  await fillMoney(page, "expense", "ランチ", "1500", date);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await page.getByRole("button", { name: "お金" }).last().click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "＋追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await fillMoney(page, "income", "給料", "210000", date);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-income-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByText("支出見込み")).toBeVisible();
  await expect(page.getByText("208,500円")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-month-summary-390x844.png") });
  await page.locator(".money-list-row").filter({ hasText: "ランチ" }).click();
  await page.getByLabel("タイトル").fill("ランチ編集");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByText("ランチ編集")).toBeVisible();
  await page.locator(".money-list-row").filter({ hasText: "ランチ編集" }).click();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("dialog", { name: "お金を削除" }).getByRole("button", { name: "削除する" }).click();
  await expect(page.getByText("ランチ編集")).toHaveCount(0);
  await expect(page.locator(".money-summary__income").filter({ hasText: "210,000円" }).first()).toBeVisible();

  await page.getByRole("button", { name: "＋追加" }).click();
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await fillMoney(page, "expense", "ランチ", "1500", date);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByText("208,500円")).toBeVisible();

  await page.getByRole("button", { name: "カレンダー" }).click();
  const dayButton = page.getByRole("button", { name: `${Number(date.slice(-2))}日`, exact: true });
  await expect(dayButton.locator(".calendar-cell__money")).toHaveText("+208,500");
  await page.getByRole("tab", { name: "お金" }).click();
  await expect(dayButton).toContainText("食費");
  await expect(dayButton).toContainText("給料");
  await expect(dayButton).toContainText("+208,500");
  await dayButton.click();
  const moneySheet = page.getByRole("dialog");
  await expect(moneySheet.locator(".sheet-money-entry")).toHaveCount(2);
  await expect(moneySheet.locator(".sheet-money-summary")).toContainText("+208,500円");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-detail-390x844.png") });
  await moneySheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByText("+208,500円")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-all-money-390x844.png") });
  await page.getByRole("tab", { name: "お金" }).click();
  await expect(page.getByText("食費")).toBeVisible();
  await expect(page.getByText("給料")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-money-390x844.png") });

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "お金を開く" }).click();
  await expect(page.getByRole("heading", { name: "お金" })).toBeVisible();
  await expect(page.getByText("食費")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "settings-money-category-390x844.png") });
});
