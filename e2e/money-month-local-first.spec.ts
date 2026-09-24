import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const user = { id: "money-local-first-user", email: "money-local-first@example.com", displayName: "Money Local First" };
const settings = {
  userId: user.id,
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  morningSummaryEnabled: true,
  morningSummaryTime: "09:00",
  eveningSummaryEnabled: true,
  eveningSummaryTime: "21:00",
  periodDefaultDeadlineTime: "21:00",
  lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] },
  lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] }
};
const moneyFor = (month: string) => ({ month, occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] });

test("Money uses neighboring month snapshots without a loading screen at 390x844", async ({ page }) => {
  const requests = new Map<string, number>();
  const pending = new Map<string, Array<() => void>>();
  const release = (month: string) => pending.get(month)?.splice(0).forEach((resolve) => resolve());

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user }) });
    if (url.pathname === "/api/settings") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings }) });
    if (url.pathname === "/api/user-state") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: { migrationState: "active" } }) });
    if (url.pathname !== "/api/money/month") return route.fulfill({ contentType: "application/json", body: "{}" });
    const month = url.searchParams.get("month") ?? "";
    const count = (requests.get(month) ?? 0) + 1;
    requests.set(month, count);
    if (month === "2026-10" && count > 1) await new Promise<void>((resolve) => pending.set(month, [...(pending.get(month) ?? []), resolve]));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(moneyFor(month)) });
  });

  await page.goto("/money");
  await expect(page.locator(".money-month-nav h2")).toHaveText("2026年9月");
  await expect.poll(() => requests.get("2026-08")).toBe(1);
  await expect.poll(() => requests.get("2026-10")).toBe(1);

  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.locator(".money-month-nav h2")).toHaveText("2026年10月");
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  await expect.poll(() => requests.get("2026-10")).toBe(2);
  release("2026-10");

  await page.getByRole("button", { name: "前の月" }).click();
  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page.locator(".money-month-nav h2")).toHaveText("2026年8月");
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
});
