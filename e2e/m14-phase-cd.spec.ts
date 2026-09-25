import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });

const evidenceDir = path.resolve(process.env.M14_EVIDENCE_DIR ?? "artifacts/evidence/m14/phase-cd");
const password = "correct-horse-battery";
const uniqueEmail = () => `m14-cd-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M14 C+D確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function assertNoOverflow(page: import("@playwright/test").Page) {
  const result = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  for (const selector of [".event-form", ".event-form-section", ".input-field", "input", "textarea", "select"]) {
    for (const box of await page.locator(selector).evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { right: rect.right, left: rect.left }; }))) {
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

test("EventForm, MoneyForm, and time row stay inside 375/390/393px", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
  for (const width of [375, 390, 393]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : width === 390 ? 844 : 852 });
    await assertNoOverflow(page);
    const timeRow = page.locator(".event-time-fields");
    expect(await timeRow.locator(".time-input").count()).toBe(2);
    const rowBox = await timeRow.boundingBox();
    const titleBox = await page.getByLabel("タイトル").boundingBox();
    const formBox = await page.locator(".event-form").boundingBox();
    expect(rowBox).not.toBeNull();
    await assertNativeRowsFit(page.locator(".event-form"));
    expect(titleBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    if (titleBox && formBox) expect(titleBox.width).toBeCloseTo(formBox.width, 0);
    if (width === 375 && rowBox) {
      await page.screenshot({ path: path.join(evidenceDir, "time-row-375x812.png"), clip: rowBox });
    }
    await page.screenshot({ path: path.join(evidenceDir, `event-form-${width}x${width === 375 ? 812 : width === 390 ? 844 : 852}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "お金を追加" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("heading", { name: "お金を登録" })).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, "money-form-375x812.png"), fullPage: true });
});

test("BottomSheet focus, inert background, Settings history, and Daily date history", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const addSheet = page.getByRole("dialog", { name: "追加" });
  await expect(addSheet.getByRole("button", { name: "家を追加" })).toBeFocused();
  expect(await page.locator("#root").evaluate((element) => element.inert)).toBe(true);
  await page.screenshot({ path: path.join(evidenceDir, "bottom-sheet-focus-390x844.png"), fullPage: true });
  await page.keyboard.press("Tab");
  await expect(addSheet.getByRole("button", { name: "仕事を追加" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(addSheet.getByRole("button", { name: "家を追加" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addSheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "追加", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  const searchSheet = page.getByRole("dialog", { name: "以前の項目から選ぶ" });
  await expect(searchSheet.getByRole("textbox", { name: "以前の予定を検索" })).toBeFocused();
  await searchSheet.getByRole("textbox", { name: "以前の予定を検索" }).fill("検索");
  await page.screenshot({ path: path.join(evidenceDir, "bottom-sheet-search-mobile-keyboard-390x844.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "カレンダーを開く" }).click();
  await expect(page).toHaveURL(/\/settings\/calendar$/);
  await page.screenshot({ path: path.join(evidenceDir, "settings-detail-390x844.png"), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/settings\/calendar$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "カレンダー", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "デイリー" }).click();
  await page.getByRole("button", { name: "次の日" }).click();
  await expect(page).toHaveURL(/\/daily\?date=\d{4}-\d{2}-\d{2}$/);
  const nextDateUrl = page.url();
  await page.screenshot({ path: path.join(evidenceDir, "daily-url-date-390x844.png"), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/daily$/);
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(nextDateUrl);
  await page.reload();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
});

test("Inline detail edit remains keyboard accessible", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const create = await page.request.post("/api/events", { data: { category: "home", title: "キーボード代替予定", place: null, memo: null, timingType: "scheduled", allDay: false, startDate: today(), startTime: "09:00", endDate: today(), endTime: "10:00" } });
  expect(create.status()).toBe(201);
  await page.getByRole("button", { name: "デイリー" }).click();
  const row = page.locator(".daily-page .tap-expand-row").filter({ hasText: "キーボード代替予定" }).first();
  await expect(row).toBeVisible();
  await row.locator(".tap-expand-row__trigger").focus();
  await page.keyboard.press("Enter");
  await expect(row.locator(".event-inline-detail")).toBeVisible();
  const inlineEdit = row.locator(".event-inline-detail").getByRole("button", { name: "編集", exact: true });
  await expect(inlineEdit).toBeVisible();
  await inlineEdit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "swipe-alternative-edit-390x844.png"), fullPage: true });
});
