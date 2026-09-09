import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on", launchOptions: { headless: false } });
const evidenceDir = path.resolve(process.env.M7_EVIDENCE_DIR ?? "artifacts/evidence/m7");
const password = "correct-horse-battery";
const uniqueEmail = () => `m7-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M7確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

test("staging notification Settings, Template, EventForm and API smoke", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);

  const publicKey = await page.request.get("/api/notifications/vapid-public-key");
  expect(publicKey.status()).toBe(200);
  const publicKeyBody = await publicKey.json() as { publicKey: string };
  expect(publicKeyBody.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);

  const invalidSubscription = await page.request.post("/api/notifications/subscriptions", { data: { endpoint: "http://invalid.example/push", keys: { p256dh: "AQ", auth: "AQ" } } });
  expect(invalidSubscription.status()).toBe(400);

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "通知を開く" }).click();
  await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();
  await expect(page.getByRole("button", { name: "この端末の通知を変更" })).toContainText("OFF");
  await expect(page.getByRole("button", { name: "朝のまとめ通知を切り替え" })).toContainText("ON");
  await expect(page.getByRole("button", { name: "夜のまとめ通知を切り替え" })).toContainText("ON");
  await page.screenshot({ path: path.join(evidenceDir, "settings-notification-off-390x844.png"), fullPage: true });

  await page.getByRole("button", { name: "通知テンプレートを開く" }).click();
  await expect(page.getByRole("dialog", { name: "通知テンプレート" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "notification-template-list-390x844.png"), fullPage: true });
  await page.getByRole("dialog", { name: "通知テンプレート" }).getByRole("button", { name: "閉じる" }).click();

  const createdTemplateResponse = await page.request.post("/api/notification-templates", { data: { name: "M7標準", offsets: [1440, 30], isDefault: true } });
  expect(createdTemplateResponse.status()).toBe(201);
  const createdTemplate = await createdTemplateResponse.json() as { template: { id: string } };
  const updatedTemplateResponse = await page.request.patch(`/api/notification-templates/${createdTemplate.template.id}`, { data: { name: "M7標準変更", offsets: [60, 30] } });
  expect(updatedTemplateResponse.status()).toBe(200);

  await page.getByRole("button", { name: "通知テンプレートを開く" }).click();
  await expect(page.getByRole("button", { name: /M7標準変更/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "notification-template-edited-390x844.png"), fullPage: true });
  await page.getByRole("dialog", { name: "通知テンプレート" }).getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "カレンダー" }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await page.getByLabel("タイトル").fill("M7通知予定");
  await page.getByRole("button", { name: "通知" }).click();
  await expect(page.getByRole("dialog", { name: "通知" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "通知" }).getByText("30分前", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "event-form-notification-multiple-390x844.png"), fullPage: true });
  await page.getByRole("dialog", { name: "通知" }).getByRole("button", { name: /M7標準変更/ }).click();
  await expect(page.getByRole("button", { name: "通知" })).toContainText("30分前");
  await expect(page.getByRole("button", { name: "通知" })).toContainText("1時間前");
  await page.screenshot({ path: path.join(evidenceDir, "event-form-notification-template-applied-390x844.png"), fullPage: true });

  const eventResponse = await page.request.post("/api/events", { data: { category: "home", title: "M7 API通知", place: null, memo: null, timingType: "scheduled", allDay: false, startDate: "2026-09-20", startTime: "10:00", endDate: "2026-09-20", endTime: "11:00", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, notifications: [1440, 30] } });
  expect(eventResponse.status()).toBe(201);
  const eventBody = await eventResponse.json() as { event: { id: string; notifications: number[] } };
  expect(eventBody.event.notifications).toEqual([1440, 30]);
  const eventGet = await page.request.get(`/api/events/${eventBody.event.id}`);
  expect((await eventGet.json() as { event: { notifications: number[] } }).event.notifications).toEqual([1440, 30]);

  const deletedTemplateResponse = await page.request.delete(`/api/notification-templates/${createdTemplate.template.id}`);
  expect(deletedTemplateResponse.status()).toBe(200);
});

test("staging real browser Push subscription and displayed notification", async ({ page, context }) => {
  await registerThroughUi(page);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173").origin;
  await context.grantPermissions(["notifications"], { origin });
  const capability = await page.evaluate(() => ({
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window
  }));
  test.skip(!capability.serviceWorker || !capability.pushManager || !capability.notification, "このブラウザ実行環境はWeb Push API非対応");
  const subscriptionResult = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { registered: false, permission };
    const current = await registration.pushManager.getSubscription();
    const publicKeyResponse = await fetch("/api/notifications/vapid-public-key");
    const { publicKey } = await publicKeyResponse.json() as { publicKey: string };
    const key = Uint8Array.from(atob(publicKey.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
    const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const response = await fetch("/api/notifications/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys }) });
    return { registered: response.ok, permission };
  });
  expect(subscriptionResult).toEqual({ registered: true, permission: "granted" });

  const pushResponse = await page.request.post("/api/notifications/test", { data: {} });
  expect(pushResponse.status()).toBe(200);
  const pushResult = await pushResponse.json() as { sent: number; failed: number };
  expect(pushResult.sent).toBeGreaterThanOrEqual(1);

  let shown: Array<{ title: string; body: string; url: string }> = [];
  for (let attempt = 0; attempt < 10 && shown.length === 0; attempt += 1) {
    await page.waitForTimeout(1000);
    shown = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const notifications = await registration.getNotifications();
      return notifications.map((notification) => ({ title: notification.title, body: notification.body, url: typeof notification.data?.url === "string" ? notification.data.url : "" }));
    });
  }
  expect(shown).toEqual(expect.arrayContaining([expect.objectContaining({ title: "LifeHub", body: "テスト通知が届きました", url: "/calendar" })]));
  await page.screenshot({ path: path.join(evidenceDir, "real-browser-push-received-390x844.png"), fullPage: true });
});
