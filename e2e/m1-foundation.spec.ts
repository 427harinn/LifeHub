import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.use({ viewport: { width: 390, height: 844 } });

const evidenceDir = path.resolve("artifacts/evidence/m1");

test("M1 foundation renders at the mobile review viewport", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "LifeHub" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /ラベル入力/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存する" })).toBeVisible();
  await expect(page.getByRole("button", { name: "カレンダー" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator(".mobile-nav__icon")).toHaveCount(5);

  const navStyle = await page.locator(".mobile-nav").evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderTopWidth: style.borderTopWidth, boxShadow: style.boxShadow };
  });
  expect(navStyle).toEqual({ backgroundColor: "rgb(255, 255, 255)", borderTopWidth: "1px", boxShadow: "none" });

  const addStyle = await page.locator(".mobile-nav__button--add").evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow };
  });
  expect(addStyle.boxShadow).toBe("none");
  await page.screenshot({ path: path.join(evidenceDir, "foundation-390x844.png") });

  await page.getByRole("button", { name: "表示設定" }).click();
  await expect(page.getByRole("dialog", { name: "表示設定" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(evidenceDir, "bottom-sheet-390x844.png") });

  await page.getByRole("button", { name: "背景を閉じる" }).click();
  await expect(page.getByRole("dialog", { name: "表示設定" })).toBeHidden();
});
