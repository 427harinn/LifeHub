import { expect, test } from "@playwright/test";

const password = "correct-horse-battery";
const uniqueEmail = () => `bottom-sheet-lock-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateNumber = (date: string) => Number(date.slice(-2));

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("BottomSheet scroll lock確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
  test.describe(`BottomSheet scroll lock ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("keeps the background fixed while the Date Sheet is open and restores scroll on close", async ({ page }) => {
      await registerThroughUi(page);
      const today = todayDate();
      await page.evaluate(() => {
        document.body.style.minHeight = "1600px";
        window.scrollTo(0, 180);
      });
      expect(await page.evaluate(() => window.scrollY)).toBe(180);

      await page.getByRole("button", { name: `${dateNumber(today)}日`, exact: true }).evaluate((element) => (element as HTMLElement).click());
      const dateSheet = page.getByRole("dialog");
      await expect(dateSheet).toBeVisible();
      const lockedState = await page.evaluate(() => ({ scrollY: window.scrollY, position: document.body.style.position, top: document.body.style.top }));
      expect(lockedState.position).toBe("fixed");
      expect(lockedState.top).toBe("-180px");

      const backdrop = page.locator(".bottom-sheet__backdrop");
      const backdropBox = await backdrop.boundingBox();
      if (!backdropBox) throw new Error("BottomSheet backdrop bounds unavailable");
      expect(backdropBox.height).toBeGreaterThan(viewport.height / 2);
      await backdrop.dispatchEvent("wheel", { deltaY: 200, clientX: backdropBox.x + 12, clientY: backdropBox.y + 80 });
      await expect(dateSheet).toBeVisible();
      const afterSwipe = await page.evaluate(() => ({ scrollY: window.scrollY, top: document.body.style.top }));
      expect(afterSwipe.top).toBe("-180px");
      expect(afterSwipe.scrollY).toBe(0);
      const sheetTouch = await dateSheet.evaluate((element) => ({ touchAction: getComputedStyle(element).touchAction, overscrollBehavior: getComputedStyle(element).overscrollBehavior }));
      expect(sheetTouch.touchAction).toBe("pan-y");
      expect(sheetTouch.overscrollBehavior).toBe("contain");

      await dateSheet.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(dateSheet).toHaveCount(0);
      const restoredState = await page.evaluate(() => ({ scrollY: window.scrollY, position: document.body.style.position, top: document.body.style.top }));
      expect(restoredState.scrollY).toBe(180);
      expect(restoredState.position).toBe("");
      expect(restoredState.top).toBe("");
      await page.evaluate(() => { document.body.style.minHeight = ""; });
    });
  });
}
