import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const uniqueEmail = () => `m2-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const password = "correct-horse-battery";

test("auth, session, navigation and add choice work at the mobile review viewport", async ({ page }) => {
  await expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("自分");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.locator(".shell-tabs")).toBeVisible();
  await expect(page.locator(".calendar-page .screen-header h1")).toHaveText("カレンダー");
  await expect(page.locator(".calendar-page .shell-tabs .shell-tab")).toHaveCount(4);
  await expect(page.locator(".calendar-page .calendar-month h2")).toBeVisible();
  await expect(page.locator(".calendar-page .calendar-weekdays span")).toHaveCount(7);
  await expect(page.locator(".calendar-grid")).toHaveCount(1);
  await expect(page.locator(".calendar-cell")).toHaveCount(42);
  await expect(page.locator(".calendar-today")).toBeVisible();
  await expect(page.locator(".calendar-cell--today .calendar-cell__date")).toBeVisible();
  await expect(page.locator(".calendar-cell--today .calendar-cell__date")).not.toHaveCSS("outline-style", "solid");
  await expect(page.locator(".calendar-cell--selected")).toHaveCount(0);
  const calendarGrid = await page.locator(".calendar-grid").boundingBox();
  expect(calendarGrid?.height ?? 0).toBeGreaterThan(300);
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator(".mobile-nav__button--add")).toBeVisible();
  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.locator(".daily-page .shell-tabs .shell-tab")).toHaveCount(4);
  await expect(page.locator(".daily-page .timeline-section h2")).toHaveText("予定");
  await expect(page.locator(".daily-page .fixture-group")).toHaveCount(0);
  expect(await page.locator(".daily-page .daily-section h2").allTextContents()).toEqual(["今日のお金", "今日のメモ"]);
  await expect(page.getByText("予定はありません", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "お金" }).click();
  await expect(page.getByRole("heading", { name: "お金", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "カレンダーを開く" }).click();
  await expect(page.getByText("Asia/Tokyo")).toBeVisible();
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("dialog", { name: "追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "家を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "仕事を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "お金を追加" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
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
  const settingsPayload = await settings.json() as { settings: { userId: string } };
  expect(settingsPayload.settings.userId).toBeTruthy();
  expect((await page.request.post("/api/auth/login", { data: { email, password: "wrong-password-value" } })).status()).toBe(401);
});
