import { expect, test } from "@playwright/test";

const password = "correct-horse-battery";
const uniqueEmail = () => `date-sheet-empty-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateNumber = (date: string) => Number(date.slice(-2));

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("Date Sheet確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

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
      expect(sheetBox.height).toBeGreaterThanOrEqual(420);

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
    });
  });
}
