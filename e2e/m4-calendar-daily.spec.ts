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
const weekdayLabel = (date: string) => ["日", "月", "火", "水", "木", "金", "土"][new Date(`${date}T00:00:00Z`).getUTCDay()];
const displayDate = (date: string, includeYear = false) => `${includeYear ? `${date.slice(0, 4)}年` : ""}${Number(date.slice(5, 7))}月${dateNumber(date)}日(${weekdayLabel(date)})`;

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
  for (let index = 0; index < 2; index += 1) await createEvent(page, { category: index === 0 ? "home" : "work", title: `帯2条件${index + 1}`, startDate: shiftDate(today, 3), endDate: shiftDate(today, 3), startTime: `${String(9 + index).padStart(2, "0")}:00`, endTime: `${String(9 + index).padStart(2, "0")}:30` });
  for (let index = 0; index < 2; index += 1) await createEvent(page, { category: index === 0 ? "home" : "work", title: `帯1条件${index + 1}`, startDate: shiftDate(today, 4), endDate: shiftDate(today, 4), startTime: `${String(9 + index).padStart(2, "0")}:00`, endTime: `${String(9 + index).padStart(2, "0")}:30` });
  for (let index = 0; index < 6; index += 1) await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `多数予定${index + 1}`, startDate: today, endDate: today, startTime: `${String(12 + index).padStart(2, "0")}:00`, endTime: `${String(12 + index).padStart(2, "0")}:30` });
  for (let index = 0; index < 5; index += 1) await createEvent(page, { category: index % 2 === 0 ? "home" : "work", title: `候補比較${index + 1}`, startDate: shiftDate(today, 10), endDate: shiftDate(today, 10), startTime: `${String(8 + index).padStart(2, "0")}:00`, endTime: `${String(8 + index).padStart(2, "0")}:30` });
  await createEvent(page, { category: "home", title: "収支共存予定", startDate: shiftDate(today, 6), endDate: shiftDate(today, 6), startTime: "09:00", endTime: "09:30" });

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
  const moneySummaryDate = shiftDate(today, 6);
  const allMoneySummaryCell = page.getByRole("button", { name: `${dateNumber(moneySummaryDate)}日`, exact: true });
  await expect(allMoneySummaryCell.locator(".calendar-cell__money")).toHaveText(["+2,999"]);
  await expect(page.locator(".calendar-money-layer")).toHaveCount(0);
  const allCellBox = await allMoneySummaryCell.boundingBox();
  const allMoneyBox = await allMoneySummaryCell.locator(".calendar-cell__money").boundingBox();
  if (!allCellBox || !allMoneyBox) throw new Error("Calendar Money cell bounds unavailable");
  expect(allMoneyBox.y).toBeGreaterThanOrEqual(allCellBox.y);
  expect(allMoneyBox.y + allMoneyBox.height).toBeLessThanOrEqual(allCellBox.y + allCellBox.height);
  await page.screenshot({ path: path.join(evidenceDir, "calendar-high-390x844.png") });

  await page.getByRole("tab", { name: "お金" }).click();
  const moneyCell = page.getByRole("button", { name: `${todayDay}日`, exact: true });
  await expect(moneyCell.locator(".calendar-cell__money")).toHaveText(["食費", "副収入", "+699"]);
  await expect(moneyCell.locator(".calendar-cell__count")).toHaveText("1");
  await page.screenshot({ path: path.join(evidenceDir, "calendar-money-390x844.png") });
  await moneyCell.click();
  const moneyDateSheet = page.getByRole("dialog");
  await expect(moneyDateSheet.locator(".sheet-money-entry")).toHaveCount(3);
  await expect(moneyDateSheet.locator(".sheet-money-summary")).toContainText("+699円");
  await expect(moneyDateSheet.locator(".event-swipe-row")).toHaveCount(0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-money-390x844.png") });
  await moneyDateSheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("tab", { name: "家" }).click();
  await page.getByRole("button", { name: `${todayDay}日`, exact: true }).click();
  const homeDateSheet = page.getByRole("dialog");
  await expect(homeDateSheet.locator(".event-swipe-row").filter({ hasText: "朝の家予定" })).toBeVisible();
  await expect(homeDateSheet.locator(".event-swipe-row").filter({ hasText: "仕事の予定" })).toHaveCount(0);
  await expect(homeDateSheet.getByText("収支", { exact: true })).toHaveCount(0);
  await expect(page.locator(".calendar-cell__money")).toHaveCount(0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-home-390x844.png") });
  await homeDateSheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("tab", { name: "仕事" }).click();
  await page.getByRole("button", { name: `${todayDay}日`, exact: true }).click();
  const workDateSheet = page.getByRole("dialog");
  await expect(workDateSheet.locator(".event-swipe-row").filter({ hasText: "仕事の予定" })).toBeVisible();
  await expect(workDateSheet.locator(".event-swipe-row").filter({ hasText: "朝の家予定" })).toHaveCount(0);
  await expect(workDateSheet.getByText("収支", { exact: true })).toHaveCount(0);
  await expect(page.locator(".calendar-cell__money")).toHaveCount(0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-work-390x844.png") });
  await workDateSheet.getByRole("button", { name: "1日の詳細を見る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "仕事" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".daily-date-label")).toHaveText(displayDate(today));
  await page.screenshot({ path: path.join(evidenceDir, "daily-work-tab-390x844.png") });
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  const candidateDay = dateNumber(shiftDate(today, 10));
  for (const candidate of [2, 3, 4]) {
    await page.goto(`/calendar?calendarMax=${candidate}`);
    await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
    const candidateCell = page.getByRole("button", { name: `${candidateDay}日`, exact: true });
    const visibleCandidateEvents = await candidateCell.locator(".calendar-event").count();
    await expect(candidateCell.locator(".calendar-cell__count")).toHaveText(String(5 - visibleCandidateEvents));
    expect(visibleCandidateEvents).toBeLessThanOrEqual(candidate);
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
  const dateSheet = page.getByRole("dialog", { name: new RegExp(`${todayDay}日`) });
  await expect(dateSheet).toBeVisible();
  await expect(dateSheet.locator(".bottom-sheet__header h2")).toHaveCount(1);
  await expect(dateSheet.locator(".calendar-date-sheet__day-nav")).toHaveCount(0);
  await expect(dateSheet.locator(".sheet-money-summary")).toContainText("収支");
  await expect(dateSheet.locator(".sheet-money-summary")).not.toContainText("食費");
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-390x844.png") });
  const dateSheetEvent = dateSheet.locator(".event-swipe-row").filter({ hasText: "朝の家予定" }).first();
  await dateSheetEvent.locator(".event-swipe-row__main").click();
  await expect(dateSheetEvent.locator(".event-inline-detail")).toContainText("駅");
  await expect(dateSheetEvent.locator(".event-inline-detail")).toContainText("9月");
  await expect(dateSheetEvent.locator(".event-inline-detail")).toContainText("持ち物");
  await expect(dateSheetEvent.locator(".event-inline-detail")).not.toContainText("08:00");
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-inline-expand-390x844.png") });
  const dateSheetEventBox = await dateSheetEvent.boundingBox();
  if (!dateSheetEventBox) throw new Error("Date Sheet event bounds unavailable");
  await page.mouse.move(dateSheetEventBox.x + 260, dateSheetEventBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(dateSheetEventBox.x + 170, dateSheetEventBox.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(dateSheetEvent.getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-swipe-edit-390x844.png") });
  await dateSheet.locator(".sheet-money-summary").click();
  await expect(dateSheetEvent.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);
  const dateSheetFooter = page.getByRole("dialog").locator(".sheet-footer");
  const dateSheetFooterBox = await dateSheetFooter.boundingBox();
  if (!dateSheetFooterBox) throw new Error("Date Sheet gesture bounds unavailable");
  await page.mouse.move(dateSheetFooterBox.x + 270, dateSheetFooterBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(dateSheetFooterBox.x + 180, dateSheetFooterBox.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toContainText(`${dateNumber(shiftDate(today, 1))}日`);
  await page.screenshot({ path: path.join(evidenceDir, "date-sheet-next-day-swipe-390x844.png") });
  await page.getByRole("dialog").getByRole("button", { name: "前の日" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "1日の詳細を見る" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.locator(".daily-date-label")).toHaveText(displayDate(today));
  await expect(page.locator(".daily-page .event-swipe-row").filter({ hasText: "今週中：書類を整理" }).first().locator(".event-swipe-row__main")).toBeVisible();
  await page.locator(".daily-page .event-swipe-row").filter({ hasText: "今週中：書類を整理" }).first().locator(".event-swipe-row__main").click();
  await expect(page.locator(".daily-page .event-swipe-row").filter({ hasText: "今週中：書類を整理" }).first().locator(".event-inline-detail")).toContainText(`${displayDate(today)}〜${displayDate(shiftDate(today, 5))}`);
  await page.screenshot({ path: path.join(evidenceDir, "daily-period-week-390x844.png") });
  await page.locator(".daily-page .event-swipe-row").filter({ hasText: "今月中：資料をまとめる" }).first().locator(".event-swipe-row__main").click();
  await expect(page.locator(".daily-page .event-swipe-row").filter({ hasText: "今月中：資料をまとめる" }).first().locator(".event-inline-detail")).toContainText(`${displayDate(today)}〜${displayDate(`${today.slice(0, 7)}-30`)}`);
  await page.screenshot({ path: path.join(evidenceDir, "daily-period-month-390x844.png") });
  await expect(page.getByText("実データの今日メモ", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-normal-390x844.png") });

  await page.getByRole("button", { name: "前の日" }).click();
  await expect(page.locator(".daily-date-label")).toHaveText(displayDate(shiftDate(today, -1)));
  await page.getByRole("button", { name: "次の日" }).click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".daily-date-label")).toHaveText(displayDate(today));
  const dailyPageBox = await page.locator(".daily-page").boundingBox();
  if (!dailyPageBox) throw new Error("Daily page bounds unavailable");
  await page.screenshot({ path: path.join(evidenceDir, "daily-date-swipe-before-390x844.png") });
  await page.mouse.move(dailyPageBox.x + 300, dailyPageBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(dailyPageBox.x + 210, dailyPageBox.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".daily-date-label")).toHaveText(displayDate(shiftDate(today, 1)));
  await page.screenshot({ path: path.join(evidenceDir, "daily-date-swipe-after-390x844.png") });
  await page.getByRole("button", { name: "今日", exact: true }).click();

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
  await page.locator(".daily-page .fixture-group").filter({ hasText: "期間" }).locator(".event-swipe-row").filter({ hasText: "今週中：書類を整理" }).locator(".event-swipe-row__main").click();
  const periodRow = page.locator(".daily-page .event-swipe-row").filter({ hasText: "今週中：書類を整理" }).first();
  await expect(periodRow.locator(".event-inline-detail")).toBeVisible();
  const periodBox = await periodRow.boundingBox();
  if (!periodBox) throw new Error("Daily period row bounds unavailable");
  await page.mouse.move(periodBox.x + 260, periodBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(periodBox.x + 170, periodBox.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(periodRow.getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "daily-period-swipe-edit-390x844.png") });
  await page.locator(".daily-page .timeline-section h2").click();
  await expect(periodRow.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);

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
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);
  const today = isoToday();
  const dayNumber = dateNumber(today);
  await createEvent(page, { category: "home", title: "低密度単日", startDate: shiftDate(today, 10), endDate: shiftDate(today, 10), startTime: "14:00", endTime: "15:00" });
  await page.reload();
  await expect(page.getByText("低密度単日", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "calendar-low-390x844.png") });
  await page.getByRole("button", { name: `${dayNumber}日`, exact: true }).click();
  const lowDensitySheet = page.getByRole("dialog");
  await lowDensitySheet.getByRole("button", { name: "当日に追加" }).click();
  await expect(lowDensitySheet.getByRole("menu", { name: "この日に追加" })).toBeVisible();
  await lowDensitySheet.locator(".bottom-sheet__header h2").click();
  await expect(lowDensitySheet.getByRole("menu", { name: "この日に追加" })).toHaveCount(0);
  await expect(lowDensitySheet).toBeVisible();
  await lowDensitySheet.getByRole("button", { name: "当日に追加" }).click();
  await lowDensitySheet.getByRole("menu", { name: "この日に追加" }).getByRole("menuitem", { name: "家" }).click();
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
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const addSheet = page.getByRole("dialog", { name: "追加" });
  const addSheetBox = await addSheet.boundingBox();
  if (!addSheetBox) throw new Error("Add sheet bounds unavailable");
  await page.mouse.move(addSheetBox.x + 200, addSheetBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(addSheetBox.x + 200, addSheetBox.y + 110, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "追加" })).toHaveCount(0);
});
