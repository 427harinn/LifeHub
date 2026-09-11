import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 } });

const evidenceDir = path.resolve("artifacts/evidence/money-category-colors");
const password = "correct-horse-battery";
const uniqueEmail = () => `money-colors-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("Money色確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function createExpense(page: import("@playwright/test").Page, categoryId: string, title: string, amount: number, date: string) {
  const response = await page.request.post("/api/money", { data: { type: "expense", title, plannedAmount: amount, categoryId, date, memo: null, recurrence: null } });
  expect(response.ok()).toBeTruthy();
}

async function showMoneyChart(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "お金" }).last().click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  const chart = page.locator(".money-chart-section");
  await chart.scrollIntoViewIfNeeded();
  return chart;
}

test("keeps Money category colors distinct and stable across UI surfaces", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const date = today();
  const categoriesResponse = await page.request.get("/api/money-categories?type=expense");
  const categories = (await categoriesResponse.json() as { categories: Array<{ id: string; name: string }> }).categories;
  const categoryId = (name: string) => categories.find((category) => category.name === name)?.id ?? (() => { throw new Error(`missing category: ${name}`); })();

  await createExpense(page, categoryId("食費"), "食費の支出", 1200, date);
  let chart = await showMoneyChart(page);
  await expect(chart.locator(".money-chart__legend > div")).toHaveCount(1);
  await page.screenshot({ path: path.join(evidenceDir, "one-category-food-390x844.png") });

  await createExpense(page, categoryId("固定費"), "固定費の支出", 5000, date);
  await page.reload();
  chart = await showMoneyChart(page);
  await expect(chart.locator(".money-chart__legend > div")).toHaveCount(2);
  await page.screenshot({ path: path.join(evidenceDir, "two-categories-food-fixed-390x844.png") });

  await createExpense(page, categoryId("日用品"), "日用品の支出", 2400, date);
  await page.reload();
  chart = await showMoneyChart(page);
  await expect(chart.locator(".money-chart__legend > div")).toHaveCount(3);
  const expectedColors = { "食費": "orange", "固定費": "blue", "日用品": "green" };
  for (const [name, colorKey] of Object.entries(expectedColors)) {
    await expect(chart.locator(".money-chart__legend > div").filter({ hasText: name }).locator(".money-chart__legend-dot")).toHaveAttribute("data-color-key", colorKey);
  }
  const donutStyle = await chart.locator(".money-donut").getAttribute("style");
  expect(donutStyle).toContain("#d47b4f");
  expect(donutStyle).toContain("#527c9c");
  expect(donutStyle).toContain("#5f8b6d");
  await page.screenshot({ path: path.join(evidenceDir, "three-categories-food-fixed-daily-390x844.png") });

  const foodLegendColor = await chart.locator(".money-chart__legend > div").filter({ hasText: "食費" }).locator(".money-chart__legend-dot").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "お金を開く" }).click();
  const foodSettingsDot = page.locator(".money-category-settings .money-category-row").filter({ hasText: "食費" }).locator(".money-category-dot");
  await expect(foodSettingsDot).toHaveAttribute("data-color-key", "orange");
  await expect(foodSettingsDot).toHaveCSS("background-color", foodLegendColor);
  await page.screenshot({ path: path.join(evidenceDir, "settings-colors-match-390x844.png") });

  await page.getByRole("button", { name: "お金" }).last().click();
  chart = await showMoneyChart(page);
  const beforeReload = await chart.locator(".money-chart__legend-dot").evaluateAll((dots) => dots.map((dot) => dot.getAttribute("data-color-key")));
  await page.reload();
  chart = await showMoneyChart(page);
  const afterReload = await chart.locator(".money-chart__legend-dot").evaluateAll((dots) => dots.map((dot) => dot.getAttribute("data-color-key")));
  expect(afterReload).toEqual(beforeReload);
  await page.getByRole("button", { name: "次の月" }).click();
  await page.getByRole("button", { name: "前の月" }).click();
  chart = await showMoneyChart(page);
  const afterMonthMove = await chart.locator(".money-chart__legend-dot").evaluateAll((dots) => dots.map((dot) => dot.getAttribute("data-color-key")));
  expect(afterMonthMove).toEqual(beforeReload);
});
