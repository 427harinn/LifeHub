import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve("artifacts/evidence/m10");
const password = "correct-horse-battery";
const uniqueEmail = () => `m10-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M10確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function swipeLeft(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("swipe target is not visible");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 24, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, y, { steps: 8 });
  await page.mouse.up();
}

async function swipeRight(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("swipe target is not visible");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 24, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, y, { steps: 8 });
  await page.mouse.up();
}

test("M10 Money analysis stays calm, readable, and connected to Money", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const year = new Date().getFullYear();
  const today = localDate();
  const categories = await page.request.get("/api/money-categories?includeInactive=false").then(async (response) => { expect(response.ok()).toBeTruthy(); return await response.json() as { categories: Array<{ id: string; type: "expense" | "income" }> }; });
  const expenseCategory = categories.categories.find((category) => category.type === "expense");
  const incomeCategory = categories.categories.find((category) => category.type === "income");
  if (!expenseCategory || !incomeCategory) throw new Error("default Money categories are missing");
  const recurring = await page.request.post("/api/money", { data: { type: "expense", title: "家賃", plannedAmount: 70000, categoryId: expenseCategory.id, date: `${year}-01-01`, memo: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: `${year}-01-01`, endsOn: null } } });
  expect(recurring.ok()).toBeTruthy();
  const recurringMoney = await recurring.json() as { money: { id: string } };
  const income = await page.request.post("/api/money", { data: { type: "income", title: "給料", plannedAmount: 210000, categoryId: incomeCategory.id, date: `${year}-01-01`, memo: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: `${year}-01-01`, endsOn: null } } });
  expect(income.ok()).toBeTruthy();
  const future = await page.request.post("/api/money", { data: { type: "expense", title: "旅行", plannedAmount: 35000, categoryId: expenseCategory.id, date: `${year}-12-15`, memo: null, recurrence: null } });
  expect(future.ok()).toBeTruthy();
  const yearPayload = await page.request.get(`/api/money/year-summary?year=${year}`).then(async (response) => { expect(response.ok()).toBeTruthy(); return await response.json() as { months: Array<{ month: string }>; }; });
  expect(yearPayload.months).toHaveLength(12);
  const january = await page.request.put(`/api/money/${recurringMoney.money.id}/occurrences/money:${recurringMoney.money.id}:${year}-01-01/actual`, { data: { amount: 68000 } });
  expect(january.ok()).toBeTruthy();
  await page.getByRole("button", { name: "お金" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-entry-with-analysis-icon-390x844.png") });
  await page.getByRole("button", { name: "お金の分析を見る" }).click();
  await expect(page.getByRole("heading", { name: "お金の分析" })).toBeVisible();
  await expect(page.getByText("年間の支出見込み")).toBeVisible();
  await expect(page.getByTestId("money-year-chart")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-analysis-forecast-390x844.png") });
  await page.getByRole("button", { name: "実績" }).click();
  await expect(page.getByText("年間の確定支出")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-analysis-actual-390x844.png") });
  await page.getByTestId("money-analysis-month-02").click();
  await expect(page.getByRole("heading", { name: `${year}年2月` })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-analysis-selected-month-390x844.png") });
  await page.getByRole("button", { name: "見込み" }).click();
  const beforeYear = await page.locator(".money-year-selector h2").textContent();
  await swipeRight(page, page.locator(".money-year-selector"));
  await expect(page.locator(".money-year-selector h2")).not.toHaveText(beforeYear ?? "");
  await expect(page.getByText("この年の支出はまだありません")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-analysis-past-empty-390x844.png") });
  await page.getByRole("button", { name: "お金へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "お金の分析を見る" }).click();
  await expect(page.getByRole("heading", { name: "お金の分析" })).toBeVisible();
  await page.getByRole("button", { name: "翌年" }).click();
  await expect(page.locator(".money-year-selector h2")).toHaveText(beforeYear ?? "");
  await expect(page.getByText("年間のまとめ")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: path.join(evidenceDir, "money-analysis-category-bottom-390x844.png") });
  await expect(page.getByRole("button", { name: "お金", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("年間の支出", { exact: true })).toBeVisible();
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
