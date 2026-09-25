import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const password = "correct-horse-battery";
const today = () => new Date().toISOString().slice(0, 10);
const shiftDate = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const uniqueEmail = () => `period-projection-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

test("renders period projections once per day while keeping Calendar anchors and row-scoped actions", async ({ page }) => {
  const start = today();
  const create = async (input: Record<string, unknown>) => {
    const response = await page.request.post("/api/events", { data: input });
    expect(response.status()).toBe(201);
  };
  const period = (title: string, windowType: "this_week" | "this_month" | "custom_range", recurrence: Record<string, unknown> | null = null) => ({
    category: "home", title, place: null, memo: null, timingType: "period", allDay: null,
    startDate: null, startTime: null, endDate: null, endTime: null,
    periodWindowType: windowType,
    periodAnchorDate: windowType === "custom_range" ? null : start,
    periodStartDate: windowType === "custom_range" ? start : null,
    periodEndDate: windowType === "custom_range" ? shiftDate(start, 2) : null,
    deadlineTime: "21:00", recurrence
  });

  const registration = await page.request.post("/api/auth/register", { data: { displayName: "期間projection確認", email: uniqueEmail(), password } });
  expect(registration.status()).toBe(201);
  await create(period("週次期間・単発", "this_week"));
  await create(period("週次期間・毎週", "this_week", { frequency: "weekly", interval: 1, weekdays: [new Date(`${start}T00:00:00Z`).getUTCDay()], dayOfMonth: null, startsOn: start, endsOn: null }));
  await create(period("月次期間・単発", "this_month"));
  await create(period("月次期間・毎月", "this_month", { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: Number(start.slice(-2)), startsOn: start, endsOn: null }));
  await create(period("範囲期間", "custom_range"));

  const calendarResponse = await page.request.get(`/api/calendar?month=${start.slice(0, 7)}`);
  expect(calendarResponse.ok()).toBeTruthy();
  const calendar = await calendarResponse.json() as { events: Array<{ title: string; startDate: string | null; periodStartDate: string | null; periodEndDate: string | null }> };
  for (const title of ["週次期間・単発", "週次期間・毎週", "月次期間・単発", "月次期間・毎月", "範囲期間"]) {
    const events = calendar.events.filter((event) => event.title === title);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.startDate && event.periodStartDate && event.periodEndDate)).toBe(true);
    expect(events.some((event) => event.startDate === event.periodStartDate)).toBe(true);
  }

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.locator(".calendar-event").filter({ hasText: "週次期間・単発" })).toHaveCount(1);
  await expect(page.locator(".calendar-event").filter({ hasText: "月次期間・単発" })).toHaveCount(1);
  await expect(page.locator(".calendar-event").filter({ hasText: "範囲期間" })).toHaveCount(1);

  await page.goto(`/calendar?date=${start}`);
  const dateSheet = page.getByRole("dialog");
  await expect(dateSheet).toBeVisible();
  for (const title of ["週次期間・単発", "週次期間・毎週", "月次期間・単発", "月次期間・毎月", "範囲期間"]) {
    await expect(dateSheet.getByText(title, { exact: true })).toHaveCount(1);
  }

  const recurringRow = dateSheet.locator(".tap-expand-row").filter({ hasText: "週次期間・毎週" });
  const recurringBounds = await recurringRow.boundingBox();
  if (!recurringBounds) throw new Error("recurring period row bounds unavailable");
  await page.mouse.move(recurringBounds.x + 260, recurringBounds.y + 24);
  await page.mouse.down();
  await page.mouse.move(recurringBounds.x + 170, recurringBounds.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(recurringRow.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);
  await expect(dateSheet.locator(".event-swipe-row__actions")).toHaveCount(0);
  await recurringRow.locator(".tap-expand-row__trigger").click();
  await recurringRow.locator(".event-inline-detail").getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "編集する範囲" })).toBeVisible();
  await page.getByRole("dialog", { name: "編集する範囲" }).getByRole("button", { name: "閉じる" }).click();

  await page.goto(`/calendar?date=${start}`);
  const expandedSheet = page.getByRole("dialog");
  const nonRecurringRow = expandedSheet.locator(".tap-expand-row").filter({ hasText: "週次期間・単発" });
  await nonRecurringRow.locator(".tap-expand-row__trigger").click();
  await expect(nonRecurringRow.locator(".event-inline-detail")).toHaveCount(1);
  await expect(expandedSheet.getByRole("button", { name: "編集", exact: true })).toHaveCount(1);

  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  for (const title of ["週次期間・単発", "週次期間・毎週", "月次期間・単発", "月次期間・毎月", "範囲期間"]) {
    await expect(page.locator("main.daily-page .tap-expand-row").filter({ hasText: title })).toHaveCount(1);
  }
});
