import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidenceDir = path.resolve("artifacts/evidence/eventform-date-time-input-layout");
const password = "correct-horse-battery";
const uniqueEmail = () => `eventform-layout-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("EventFormレイアウト確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openEventForm(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
}

async function assertNoOverflow(page: import("@playwright/test").Page) {
  const result = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  for (const selector of [".event-form", ".date-input", ".event-time-fields", "input", "textarea", "select"]) {
    for (const box of await page.locator(selector).evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }))) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(result.clientWidth + 1);
    }
  }
}

async function assertNativeRowsFit(scope: import("@playwright/test").Locator) {
  const rows = await scope.locator(".date-input, .time-input").evaluateAll((elements) => elements.map((element) => {
    const row = element.getBoundingClientRect();
    const input = element.querySelector("input")?.getBoundingClientRect();
    return input ? { rowLeft: row.left, rowRight: row.right, top: row.top, bottom: row.bottom, inputLeft: input.left, inputRight: input.right, inputTop: input.top, inputBottom: input.bottom } : null;
  }).filter((value): value is NonNullable<typeof value> => value !== null));
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.inputLeft).toBeGreaterThanOrEqual(row.rowLeft - 1);
    expect(row.inputRight).toBeLessThanOrEqual(row.rowRight + 1);
    expect(row.inputTop).toBeGreaterThanOrEqual(row.top - 1);
    expect(row.inputBottom).toBeLessThanOrEqual(row.bottom + 1);
  }
  const sortedRows = [...rows].sort((left, right) => left.top - right.top);
  for (let index = 1; index < sortedRows.length; index += 1) {
    expect(sortedRows[index - 1].bottom).toBeLessThanOrEqual(sortedRows[index].top + 1);
  }
}

test("EventForm date/time inputs stay within mobile rows at both widths", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  await openEventForm(page);

  for (const [width, height] of [[390, 844], [375, 812]] as const) {
    await page.setViewportSize({ width, height });
    await assertNoOverflow(page);
    await assertNativeRowsFit(page.locator(".event-form"));
    expect(await page.locator(".event-time-fields .time-input").count()).toBe(2);
    const titleWidth = await page.getByLabel("タイトル").evaluate((element) => element.getBoundingClientRect().width);
    const formWidth = await page.locator(".event-form").evaluate((element) => element.getBoundingClientRect().width);
    expect(titleWidth).toBeCloseTo(formWidth, 0);
    await page.screenshot({ path: path.join(evidenceDir, `scheduled-${width}x${height}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "予定の種類" }).click();
  await page.getByRole("dialog", { name: "予定の種類" }).getByRole("button", { name: "期間中にやりたい" }).click();
  await page.getByRole("button", { name: "実施時期" }).click();
  await page.getByRole("dialog", { name: "実施時期" }).getByRole("button", { name: "日付範囲を指定" }).click();
  await assertNoOverflow(page);
  await assertNativeRowsFit(page.locator(".event-form"));
  await page.screenshot({ path: path.join(evidenceDir, "period-custom-range-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "予定の種類" }).click();
  await page.getByRole("dialog", { name: "予定の種類" }).getByRole("button", { name: "日時が決まっている" }).click();
  await page.getByRole("button", { name: "繰り返し" }).click();
  const recurrenceSheet = page.getByRole("dialog", { name: "繰り返し" });
  await recurrenceSheet.getByRole("button", { name: "カスタム" }).click();
  await page.getByRole("button", { name: "終了設定" }).click();
  await recurrenceSheet.getByRole("button", { name: "終了日を指定" }).click();
  await assertNoOverflow(page);
  await assertNativeRowsFit(recurrenceSheet);
  await page.screenshot({ path: path.join(evidenceDir, "recurrence-ends-on-390x844.png"), fullPage: true });
});
