import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.use({ viewport: { width: 390, height: 844 } });

const evidenceDir = path.resolve("artifacts/evidence/m2");
const uniqueEmail = () => `m2-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const password = "correct-horse-battery";

test("auth, session, navigation and add choice work at the mobile review viewport", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "login-390x844.png") });

  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("自分");
  const email = uniqueEmail();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  const navStyle = await page.locator(".mobile-nav").evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderTopWidth: style.borderTopWidth, boxShadow: style.boxShadow };
  });
  expect(navStyle).toEqual({ backgroundColor: "rgb(255, 255, 255)", borderTopWidth: "1px", boxShadow: "none" });
  const addStyle = await page.locator(".mobile-nav__button--add").evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow, minHeight: style.minHeight };
  });
  expect(addStyle).toEqual({ backgroundColor: "rgba(0, 0, 0, 0)", boxShadow: "none", minHeight: "48px" });
  await page.screenshot({ path: path.join(evidenceDir, "calendar-390x844.png") });
  await expect(page.getByRole("tab", { name: "すべて" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("週またぎ", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".calendar-cell__count").first()).toHaveText(/^\d+$/);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-multi-day-390x844.png") });
  await page.getByRole("tab", { name: "仕事" }).click();
  await expect(page.getByText("週またぎ", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("移動", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-week-crossing-390x844.png") });
  await page.getByRole("tab", { name: "すべて" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-tabs-390x844.png") });
  await page.getByRole("button", { name: "7日", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "2026年9月7日" })).toBeVisible();
  await expect(page.getByRole("button", { name: "当日に追加" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-date-sheet-390x844.png") });
  await page.getByRole("dialog", { name: "2026年9月7日" }).getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByRole("dialog", { name: "検索" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "検索" }).getByRole("textbox", { name: "予定を検索" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "検索" }).getByRole("button", { name: /出張/ })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-search-390x844.png") });
  await page.getByRole("dialog", { name: "検索" }).getByRole("button", { name: /出張/ }).click();
  await expect(page.getByRole("dialog", { name: "2026年9月10日" })).toBeVisible();
  await page.getByRole("dialog", { name: "2026年9月10日" }).getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.getByText("家の予定")).toBeVisible();
  await expect(page.getByText("今週中：書類を整理")).toBeVisible();
  await expect(page.getByText("今日のメモ")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-390x844.png") });
  await page.locator(".daily-section").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, "daily-summary-390x844.png") });

  await page.getByRole("button", { name: "お金" }).click();
  await expect(page.getByRole("heading", { name: "お金" })).toBeVisible();
  await expect(page.getByText("支出見込み")).toBeVisible();
  await expect(page.getByText("収入見込み")).toBeVisible();
  await expect(page.getByText("残りそう")).toBeVisible();
  await expect(page.getByText("家賃")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "money-390x844.png") });

  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントを開く" })).toBeVisible();
  await expect(page.getByRole("button", { name: "通知を開く" })).toBeVisible();
  await expect(page.getByRole("button", { name: "カレンダーを開く" })).toBeVisible();
  await expect(page.getByRole("button", { name: "お金を開く" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "settings-390x844.png") });

  await page.getByRole("button", { name: "カレンダーを開く" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー", exact: true })).toBeVisible();
  await expect(page.getByText("Asia/Tokyo")).toBeVisible();
  await expect(page.getByText("月曜日")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "settings-detail-390x844.png") });
  await page.getByRole("button", { name: "設定へ戻る" }).click();
  await page.getByRole("button", { name: "アカウントを開く" }).click();
  await expect(page.getByRole("heading", { name: "アカウント", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("dialog", { name: "追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "家を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "仕事を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "お金を追加" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(evidenceDir, "add-choice-390x844.png") });
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("status")).toContainText("家の追加");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
});

test("login failure and settings ownership are enforced by the Worker", async ({ page }) => {
  const email = uniqueEmail();
  const registration = await page.request.post("/api/auth/register", { data: { displayName: "自分", email, password } });
  expect(registration.status()).toBe(201);
  await page.request.post("/api/auth/logout");
  const successfulLogin = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(successfulLogin.status()).toBe(200);
  const settings = await page.request.get("/api/settings");
  expect(settings.status()).toBe(200);
  const settingsPayload = await settings.json() as { settings: { userId: string; timezone: string; weekStartsOn: number; morningSummaryTime: string; eveningSummaryTime: string; periodDefaultDeadlineTime: string } };
  expect(settingsPayload.settings).toMatchObject({ timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryTime: "09:00", eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00" });
  const badLogin = await page.request.post("/api/auth/login", { data: { email, password: "wrong-password-value" } });
  expect(badLogin.status()).toBe(401);
  const state = await page.request.get("/api/user-state");
  expect(state.status()).toBe(200);
  const statePayload = await state.json() as { state: { userId: string; migrationState: string } };
  expect(statePayload.state).toMatchObject({ migrationState: "active" });
  expect(statePayload.state.userId).toBe(settingsPayload.settings.userId);
});
