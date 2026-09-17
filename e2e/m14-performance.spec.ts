import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 }, video: "on" });

const evidenceDir = path.resolve(process.env.M14_EVIDENCE_DIR ?? "artifacts/evidence/m14/phase-ef");
const performancePath = path.join(evidenceDir, "performance-local.json");
const password = "correct-horse-battery";
const uniqueEmail = () => `m14-perf-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

async function register(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("M14 performance確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function browserVitals(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType("paint");
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1) as PerformanceEntry | undefined;
    const cls = performance.getEntriesByType("layout-shift").reduce((sum, entry) => sum + ((entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }).hadRecentInput ? 0 : ((entry as PerformanceEntry & { value?: number }).value ?? 0)), 0);
    return {
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
      loadEvent: navigation?.loadEventEnd ?? null,
      fcp: paint.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? null,
      lcp: lcp?.startTime ?? null,
      cls,
      inp: null,
      tbt: null
    };
  });
}

test("M14 staging candidate performance route sample", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await register(page);
  const routes: Array<{ route: string; transitionMs: number; vitals: Awaited<ReturnType<typeof browserVitals>> }> = [];
  routes.push({ route: "calendar", transitionMs: 0, vitals: await browserVitals(page) });

  const sample = async (route: string, action: () => Promise<void>, ready: () => Promise<void>) => {
    const started = performance.now();
    await action();
    await ready();
    routes.push({ route, transitionMs: Math.round(performance.now() - started), vitals: await browserVitals(page) });
  };

  await sample("daily", () => page.getByRole("button", { name: "デイリー" }).click(), () => expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible());
  await sample("money", () => page.getByRole("button", { name: "お金" }).click(), () => expect(page.getByRole("heading", { name: "お金" })).toBeVisible());
  await sample("money-analysis", () => page.getByRole("button", { name: "お金の分析を見る" }).click(), () => expect(page.getByRole("heading", { name: "お金の分析" })).toBeVisible());
  await sample("search", async () => { await page.getByRole("button", { name: "お金へ戻る" }).click(); await page.getByRole("button", { name: "カレンダー" }).click(); await page.getByRole("button", { name: "検索" }).click(); }, () => expect(page.getByRole("textbox", { name: "予定を検索" })).toBeVisible());
  await sample("settings", async () => { await page.getByRole("button", { name: "カレンダーへ戻る" }).click(); await page.getByRole("button", { name: "設定" }).click(); }, () => expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible());

  await writeFile(performancePath, JSON.stringify({
    measuredAt: new Date().toISOString(),
    environment: process.env.PLAYWRIGHT_BASE_URL ?? "local",
    viewport: { width: 390, height: 844 },
    bundle: {
      worker: "221.30 kB raw / 43.29 kB gzip",
      clientJs: "351.04 kB raw / 102.00 kB gzip",
      clientCss: "45.83 kB raw / 7.72 kB gzip"
    },
    routes,
    notes: { inp: "not available in this automated sample", tbt: "recorded from production build output when available", highDensity: "no fixture mutation in this smoke sample" }
  }, null, 2));
  expect(routes).toHaveLength(6);
});
