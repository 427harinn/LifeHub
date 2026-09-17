import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", video: "on" });

const evidenceDir = path.resolve(process.env.M14_EVIDENCE_DIR ?? "artifacts/evidence/m14/phase-ab");
const initialPassword = "correct-horse-battery";
const changedPassword = "new-correct-horse";
const uniqueEmail = () => `m14-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function register(page: import("@playwright/test").Page) {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M14確認");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(initialPassword);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  return email;
}

async function openSettings(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.getByRole("button", { name: label }).click();
}

test("empty Daily and Date Sheet contain only real data at 390x844", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByText("予定はありません", { exact: true })).toBeVisible();
  await expect(page.getByText("書類を整理", { exact: false })).toHaveCount(0);
  await expect(page.getByText("資料をまとめる", { exact: false })).toHaveCount(0);
  await expect(page.getByText("M4の期間予定表示", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "empty-daily-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "カレンダー" }).click();
  await page.locator(".calendar-cell--today .calendar-cell__date").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("予定はありません", { exact: true })).toBeVisible();
  await expect(sheet.getByText("書類を整理", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "empty-date-sheet-390x844.png"), fullPage: true });
});

test("Calendar and Money distinguish API error from empty and recover with retry", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.getByRole("alert")).toHaveText("読み込めませんでした。");
  await expect(page.getByText("予定はありません", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-error-390x844.png"), fullPage: true });
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "再試行" }).click();
  await expect(page.locator(".calendar-grid")).toBeVisible();

  await page.getByRole("button", { name: "お金", exact: true }).click();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.getByRole("alert")).toHaveText("読み込めませんでした。");
  await expect(page.getByText("今月の記録はありません", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "money-error-390x844.png"), fullPage: true });
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "再試行" }).click();
  await expect(page.getByText("今月の記録はありません", { exact: true })).toBeVisible();
});

test("stale Calendar response cannot overwrite the latest navigation", async ({ page }) => {
  await register(page);
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const initialMonth = await page.locator(".calendar-month h2").textContent();
  let calendarRequests = 0;
  let releaseFirst: (() => void) | undefined;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route((url) => url.pathname === "/api/calendar" && url.searchParams.has("month"), async (route) => {
    calendarRequests += 1;
    if (calendarRequests === 1) await firstResponse;
    await route.continue();
  });
  await page.getByRole("button", { name: "次の月" }).click();
  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await page.getByRole("button", { name: "カレンダー" }).click();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  releaseFirst?.();
  await expect(page.locator(".calendar-month h2")).not.toHaveText(initialMonth ?? "");
  expect(calendarRequests).toBeGreaterThanOrEqual(2);
});

test("password change validates, gives success feedback, and preserves session", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  const email = await register(page);
  await openSettings(page, "アカウントを開く");
  await page.getByLabel("現在のパスワード").fill(initialPassword);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(changedPassword);
  await page.getByLabel("新しいパスワード（確認）").fill(changedPassword);
  const submit = page.getByRole("button", { name: "パスワードを変更" });
  await submit.click();
  await expect(page.getByRole("status")).toContainText("パスワードを変更しました");
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: path.join(evidenceDir, "password-change-success-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  expect((await page.request.post("/api/auth/login", { data: { email, password: initialPassword } })).status()).toBe(401);
  expect((await page.request.post("/api/auth/login", { data: { email, password: changedPassword } })).status()).toBe(200);
});

test("Notification rows use one shared chevron and expose template retry state", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await openSettings(page, "通知を開く");
  const rows = page.locator(".notification-settings .form-row");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row.locator(".form-row__chevron")).toHaveCount(1);
    expect((await row.innerText()).match(/[›>]/g)?.length ?? 0).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: path.join(evidenceDir, "notification-chevron-390x844.png"), fullPage: true });
});

test("Calendar settings update timezone and week start through selection sheets", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await openSettings(page, "カレンダーを開く");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-settings-390x844.png"), fullPage: true });
  await page.getByRole("button", { name: "週の開始を変更" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "日曜日" }).click();
  await expect(page.getByRole("button", { name: "週の開始を変更" })).toContainText("日曜日");
  await page.getByRole("button", { name: "タイムゾーンを変更" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "UTC" }).click();
  await expect(page.getByRole("button", { name: "タイムゾーンを変更" })).toContainText("UTC");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-settings-updated-390x844.png"), fullPage: true });
});

test("Money category color swatch saves colorKey and appears in the donut legend", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  await openSettings(page, "お金を開く");
  await page.getByRole("button", { name: "カテゴリを追加" }).click();
  await page.getByRole("textbox", { name: "新しいカテゴリ名" }).fill("M14確認色");
  await expect(page.getByRole("radiogroup", { name: "新しいカテゴリ色" })).toBeVisible();
  const blue = page.getByRole("button", { name: "ブルー" });
  await blue.click();
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: path.join(evidenceDir, "money-category-swatch-390x844.png"), fullPage: true });
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("M14確認色", { exact: true })).toBeVisible();

  const categoriesResponse = await page.request.get("/api/money-categories?includeInactive=false");
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json() as { categories: Array<{ id: string; name: string; colorKey: string }> };
  const category = categories.categories.find((item) => item.name === "M14確認色");
  expect(category?.colorKey).toBe("blue");
  const moneyResponse = await page.request.post("/api/money", { data: { type: "expense", title: "M14色確認", plannedAmount: 1200, categoryId: category?.id, date: today(), memo: null, recurrence: null } });
  expect(moneyResponse.status()).toBe(201);
  await page.getByRole("button", { name: "お金", exact: true }).click();
  await expect(page.getByText("M14色確認", { exact: true })).toBeVisible();
  await expect(page.locator('[data-color-key="blue"]').first()).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-category-donut-390x844.png"), fullPage: true });
});
