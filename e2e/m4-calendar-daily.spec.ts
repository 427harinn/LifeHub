import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });

const evidenceDir = path.resolve("artifacts/evidence/m4");
const password = "correct-horse-battery";
const uniqueEmail = () => `m4-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const isoToday = () => new Date().toISOString().slice(0, 10);
const shiftDate = (date: string, days: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const dateNumber = (date: string) => Number(date.slice(-2));

type EventInput = { category: "home" | "work"; title: string; startDate: string; endDate: string; startTime?: string | null; endTime?: string | null; allDay?: boolean; place?: string | null; memo?: string | null };

const createEvent = async (page: import("@playwright/test").Page, input: EventInput) => {
  const response = await page.request.post("/api/events", { data: { place: null, memo: null, timingType: "scheduled", allDay: false, startTime: "09:00", endTime: "10:00", ...input } });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ event: { id: string } }>;
};

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M4確認");
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

test("Calendar range projection, Date Sheet to Daily, navigation and DailyNote", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  const today = isoToday();
  const todayDay = dateNumber(today);

  await createEvent(page, { category: "home", title: "朝の家予定", startDate: today, endDate: today, startTime: "08:00", endTime: "09:00", place: "駅", memo: "持ち物" });
  await createEvent(page, { category: "work", title: "仕事の予定", startDate: today, endDate: today, startTime: "10:00", endTime: "11:00" });
  await createEvent(page, { category: "home", title: "週またぎ家", startDate: shiftDate(today, -2), endDate: shiftDate(today, 2), allDay: true, startTime: null, endTime: null });
  await createEvent(page, { category: "work", title: "週またぎ仕事", startDate: shiftDate(today, -1), endDate: shiftDate(today, 5), allDay: true, startTime: null, endTime: null });
  await createEvent(page, { category: "home", title: "重なり帯", startDate: shiftDate(today, -1), endDate: shiftDate(today, 3), allDay: true, startTime: null, endTime: null });
  for (let index = 0; index < 6; index += 1) await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `多数予定${index + 1}`, startDate: today, endDate: today, startTime: `${String(12 + index).padStart(2, "0")}:00`, endTime: `${String(12 + index).padStart(2, "0")}:30` });
  for (let index = 0; index < 5; index += 1) await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `候補比較${index + 1}`, startDate: shiftDate(today, 10), endDate: shiftDate(today, 10), startTime: `${String(8 + index).padStart(2, "0")}:00`, endTime: `${String(8 + index).padStart(2, "0")}:30` });

  const calendarResponse = await page.request.get(`/api/calendar?month=${today.slice(0, 7)}`);
  expect(calendarResponse.status()).toBe(200);
  const calendarPayload = await calendarResponse.json() as { range: { startDate: string; endDate: string }; events: Array<{ title: string }> };
  expect(calendarPayload.range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(calendarPayload.range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(calendarPayload.events.map((event) => event.title)).toContain("週またぎ家");

  await page.request.put(`/api/daily-notes/${today}`, { data: { content: "実データの今日メモ" } });
  await page.reload();
  await expect(page.locator(".calendar-cell")).toHaveCount(42);
  await expect(page.locator(".calendar-band--home").first()).toBeVisible();
  await expect(page.locator(".calendar-band--work").first()).toBeVisible();
  await expect(page.locator(".calendar-cell__count").first()).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-high-390x844.png") });

  const candidateDay = dateNumber(shiftDate(today, 10));
  for (const candidate of [2, 3, 4]) {
    await page.goto(`/calendar?calendarMax=${candidate}`);
    await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    await expect(page.getByRole("button", { name: `${candidateDay}日`, exact: true }).locator(".calendar-cell__count")).toHaveText(String(5 - candidate));
    await page.screenshot({ path: path.join(evidenceDir, `calendar-max-${candidate}-390x844.png`) });
  }

  await page.goto("/calendar");
  const initialMonth = await page.locator(".calendar-month h2").textContent();
  const calendarBox = await page.locator(".calendar-grid").boundingBox();
  if (!calendarBox) throw new Error("Calendar bounds unavailable");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-month-swipe-before-390x844.png") });
  await page.mouse.move(calendarBox.x + 270, calendarBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(calendarBox.x + 190, calendarBox.y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".calendar-month h2")).not.toHaveText(initialMonth ?? "");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-month-swipe-after-390x844.png") });
  await page.getByRole("button", { name: "前の月", exact: true }).click();
  await expect(page.locator(".calendar-month h2")).toHaveText(initialMonth ?? "");
  await page.getByRole("button", { name: `${todayDay}日`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: new RegExp(`${todayDay}日`) })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-390x844.png") });
  await page.getByRole("dialog").getByRole("button", { name: "1日の詳細を見る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.locator(".daily-date-label")).toHaveText(`${Number(today.slice(5, 7))}月${todayDay}日`);
  await expect(page.getByText("実データの今日メモ", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-normal-390x844.png") });

  await page.getByRole("button", { name: "前の日" }).click();
  await expect(page.locator(".daily-date-label")).toHaveText(`${Number(shiftDate(today, -1).slice(5, 7))}月${dateNumber(shiftDate(today, -1))}日`);
  await page.getByRole("button", { name: "次の日" }).click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".daily-date-label")).toHaveText(`${Number(today.slice(5, 7))}月${todayDay}日`);

  const eventRow = page.locator(".event-swipe-row").filter({ hasText: "朝の家予定" }).first();
  await eventRow.locator(".event-swipe-row__main").click();
  await expect(eventRow.locator(".event-inline-detail")).toContainText("駅");
  await page.screenshot({ path: path.join(evidenceDir, "daily-expanded-390x844.png") });
  const rowBox = await eventRow.boundingBox();
  if (!rowBox) throw new Error("Daily row bounds unavailable");
  await page.mouse.move(rowBox.x + 250, rowBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(rowBox.x + 170, rowBox.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(eventRow.getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-swipe-edit-390x844.png") });
  await eventRow.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();

  await page.getByRole("button", { name: "今日のメモを編集" }).click();
  await page.getByLabel("今日のメモ").fill("更新した今日メモ");
  await page.screenshot({ path: path.join(evidenceDir, "daily-note-edit-390x844.png") });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("更新した今日メモ", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/daily?date=${today}`)).status()).toBe(200);
  expect((await page.request.delete(`/api/daily-notes/${today}`)).status()).toBe(200);
  const emptyNote = await page.request.get(`/api/daily?date=${today}`);
  expect((await emptyNote.json() as { dailyNote: unknown }).dailyNote).toBeNull();
});

test("Calendar and Daily add preserve returnTo date", async ({ page }) => {
  await registerThroughUi(page);
  const today = isoToday();
  const dayNumber = dateNumber(today);
  await createEvent(page, { category: "home", title: "低密度単日", startDate: shiftDate(today, 10), endDate: shiftDate(today, 10), startTime: "14:00", endTime: "15:00" });
  await page.reload();
  await expect(page.getByText("低密度単日", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-low-390x844.png") });
  await page.getByRole("button", { name: `${dayNumber}日`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "当日に追加" }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.locator(".event-form").getByRole("button", { name: /^日付/ })).toContainText(`${dayNumber}`);
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  await page.getByRole("button", { name: `${dayNumber}日`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "1日の詳細を見る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await openAdd(page, "仕事");
  await expect(page.locator(".event-form").getByRole("button", { name: /^日付/ })).toContainText(`${dayNumber}`);
  const form = page.locator(".event-form");
  for (const option of ["予定の種類", "繰り返し", "通知"]) {
    await form.getByRole("button", { name: option, exact: true }).click();
    await expect(page.getByRole("dialog", { name: option })).toBeVisible();
    await page.getByRole("button", { name: `${option}を閉じる` }).click();
  }
  await form.getByRole("button", { name: "以前の項目から選ぶ", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "以前の項目から選ぶ" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  const controlFontSizes = await form.locator("input:not([type='checkbox']), textarea, select").evaluateAll((controls) => controls.map((control) => Number.parseFloat(getComputedStyle(control).fontSize)));
  expect(controlFontSizes.length).toBeGreaterThan(0);
  expect(Math.min(...controlFontSizes)).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: path.join(evidenceDir, "form-tap-targets-zoom-prevention-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
});
