import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes("staging"), "M13の破壊的E2Eはstagingだけで実行する");
test.setTimeout(120_000);

const unique = () => `m13-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const password = "m13-backup-migration-password";
const today = new Date().toISOString().slice(0, 10);
const dateFrom = (year: number, dayOffset: number) => {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
};
const addDays = (value: string, dayOffset: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
};
const runConcurrent = async <T,>(items: T[], task: (item: T) => Promise<void>, concurrency = 20) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await task(item);
    }
  }));
};

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
    await expect(oldPage.getByRole("button", { name: "機種変更をキャンセル" })).toHaveCount(0);
    await expect(oldPage.getByText("データの移行準備は完了しています。元の端末に戻す場合も、保存したバックアップから復元してください。")).toBeVisible();
    await oldPage.screenshot({ path: "artifacts/evidence/m13/05-cleanup-complete-no-cancel-390x844.png", fullPage: true });
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

test("M13 restores a large backup in one transactional D1 batch", async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  const email = `${unique()}@example.com`;
  const oldContext = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputDir } });
  const newContext = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputDir } });
  const oldPage = await oldContext.newPage();
  const newPage = await newContext.newPage();
  const currentDates = Array.from({ length: 200 }, (_, index) => addDays(today, index));
  const currentMoneyDates = Array.from({ length: 300 }, (_, index) => addDays(today, index));
  const oldDates = Array.from({ length: 200 }, (_, index) => dateFrom(2024, index));
  const fixtureCounts = { currentEvents: 200, oldEvents: 200, currentDailyNotes: 200, oldDailyNotes: 200, currentMoneyItems: 300, oldMoneyItems: 200, currentMoneySettlements: 300, archiveRecordsExpectedMinimum: 600 };
  try {
    expect((await oldPage.request.post("/api/auth/register", { data: { displayName: "M13 large staging", email, password } })).status()).toBe(201);
    const categoryResponse = await oldPage.request.get("/api/money-categories?type=expense");
    expect(categoryResponse.ok()).toBeTruthy();
    const category = (await categoryResponse.json() as { categories: Array<{ id: string }> }).categories[0];
    expect(category?.id).toBeTruthy();

    await runConcurrent(Array.from({ length: fixtureCounts.currentEvents }, (_, index) => index), async (index) => {
      const response = await oldPage.request.post("/api/events", { data: { category: "home", title: `M13 large current event ${index}`, timingType: "scheduled", allDay: true, startDate: currentDates[index], startTime: null, endDate: currentDates[index], endTime: null, recurrence: null, notifications: [] } });
      expect(response.ok()).toBeTruthy();
    });
    const recurringResponse = await oldPage.request.post("/api/events", { data: { category: "work", title: "M13 large recurring event", timingType: "scheduled", allDay: false, startDate: today, startTime: "10:00", endDate: today, endTime: "10:30", recurrence: { frequency: "weekly", interval: 1, weekdays: [new Date(`${today}T00:00:00Z`).getUTCDay()], dayOfMonth: null, startsOn: today, endsOn: null }, notifications: [] } });
    expect(recurringResponse.ok()).toBeTruthy();
    const recurringEventId = (await recurringResponse.json() as { event: { id: string } }).event.id;
    const calendarResponse = await oldPage.request.get(`/api/calendar?month=${today.slice(0, 7)}`);
    expect(calendarResponse.ok()).toBeTruthy();
    const recurringOccurrence = (await calendarResponse.json() as { events: Array<{ id: string; occurrenceKey: string | null }> }).events.find((event) => event.id === recurringEventId && event.occurrenceKey);
    expect(recurringOccurrence?.occurrenceKey).toBeTruthy();
    const overrideResponse = await oldPage.request.patch(`/api/events/${recurringEventId}`, { data: { category: "work", title: "M13 large recurring override", timingType: "scheduled", allDay: false, startDate: today, startTime: "10:00", endDate: today, endTime: "10:30", scope: "occurrence", occurrenceKey: recurringOccurrence?.occurrenceKey, notifications: [] } });
    expect(overrideResponse.ok()).toBeTruthy();
    await runConcurrent(Array.from({ length: fixtureCounts.oldEvents }, (_, index) => index), async (index) => {
      const response = await oldPage.request.post("/api/events", { data: { category: "work", title: `M13 large archived event ${index}`, timingType: "scheduled", allDay: true, startDate: oldDates[index], startTime: null, endDate: oldDates[index], endTime: null, recurrence: null, notifications: [] } });
      expect(response.ok()).toBeTruthy();
    });

    await runConcurrent(currentDates.map((date, index) => ({ date, index })), async ({ date, index }) => {
      const response = await oldPage.request.put(`/api/daily-notes/${date}`, { data: { content: `M13 large current daily note ${index}` } });
      expect(response.ok()).toBeTruthy();
    });
    await runConcurrent(oldDates.map((date, index) => ({ date, index })), async ({ date, index }) => {
      const response = await oldPage.request.put(`/api/daily-notes/${date}`, { data: { content: `M13 large archived daily note ${index}` } });
      expect(response.ok()).toBeTruthy();
    });

    const currentMoneyIds: string[] = [];
    await runConcurrent(currentMoneyDates.map((date, index) => ({ date, index })), async ({ date, index }) => {
      const response = await oldPage.request.post("/api/money", { data: { type: "expense", title: `M13 large current money ${index}`, plannedAmount: 1000 + index, categoryId: category.id, date, memo: "large migration fixture", recurrence: null } });
      expect(response.ok()).toBeTruthy();
      currentMoneyIds[index] = (await response.json() as { money: { id: string } }).money.id;
    });
    const oldMoneyIds: string[] = [];
    await runConcurrent(oldDates.map((date, index) => ({ date, index })), async ({ date, index }) => {
      const response = await oldPage.request.post("/api/money", { data: { type: "expense", title: `M13 large archived money ${index}`, plannedAmount: 2000 + index, categoryId: category.id, date, memo: "large migration fixture", recurrence: null } });
      expect(response.ok()).toBeTruthy();
      oldMoneyIds[index] = (await response.json() as { money: { id: string } }).money.id;
    });
    await runConcurrent(currentMoneyDates.map((date, index) => ({ date, index })), async ({ date, index }) => {
      const occurrenceKey = `money:${currentMoneyIds[index]}:${date}`;
      const response = await oldPage.request.put(`/api/money/${currentMoneyIds[index]}/occurrences/${encodeURIComponent(occurrenceKey)}/actual`, { data: { amount: 900 + index } });
      expect(response.ok()).toBeTruthy();
    });

    await oldPage.goto("/settings");
    await oldPage.getByRole("button", { name: "データとバックアップを開く" }).click();
    await oldPage.getByRole("button", { name: "アーカイブを確認" }).click();
    await expect(oldPage.getByText("アーカイブ完了")).toBeVisible({ timeout: 30_000 });

    const normalDownload = oldPage.waitForEvent("download");
    await oldPage.getByRole("button", { name: "バックアップを作成" }).click();
    const normalFile = await normalDownload;
    const normalPath = path.join(testInfo.outputDir, "large-normal-backup.json");
    await normalFile.saveAs(normalPath);
    const normalPayload = JSON.parse(fs.readFileSync(normalPath, "utf8")) as { format: string; schemaVersion: number; manifest: { cloudRecordCount: number; archiveRecordCount: number; recordCount: number } };
    const normalBytes = fs.statSync(normalPath).size;
    expect(normalPayload.format).toBe("lifehub-backup");
    expect(normalPayload.schemaVersion).toBe(1);
    expect(normalPayload.manifest.archiveRecordCount).toBeGreaterThanOrEqual(fixtureCounts.archiveRecordsExpectedMinimum);
    expect(normalPayload.manifest.cloudRecordCount).toBeGreaterThan(1000);
    expect(normalBytes).toBeLessThan(10 * 1024 * 1024);

    const migrationDownload = oldPage.waitForEvent("download");
    await oldPage.getByRole("button", { name: "機種変更を始める" }).click();
    const migrationFile = await migrationDownload;
    const backupPath = path.join(testInfo.outputDir, "large-migration-backup.json");
    await migrationFile.saveAs(backupPath);
    const migrationBytes = fs.statSync(backupPath).size;
    expect(migrationBytes).toBe(normalBytes);
    await oldPage.locator(".backup-file-input").setInputFiles(backupPath);
    await expect(oldPage.getByText("バックアップを確認しました。")).toBeVisible({ timeout: 30_000 });
    await oldPage.getByRole("button", { name: "このバックアップで機種変更を開始" }).click();
    await oldPage.getByRole("button", { name: "開始する" }).click();
    await expect(oldPage.getByText("データの移行準備は完了しています。元の端末に戻す場合も、保存したバックアップから復元してください。")).toBeVisible({ timeout: 30_000 });
    await expect(oldPage.getByRole("button", { name: "機種変更をキャンセル" })).toHaveCount(0);

    expect((await newPage.request.post("/api/auth/login", { data: { email, password } })).ok()).toBeTruthy();
    await newPage.goto("/");
    await expect(newPage.getByRole("heading", { name: "機種変更中" })).toBeVisible({ timeout: 30_000 });
    await newPage.locator(".migration-page .backup-file-input").setInputFiles(backupPath);
    await expect(newPage.getByText("バックアップを確認しました。復元できます。")).toBeVisible({ timeout: 30_000 });
    const restoreResponsePromise = newPage.waitForResponse((response) => response.url().endsWith("/api/migration/restore") && response.request().method() === "POST");
    const restoreStartedAt = Date.now();
    await newPage.getByRole("button", { name: "このバックアップを復元" }).click();
    const restoreResponse = await restoreResponsePromise;
    expect(restoreResponse.ok()).toBeTruthy();
    const restorePayload = await restoreResponse.json() as { restoreStatementCount: number; cloudRecordCount: number };
    const restoreDurationMs = Date.now() - restoreStartedAt;
    expect(restorePayload.cloudRecordCount).toBe(normalPayload.manifest.cloudRecordCount);
    expect(restorePayload.restoreStatementCount).toBeGreaterThan(800);
    await expect(newPage.getByRole("heading", { name: "カレンダー", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(newPage.getByText("M13 large current event 0")).toBeVisible({ timeout: 30_000 });
    await newPage.getByRole("button", { name: "デイリー" }).click();
    await expect(newPage.getByText("M13 large current daily note 0")).toBeVisible({ timeout: 30_000 });
    await newPage.getByRole("button", { name: "お金", exact: true }).click();
    await expect(newPage.getByText("M13 large current money 0")).toBeVisible({ timeout: 30_000 });
    await newPage.goto("/calendar");
    await newPage.getByRole("button", { name: "検索" }).click();
    await newPage.getByRole("textbox", { name: "予定を検索" }).fill("M13 large archived event 0");
    await expect(newPage.getByRole("button", { name: /M13 large archived event 0/ })).toBeVisible({ timeout: 30_000 });

    const restoredExportResponse = await newPage.request.get("/api/backup/export");
    expect(restoredExportResponse.ok()).toBeTruthy();
    const restoredExport = await restoredExportResponse.json() as { cloud: { events: Array<{ id: string }>; dailyNotes: Array<{ id: string }>; moneyItems: Array<{ id: string }>; moneySettlements: Array<{ id: string }> } };
    expect(restoredExport.cloud.events.map((row) => row.id).sort()).toEqual((normalPayload as unknown as { cloud: { events: Array<{ id: string }> } }).cloud.events.map((row) => row.id).sort());
    expect(restoredExport.cloud.dailyNotes).toHaveLength(fixtureCounts.currentDailyNotes);
    expect(restoredExport.cloud.moneyItems).toHaveLength(fixtureCounts.currentMoneyItems);
    expect(restoredExport.cloud.moneySettlements).toHaveLength(fixtureCounts.currentMoneySettlements);
    const archiveState = await newPage.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lifehub-archive"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const rows = await new Promise<Array<{ id: string; userId: string }>>((resolve, reject) => { const request = database.transaction("archiveRecords", "readonly").objectStore("archiveRecords").index("userId").getAll(); request.onsuccess = () => resolve(request.result as Array<{ id: string; userId: string }>); request.onerror = () => reject(request.error); });
      database.close();
      return { count: rows.length, ids: rows.map((row) => row.id).sort() };
    });
    expect(archiveState.count).toBe(normalPayload.manifest.archiveRecordCount);
    expect(new Set(archiveState.ids).size).toBe(archiveState.count);
    console.log(`M13 large fixture: ${JSON.stringify({ fixtureCounts, archiveRecordCount: normalPayload.manifest.archiveRecordCount, cloudRecordCount: normalPayload.manifest.cloudRecordCount, normalBytes, migrationBytes, restoreStatementCount: restorePayload.restoreStatementCount, restoreDurationMs, oldMoneyIds: oldMoneyIds.length })}`);
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
