import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes("staging"), "M13の破壊的E2Eはstagingだけで実行する");
test.setTimeout(120_000);

const unique = () => `m13-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const password = "m13-backup-migration-password";
const today = new Date().toISOString().slice(0, 10);

test("M13 migrates a complete backup from an old device context to a new device context", async ({ browser }, testInfo) => {
  const email = `${unique()}@example.com`;
  const oldContext = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputDir } });
  const newContext = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputDir } });
  const oldPage = await oldContext.newPage();
  const newPage = await newContext.newPage();
  try {
    const registration = await oldPage.request.post("/api/auth/register", { data: { displayName: "M13 staging", email, password } });
    expect(registration.status()).toBe(201);
    const categoryResponse = await oldPage.request.get("/api/money-categories?type=expense");
    expect(categoryResponse.ok()).toBeTruthy();
    const category = (await categoryResponse.json() as { categories: Array<{ id: string }> }).categories[0];
    expect(category?.id).toBeTruthy();
    const currentEvent = await oldPage.request.post("/api/events", { data: { category: "home", title: "M13 current calendar", timingType: "scheduled", allDay: true, startDate: today, startTime: null, endDate: today, endTime: null, recurrence: null, notifications: [] } });
    expect(currentEvent.ok()).toBeTruthy();
    const oldEvent = await oldPage.request.post("/api/events", { data: { category: "work", title: "M13 archived calendar", timingType: "scheduled", allDay: true, startDate: "2024-01-15", startTime: null, endDate: "2024-01-15", endTime: null, recurrence: null, notifications: [] } });
    expect(oldEvent.ok()).toBeTruthy();
    const money = await oldPage.request.post("/api/money", { data: { type: "expense", title: "M13 current money", plannedAmount: 1234, categoryId: category.id, date: today, memo: "migration fixture", recurrence: null } });
    expect(money.ok()).toBeTruthy();
    const note = await oldPage.request.put("/api/daily-notes/2024-01-15", { data: { content: "M13 archived daily note" } });
    expect(note.ok()).toBeTruthy();

    await oldPage.goto("/settings");
    await oldPage.getByRole("button", { name: "データとバックアップを開く" }).click();
    await oldPage.getByRole("button", { name: "アーカイブを確認" }).click();
    await expect(oldPage.getByText("アーカイブ完了")).toBeVisible({ timeout: 15_000 });

    const normalDownload = oldPage.waitForEvent("download");
    await oldPage.getByRole("button", { name: "バックアップを作成" }).click();
    const normalFile = await normalDownload;
    expect(normalFile.suggestedFilename()).toMatch(/^lifehub-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const normalFixture = path.join(testInfo.outputDir, "normal-backup.json");
    await normalFile.saveAs(normalFixture);
    expect(fs.statSync(normalFixture).size).toBeGreaterThan(0);
    await expect(oldPage.getByText(/バックアップを作成しました/)).toBeVisible();
    await oldPage.screenshot({ path: "artifacts/evidence/m13/01-backup-complete-390x844.png", fullPage: true });

    const migrationDownload = oldPage.waitForEvent("download");
    await oldPage.getByRole("button", { name: "機種変更を始める" }).click();
    const migrationFile = await migrationDownload;
    const backupPath = path.join(testInfo.outputDir, "migration-backup.json");
    await migrationFile.saveAs(backupPath);
    expect(fs.statSync(backupPath).size).toBeGreaterThan(0);
    await oldPage.locator(".backup-file-input").setInputFiles(backupPath);
    await expect(oldPage.getByText("バックアップを確認しました。")).toBeVisible();
    await oldPage.getByRole("button", { name: "このバックアップで機種変更を開始" }).click();
    await oldPage.getByRole("button", { name: "開始する" }).click();
    await expect(oldPage.getByRole("heading", { name: "機種変更中" })).toBeVisible({ timeout: 15_000 });
    await expect(oldPage.getByText("バックアップJSONを読み込んでデータを復元してください。")).toBeVisible();
    await oldPage.screenshot({ path: "artifacts/evidence/m13/02-old-device-locked-390x844.png", fullPage: true });

    const login = await newPage.request.post("/api/auth/login", { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    await newPage.goto("/");
    await expect(newPage.getByRole("heading", { name: "機種変更中" })).toBeVisible({ timeout: 15_000 });
    await newPage.locator(".migration-page .backup-file-input").setInputFiles(backupPath);
    await expect(newPage.getByText("バックアップを確認しました。復元できます。")).toBeVisible();
    await newPage.getByRole("button", { name: "このバックアップを復元" }).click();
    await expect(newPage.getByRole("heading", { name: "カレンダー", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(newPage.getByText("M13 current calendar")).toBeVisible();
    await newPage.screenshot({ path: "artifacts/evidence/m13/03-new-device-restored-390x844.png", fullPage: true });
    await newPage.getByRole("button", { name: "デイリー" }).click();
    await newPage.getByRole("button", { name: "お金", exact: true }).click();
    await expect(newPage.getByText("M13 current money")).toBeVisible();
    await newPage.goto("/calendar");
    await expect(newPage.getByText("M13 current calendar")).toBeVisible();
    await newPage.getByRole("button", { name: "検索" }).click();
    await newPage.getByRole("textbox", { name: "予定を検索" }).fill("M13 archived calendar");
    await expect(newPage.getByRole("button", { name: /M13 archived calendar/ })).toBeVisible({ timeout: 15_000 });
    await newPage.goto("/daily?date=2024-01-15");
    await expect(newPage.getByText("M13 archived daily note")).toBeVisible({ timeout: 15_000 });
    await newPage.screenshot({ path: "artifacts/evidence/m13/04-normal-app-after-unlock-390x844.png", fullPage: true });
  } finally {
    await oldContext.close();
    await newContext.close();
  }
});

test("M13 normal backup is read-only", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputDir } });
  const page = await context.newPage();
  const email = `${unique()}@example.com`;
  try {
    expect((await page.request.post("/api/auth/register", { data: { displayName: "M13 backup only", email, password } })).status()).toBe(201);
    const before = await page.request.get("/api/user-state");
    expect(before.ok()).toBeTruthy();
    const event = await page.request.post("/api/events", { data: { category: "home", title: "M13 read-only fixture", timingType: "scheduled", allDay: true, startDate: today, startTime: null, endDate: today, endTime: null, recurrence: null, notifications: [] } });
    expect(event.ok()).toBeTruthy();
    await page.goto("/settings");
    await page.getByRole("button", { name: "データとバックアップを開く" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "バックアップを作成" }).click();
    const backupFile = await download;
    expect(backupFile.suggestedFilename()).toMatch(/^lifehub-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const fixturePath = path.join(testInfo.outputDir, "read-only-backup.json");
    await backupFile.saveAs(fixturePath);
    expect(fs.statSync(fixturePath).size).toBeGreaterThan(0);
    await expect(page.getByText(/バックアップを作成しました/)).toBeVisible();
    const after = await page.request.get("/api/user-state");
    expect(await after.json()).toEqual(await before.json());
    expect((await page.request.get(`/api/events?startDate=${today}&endDate=${today}`)).ok()).toBeTruthy();
  } finally {
    await context.close();
  }
});
