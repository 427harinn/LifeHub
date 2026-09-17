import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });

const evidenceDir = path.resolve(process.env.M14_EVIDENCE_DIR ?? "artifacts/evidence/m14/phase-ef");
const password = "correct-horse-battery";
const uniqueEmail = () => `m14-ef-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M14 E+F確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

test("Bottom Navigation assets, PWA manifest, and one SW registration", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const nav = page.locator(".mobile-nav");
  await expect(nav.locator(".mobile-nav__asset-icon")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: "カレンダー" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: path.join(evidenceDir, "01-bottom-navigation-390x844.png"), fullPage: true });
  await page.screenshot({ path: path.join(evidenceDir, "02-selected-calendar-390x844.png"), fullPage: true });

  await nav.getByRole("button", { name: "デイリー" }).click();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "デイリー" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: path.join(evidenceDir, "03-selected-daily-390x844.png"), fullPage: true });

  await nav.getByRole("button", { name: "お金" }).click();
  await expect(page.getByRole("heading", { name: "お金" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "お金" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: path.join(evidenceDir, "04-selected-money-390x844.png"), fullPage: true });

  await nav.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "設定" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: path.join(evidenceDir, "05-selected-settings-390x844.png"), fullPage: true });
  await nav.getByRole("button", { name: "カレンダー" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "11-final-calendar-390x844.png"), fullPage: true });
  await nav.getByRole("button", { name: "お金" }).click();
  await expect(page.getByRole("heading", { name: "お金" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "12-final-money-390x844.png"), fullPage: true });
  await nav.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "10-final-settings-390x844.png"), fullPage: true });
  await page.goto("/icons/app/lifehub.svg");
  await page.locator("svg").screenshot({ path: path.join(evidenceDir, "06-pwa-home-icon-512.png") });

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const manifestBody = await manifest.json() as { id: string; start_url: string; display: string; icons: Array<{ sizes: string; purpose: string; src: string }> };
  expect(manifestBody).toMatchObject({ id: "/", start_url: "/calendar", display: "standalone" });
  expect(manifestBody.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", purpose: "any", src: "/icons/app/lifehub.svg" }),
    expect.objectContaining({ sizes: "512x512", purpose: "maskable", src: "/icons/app/lifehub.svg" })
  ]));
  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  const swText = await sw.text();
  expect(swText).toContain("self.addEventListener(\"install\"");
  expect(swText).toContain("self.addEventListener(\"activate\"");
  expect(swText).toContain("self.addEventListener(\"push\"");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter((registration) => registration.scope.endsWith("/")).length)).toBe(1);
});
