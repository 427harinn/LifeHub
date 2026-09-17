import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });

const evidenceDir = path.resolve("artifacts/evidence/debug/notification-last-used");
const password = "correct-horse-battery";
const uniqueEmail = () => `last-used-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("自分");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openAdd(page: import("@playwright/test").Page, category: "家" | "仕事") {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: `${category}を追加` }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
}

async function saveEvent(page: import("@playwright/test").Page, title: string) {
  await page.getByLabel("タイトル").fill(title);
  const settingsPatch = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  expect((await settingsPatch).ok()).toBe(true);
}

test("remembers custom, template, separated category defaults, and deleted-template snapshot", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);

  await openAdd(page, "家");
  await page.getByRole("button", { name: "通知" }).click();
  const homeNotification = page.getByRole("dialog", { name: "通知" });
  await homeNotification.getByLabel("30分前").check();
  await homeNotification.getByRole("button", { name: "この設定にする" }).click();
  await saveEvent(page, "家の通知設定");

  await openAdd(page, "家");
  await expect(page.getByRole("button", { name: "通知" })).toContainText("30分前");
  await page.screenshot({ path: path.join(evidenceDir, "home-custom-last-used-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  const templateResponse = await page.request.post("/api/notification-templates", { data: { name: "出勤用", targetCategory: "work", offsets: [60, 30], isDefault: false } });
  expect(templateResponse.status()).toBe(201);
  const template = (await templateResponse.json() as { template: { id: string } }).template;

  await openAdd(page, "仕事");
  await page.getByRole("button", { name: "通知" }).click();
  const workNotification = page.getByRole("dialog", { name: "通知" });
  await workNotification.getByRole("button", { name: /出勤用/ }).click();
  await saveEvent(page, "仕事の通知設定");

  await openAdd(page, "仕事");
  await page.getByRole("button", { name: "通知" }).click();
  const workDefaultNotification = page.getByRole("dialog", { name: "通知" });
  await expect(workDefaultNotification.getByRole("button", { name: /出勤用/ })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: path.join(evidenceDir, "work-template-last-used-390x844.png") });
  await workDefaultNotification.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await openAdd(page, "家");
  await expect(page.getByRole("button", { name: "通知" })).toContainText("30分前");
  await page.screenshot({ path: path.join(evidenceDir, "home-work-separated-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  const deleteResponse = await page.request.delete(`/api/notification-templates/${encodeURIComponent(template.id)}`);
  expect(deleteResponse.status()).toBe(200);
  await openAdd(page, "仕事");
  await expect(page.getByRole("button", { name: "通知" })).toContainText("1時間前、30分前");
  await page.getByRole("button", { name: "通知" }).click();
  const fallbackNotification = page.getByRole("dialog", { name: "通知" });
  await expect(fallbackNotification.getByRole("button", { name: /出勤用/ })).toHaveCount(0);
  await expect(fallbackNotification.getByLabel("1時間前")).toBeChecked();
  await expect(fallbackNotification.getByLabel("30分前")).toBeChecked();
  await page.screenshot({ path: path.join(evidenceDir, "deleted-template-fallback-390x844.png") });
});
