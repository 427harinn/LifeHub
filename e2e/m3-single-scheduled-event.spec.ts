import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve("artifacts/evidence/m3");
const password = "correct-horse-battery";
const uniqueEmail = () => `m3-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const isoToday = () => new Date().toISOString().slice(0, 10);
const nextDate = (date: string, days: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

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
  await expect(page.locator(".mobile-nav")).toHaveCount(0);
}

test("creates, displays, edits and soft-deletes home and work scheduled Events", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  const today = isoToday();
  const dayNumber = Number(today.slice(-2));

  await openAdd(page, "家");
  await page.getByLabel("タイトル").fill("買い物");
  await page.getByLabel("開始時間").fill("12:00");
  await page.getByLabel("終了時間").fill("13:00");
  await page.screenshot({ path: path.join(evidenceDir, "home-timed-form-390x844.png") });
  await page.getByRole("button", { name: "場所を追加" }).click();
  await page.getByLabel("場所").fill("小倉駅");
  await page.getByRole("button", { name: "メモを追加" }).click();
  await page.getByLabel("メモ").fill("牛乳と洗剤を買う");
  await page.screenshot({ path: path.join(evidenceDir, "place-memo-expanded-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.getByText("買い物", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-after-create-390x844.png") });

  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  const homeRow = page.locator(".event-swipe-row").filter({ hasText: "買い物" }).first();
  await homeRow.locator(".event-swipe-row__main").click();
  await expect(homeRow.locator(".event-inline-detail")).toContainText("小倉駅");
  await expect(homeRow.locator(".event-inline-detail")).toContainText("牛乳と洗剤を買う");
  await expect(homeRow.locator(".event-inline-detail")).not.toContainText("場所");
  await expect(homeRow.locator(".event-inline-detail")).not.toContainText("メモ");
  await expect(homeRow.locator(".event-inline-detail .text-button")).toHaveCount(0);
  await expect(homeRow.locator(".event-swipe-row__main")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: path.join(evidenceDir, "daily-home-expanded-390x844.png") });
  await page.getByRole("button", { name: "カレンダー" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await page.getByRole("button", { name: `${dayNumber}日`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: new RegExp(`${dayNumber}日`) })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-date-sheet-390x844.png") });
  await page.getByRole("dialog").getByRole("button", { name: /買い物/ }).click();
  await expect(page.getByRole("heading", { name: "予定の詳細" })).toBeVisible();
  await expect(page.getByText("小倉駅")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "event-detail-390x844.png") });
  await page.getByRole("button", { name: "編集" }).click();
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await page.getByLabel("タイトル").fill("買い物（変更）");
  await page.screenshot({ path: path.join(evidenceDir, "event-edit-390x844.png") });
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByText("買い物（変更）", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: `${dayNumber}日`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /買い物（変更）/ }).click();
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("dialog", { name: "予定を削除" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "delete-confirm-390x844.png") });
  await page.getByRole("dialog", { name: "予定を削除" }).getByRole("button", { name: "削除する" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await openAdd(page, "仕事");
  await page.getByLabel("タイトル").fill("定例ミーティング");
  await page.getByLabel("開始時間").fill("10:00");
  await page.getByLabel("終了時間").fill("11:00");
  await page.getByRole("button", { name: "場所を追加" }).click();
  await page.getByLabel("場所").fill("会議室A");
  await page.getByRole("button", { name: "メモを追加" }).click();
  await page.getByLabel("メモ").fill("資料を事前に確認");
  await page.screenshot({ path: path.join(evidenceDir, "work-timed-form-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.getByText("定例ミーティング", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  const workRow = page.locator(".event-swipe-row").filter({ hasText: "定例ミーティング" }).first();
  await workRow.locator(".event-swipe-row__main").click();
  await expect(workRow.locator(".event-inline-detail")).toContainText("会議室A");
  await expect(workRow.locator(".event-inline-detail")).toContainText("資料を事前に確認");
  await page.screenshot({ path: path.join(evidenceDir, "daily-work-expanded-390x844.png") });
});

test("all-day, multi-day, recent definitions, Daily and returnTo work", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  const today = isoToday();
  const dayNumber = Number(today.slice(-2));

  await openAdd(page, "家");
  await page.getByLabel("タイトル").fill("終日の予定");
  await page.getByRole("checkbox").check();
  await expect(page.getByLabel("開始時間")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "all-day-form-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await openAdd(page, "仕事");
  await page.getByLabel("タイトル").fill("複数日の予定");
  await page.getByRole("button", { name: /日付/ }).click();
  await page.getByRole("button", { name: "終了日を追加" }).click();
  await page.getByLabel("終了日").fill(nextDate(today, 2));
  await page.getByRole("button", { name: "この日付にする" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "multi-day-form-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.locator(".calendar-band--work")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "multi-day-calendar-390x844.png") });

  await openAdd(page, "仕事");
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("複数日の予定", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "recent-390x844.png") });
  await page.getByRole("dialog").getByRole("button", { name: /複数日の予定/ }).click();
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByText("終日の予定", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-390x844.png") });
  const allDayRow = page.locator(".event-swipe-row").filter({ hasText: "終日の予定" }).first();
  await allDayRow.locator(".event-swipe-row__main").click();
  await expect(allDayRow.locator(".event-inline-detail")).toBeVisible();
  await expect(page.getByRole("heading", { name: "予定の詳細" })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "daily-expanded-first-390x844.png") });
  await allDayRow.locator(".event-swipe-row__main").click();
  await expect(allDayRow.locator(".event-inline-detail")).toHaveCount(0);
  const multiDayRow = page.locator(".event-swipe-row").filter({ hasText: "複数日の予定" }).first();
  await multiDayRow.locator(".event-swipe-row__main").click();
  await expect(multiDayRow.locator(".event-inline-detail")).toContainText("9月");
  await expect(allDayRow.locator(".event-inline-detail")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "daily-expanded-second-390x844.png") });
  const multiDayBox = await multiDayRow.boundingBox();
  if (!multiDayBox) throw new Error("Daily Event row bounds unavailable");
  await page.mouse.move(multiDayBox.x + 250, multiDayBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(multiDayBox.x + 170, multiDayBox.y + 24, { steps: 4 });
  await page.mouse.up();
  const revealedEdit = multiDayRow.locator(".event-swipe-row__actions").getByRole("button", { name: "編集", exact: true });
  await expect(revealedEdit).toBeVisible();
  await expect(multiDayRow.locator(".event-inline-detail")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "daily-swipe-edit-390x844.png") });
  await allDayRow.locator(".event-swipe-row__main").click();
  await expect(multiDayRow.locator(".event-swipe-row__actions")).toHaveCount(0);
  await expect(allDayRow.locator(".event-inline-detail")).toBeVisible();
  await allDayRow.locator(".event-swipe-row__main").click();
  await multiDayRow.locator(".event-swipe-row__main").click();
  const secondRevealedEdit = multiDayRow.locator(".event-swipe-row__actions").getByRole("button", { name: "編集", exact: true });
  const secondMultiDayBox = await multiDayRow.boundingBox();
  if (!secondMultiDayBox) throw new Error("Daily Event row bounds unavailable after closing another row");
  await page.mouse.move(secondMultiDayBox.x + 250, secondMultiDayBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(secondMultiDayBox.x + 170, secondMultiDayBox.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(secondRevealedEdit).toBeVisible();
  await secondRevealedEdit.click();
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await expect(page.getByRole("button", { name: "削除", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-edit-form-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await page.locator(".mobile-nav__button--add").click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("button", { name: "日付" })).toContainText(`${dayNumber}`);
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
});

test("Event CRUD routes enforce userId ownership", async ({ page, browser }) => {
  const emailA = uniqueEmail();
  const registration = await page.request.post("/api/auth/register", { data: { displayName: "A", email: emailA, password } });
  expect(registration.status()).toBe(201);
  const input = { category: "home", title: "所有権テスト", place: null, memo: null, timingType: "scheduled", allDay: false, startDate: "2026-09-20", startTime: "15:00", endDate: "2026-09-20", endTime: "16:00" };
  const created = await page.request.post("/api/events", { data: input });
  expect(created.status()).toBe(201);
  const createdPayload = await created.json() as { event: { id: string } };
  const eventId = createdPayload.event.id;
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const emailB = uniqueEmail();
  expect((await otherPage.request.post("/api/auth/register", { data: { displayName: "B", email: emailB, password } })).status()).toBe(201);
  expect((await otherPage.request.get(`/api/events/${eventId}`)).status()).toBe(404);
  expect((await otherPage.request.patch(`/api/events/${eventId}`, { data: input })).status()).toBe(404);
  expect((await otherPage.request.delete(`/api/events/${eventId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(200);
  await otherContext.close();
});
