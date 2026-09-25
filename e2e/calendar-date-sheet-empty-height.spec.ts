import { expect, test } from "@playwright/test";

const password = "correct-horse-battery";
const uniqueEmail = () => `date-sheet-empty-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateNumber = (date: string) => Number(date.slice(-2));
const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("Date Sheet確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

const createEvent = async (page: import("@playwright/test").Page, input: { title: string; date: string; startTime: string; endTime: string }) => {
  const response = await page.request.post("/api/events", { data: { category: "home", title: input.title, startDate: input.date, endDate: input.date, startTime: input.startTime, endTime: input.endTime, timingType: "scheduled", allDay: false, place: null, memo: null } });
  expect(response.status()).toBe(201);
};

const createMoney = async (page: import("@playwright/test").Page, date: string) => {
  const categoriesResponse = await page.request.get("/api/money-categories?type=expense");
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json() as { categories: Array<{ id: string }> };
  const response = await page.request.post("/api/money", { data: { type: "expense", title: "Date Sheet支出", plannedAmount: 1200, date, categoryId: categories.categories[0].id, memo: null, recurrence: null } });
  expect(response.status()).toBe(201);
};

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
  test.describe(`Calendar Date Sheet empty state ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("keeps the quick-add menu inside the Date Sheet", async ({ page }) => {
      await registerThroughUi(page);
      const today = todayDate();
      await page.getByRole("button", { name: `${dateNumber(today)}日`, exact: true }).click();

      const dateSheet = page.getByRole("dialog");
      await expect(dateSheet).toBeVisible();
      await expect(dateSheet.getByText("予定はありません", { exact: true })).toBeVisible();
      const sheetBox = await dateSheet.boundingBox();
      if (!sheetBox) throw new Error("Date Sheet bounds unavailable");
      expect(Math.round(sheetBox.height)).toBeGreaterThanOrEqual(420);

      await dateSheet.getByRole("button", { name: "当日に追加" }).click();
      const menu = dateSheet.getByRole("menu", { name: "この日に追加" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveCount(3);

      const menuBox = await menu.boundingBox();
      if (!menuBox) throw new Error("Quick-add menu bounds unavailable");
      expect(menuBox.y).toBeGreaterThanOrEqual(sheetBox.y);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
      for (const label of ["家", "仕事", "お金"]) {
        await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
      }

      const footerBox = await dateSheet.locator(".sheet-footer").boundingBox();
      if (!footerBox) throw new Error("Date Sheet footer bounds unavailable");
      expect(footerBox.y).toBeGreaterThan(sheetBox.y + sheetBox.height / 2);
      expect(sheetBox.y + sheetBox.height - (footerBox.y + footerBox.height)).toBeLessThanOrEqual(36);
    });

    test("keeps the footer stable while event content and money summary grow", async ({ page }) => {
      await registerThroughUi(page);
      const today = todayDate();
      const manyEventsDate = shiftDate(today, 2);
      await createEvent(page, { title: "Date Sheet 1件", date: today, startTime: "09:00", endTime: "10:00" });
      await createMoney(page, today);
      for (let index = 0; index < 24; index += 1) {
        const hour = String(index).padStart(2, "0");
        await createEvent(page, { title: `Date Sheet 多数${index + 1}`, date: manyEventsDate, startTime: `${hour}:00`, endTime: `${hour}:30` });
      }

      const emptyDate = shiftDate(today, 1);
      await page.goto(`/calendar?date=${emptyDate}`);
      const emptySheet = page.getByRole("dialog");
      await expect(emptySheet.getByText("予定はありません", { exact: true })).toBeVisible();
      const emptySheetBox = await emptySheet.boundingBox();
      const emptyFooterBox = await emptySheet.locator(".sheet-footer").boundingBox();
      if (!emptySheetBox || !emptyFooterBox) throw new Error("Empty Date Sheet bounds unavailable");
      const emptyFooterBottomGap = emptySheetBox.y + emptySheetBox.height - (emptyFooterBox.y + emptyFooterBox.height);

      await page.goto(`/calendar?date=${today}`);
      const oneEventSheet = page.getByRole("dialog");
      await expect(oneEventSheet.getByText("Date Sheet 1件", { exact: true })).toBeVisible();
      await expect(oneEventSheet.getByText("収支", { exact: true })).toBeVisible();
      const oneEventSheetBox = await oneEventSheet.boundingBox();
      const oneEventFooterBox = await oneEventSheet.locator(".sheet-footer").boundingBox();
      if (!oneEventSheetBox || !oneEventFooterBox) throw new Error("One-event Date Sheet bounds unavailable");
      const oneEventFooterBottomGap = oneEventSheetBox.y + oneEventSheetBox.height - (oneEventFooterBox.y + oneEventFooterBox.height);
      expect(Math.abs(emptyFooterBottomGap - oneEventFooterBottomGap)).toBeLessThanOrEqual(8);

      await page.goto(`/calendar?date=${manyEventsDate}`);
      const manyEventsSheet = page.getByRole("dialog");
      await expect(manyEventsSheet.getByText("Date Sheet 多数1", { exact: true })).toBeVisible();
      const eventList = manyEventsSheet.locator(".calendar-date-sheet__gesture > .sheet-list");
      const listMetrics = await eventList.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
      const manyEventsSheetBox = await manyEventsSheet.boundingBox();
      const manyEventsFooterBox = await manyEventsSheet.locator(".sheet-footer").boundingBox();
      if (!manyEventsSheetBox || !manyEventsFooterBox) throw new Error("Many-event Date Sheet bounds unavailable");
      expect(manyEventsFooterBox.y + manyEventsFooterBox.height).toBeLessThanOrEqual(manyEventsSheetBox.y + manyEventsSheetBox.height);
    });
  });
}
