import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });
const evidenceDir = path.resolve("artifacts/evidence/m6");
const password = "correct-horse-battery";
const uniqueEmail = () => `m6-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);
const shiftDate = (value: string, amount: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M6確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openAdd(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
}

test("period form states and Calendar/Daily/Date Sheet evidence", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  await openAdd(page);
  await page.screenshot({ path: path.join(evidenceDir, "period-scheduled-default-390x844.png") });
  await page.getByRole("button", { name: "予定の種類" }).click();
  await page.getByRole("dialog", { name: "予定の種類" }).getByRole("button", { name: "期間中にやりたい" }).click();
  await expect(page.getByRole("button", { name: "実施時期" })).toContainText("今週中");
  await expect(page.getByRole("button", { name: /^日付/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "period-this-week-390x844.png") });
  await page.getByRole("button", { name: "実施時期" }).click();
  await page.getByRole("dialog", { name: "実施時期" }).getByRole("button", { name: "今月中" }).click();
  await expect(page.getByRole("button", { name: "実施時期" })).toContainText("今月中");
  await page.screenshot({ path: path.join(evidenceDir, "period-this-month-390x844.png") });
  await page.getByRole("button", { name: "実施時期" }).click();
  await page.getByRole("dialog", { name: "実施時期" }).getByRole("button", { name: "日付範囲を指定" }).click();
  await expect(page.getByRole("button", { name: /^開始日/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^繰り返し$/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "period-custom-range-390x844.png") });
  await page.getByLabel("タイトル").fill("今週中UI");
  await page.getByRole("button", { name: "予定の種類" }).click();
  await page.getByRole("dialog", { name: "予定の種類" }).getByRole("button", { name: "期間中にやりたい" }).click();
  await page.getByRole("button", { name: "実施時期" }).click();
  await page.getByRole("dialog", { name: "実施時期" }).getByRole("button", { name: "今週中" }).click();
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.getByText("今週中UI", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: path.join(evidenceDir, "period-calendar-week-start-390x844.png") });
  await page.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByText("今週中UI", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: path.join(evidenceDir, "period-daily-in-range-390x844.png") });
});

test("period recurrence projection and occurrence override API", async ({ page }) => {
  const registration = await page.request.post("/api/auth/register", { data: { displayName: "M6 API", email: uniqueEmail(), password } });
  expect(registration.status()).toBe(201);
  const start = today();
  const input = { category: "home", title: "月次期間", place: null, memo: null, timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType: "this_month", periodAnchorDate: start, periodStartDate: null, periodEndDate: null, deadlineTime: "21:00", recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: null, startsOn: start, endsOn: null } };
  const createdResponse = await page.request.post("/api/events", { data: input });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { event: { id: string } };
  const calendar = await (await page.request.get(`/api/calendar?month=${start.slice(0, 7)}`)).json() as { events: Array<{ id: string; startDate: string; periodStartDate: string | null; occurrenceKey: string | null }> };
  const monthOccurrences = calendar.events.filter((event) => event.id === created.event.id && event.occurrenceKey?.includes(":month:"));
  expect(monthOccurrences.length).toBeGreaterThan(1);
  expect(monthOccurrences.filter((event) => event.startDate === event.periodStartDate)).toHaveLength(2);
  const occurrence = monthOccurrences[0];
  expect(occurrence.occurrenceKey).toBeTruthy();
  const modified = await page.request.patch(`/api/events/${created.event.id}`, { data: { ...input, periodWindowType: "custom_range", periodAnchorDate: null, periodStartDate: shiftDate(start, 2), periodEndDate: shiftDate(start, 4), recurrence: undefined, scope: "occurrence", occurrenceKey: occurrence.occurrenceKey } });
  expect(modified.status()).toBe(200);
  const changedDaily = await (await page.request.get(`/api/daily?date=${shiftDate(start, 3)}`)).json() as { events: Array<{ title: string; occurrenceKey: string | null }> };
  expect(changedDaily.events.some((event) => event.title === "月次期間" && event.occurrenceKey === occurrence.occurrenceKey)).toBe(true);
  expect((await page.request.delete(`/api/events/${created.event.id}?scope=occurrence&occurrenceKey=${encodeURIComponent(occurrence.occurrenceKey ?? "")}`)).status()).toBe(200);
  const cancelled = await (await page.request.get(`/api/daily?date=${shiftDate(start, 3)}`)).json() as { events: Array<{ occurrenceKey: string | null }> };
  expect(cancelled.events.some((event) => event.occurrenceKey === occurrence.occurrenceKey)).toBe(false);
  await page.goto("/calendar");
  await page.screenshot({ path: path.join(evidenceDir, "period-occurrence-cancelled-390x844.png") });
});
