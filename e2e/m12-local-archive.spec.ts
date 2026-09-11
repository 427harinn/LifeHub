import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const unique = () => `m12-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
const nextMonthKey = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7); };

test("M12 archives old history locally before removing only eligible D1 records", async ({ page }) => {
  const email = `${unique()}@example.com`;
  const password = "m12-local-archive-password";
  const registered = await page.request.post("/api/auth/register", { data: { displayName: "M12 Test", email, password } });
  expect(registered.ok()).toBeTruthy();

  const single = await page.request.post("/api/events", { data: { category: "home", title: "M12 旧単発", timingType: "scheduled", allDay: true, startDate: "2024-01-15", startTime: null, endDate: "2024-01-15", endTime: null, recurrence: null, notifications: [] } });
  expect(single.ok()).toBeTruthy();
  const singlePayload = await single.json() as { event: { id: string } };
  const ended = await page.request.post("/api/events", { data: { category: "work", title: "M12 終了系列", timingType: "scheduled", allDay: true, startDate: "2024-02-01", startTime: null, endDate: "2024-02-01", endTime: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2024-02-01", endsOn: "2024-03-01" }, notifications: [] } });
  expect(ended.ok()).toBeTruthy();
  const endedPayload = await ended.json() as { event: { id: string; recurrenceRuleId: string } };
  const active = await page.request.post("/api/events", { data: { category: "home", title: "M12 旧週次レビュー", timingType: "scheduled", allDay: false, startDate: "2024-01-01", startTime: "10:00", endDate: "2024-01-01", endTime: "10:00", recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2024-01-01", endsOn: null }, notifications: [] } });
  expect(active.ok()).toBeTruthy();
  const activePayload = await active.json() as { event: { id: string; recurrenceRuleId: string } };
  const activeOccurrenceKey = `event:${activePayload.event.id}:2024-01-01T10:00`;
  const activeOverride = await page.request.patch(`/api/events/${activePayload.event.id}`, { data: { scope: "occurrence", occurrenceKey: activeOccurrenceKey, startTime: "10:00", endTime: "10:00" } });
  expect(activeOverride.ok()).toBeTruthy();
  const categories = await page.request.get("/api/money-categories?type=expense");
  expect(categories.ok()).toBeTruthy();
  const expenseCategory = (await categories.json() as { categories: Array<{ id: string }> }).categories[0];
  const activeMoney = await page.request.post("/api/money", { data: { type: "expense", title: "M12 旧家賃", plannedAmount: 70000, categoryId: expenseCategory.id, date: "2024-01-01", memo: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2024-01-01", endsOn: null } } });
  expect(activeMoney.ok()).toBeTruthy();
  const activeMoneyPayload = await activeMoney.json() as { money: { id: string } };
  const oldMoneyOccurrenceKey = `money:${activeMoneyPayload.money.id}:2024-01-01`;
  const oldSettlement = await page.request.put(`/api/money/${activeMoneyPayload.money.id}/occurrences/${oldMoneyOccurrenceKey}/actual`, { data: { amount: 65000 } });
  expect(oldSettlement.ok()).toBeTruthy();
  const note = await page.request.put("/api/daily-notes/2024-01-15", { data: { content: "M12 端末へ退避する日メモ" } });
  expect(note.ok()).toBeTruthy();

  const candidates = await page.request.get("/api/archive/candidates");
  expect(candidates.ok()).toBeTruthy();
  const candidate = await candidates.json() as { archiveBatchId: string; retentionBoundary: string; records: { events: Array<{ id: string }>; dailyNotes: Array<{ date: string }> }; manifest: { records: Array<{ type: string; id: string }> }; checksum: string };
  expect(candidate.retentionBoundary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(candidate.records.events.map((event) => event.id)).toEqual(expect.arrayContaining([singlePayload.event.id, endedPayload.event.id]));
  expect(candidate.records.events.map((event) => event.id)).toContain(activePayload.event.id);
  expect(candidate.records.dailyNotes.map((item) => item.date)).toContain("2024-01-15");
  expect(candidate.manifest.records).toEqual(expect.arrayContaining([{ type: "event", id: singlePayload.event.id }, { type: "event", id: endedPayload.event.id }]));
  expect(candidate.manifest.records).not.toContainEqual({ type: "event", id: activePayload.event.id });
  expect((await page.request.get(`/api/events/${singlePayload.event.id}`)).status()).toBe(200);
  expect((await page.request.get(`/api/events/${endedPayload.event.id}`)).status()).toBe(200);
  expect((await page.request.get(`/api/money/${activeMoneyPayload.money.id}`)).status()).toBe(200);

  await page.goto("/settings");
  await page.getByRole("button", { name: "データとバックアップを開く" }).click();
  const uiCandidateResponse = page.waitForResponse((response) => response.url().endsWith("/api/archive/candidates") && response.request().method() === "GET");
  await page.getByRole("button", { name: "アーカイブを確認" }).click();
  const uiCandidate = await (await uiCandidateResponse).json() as { archiveBatchId: string; checksum: string; schemaVersion: number; manifestVersion: number; manifest: { version: number; records: Array<{ type: string; id: string }> }; metadata: { recordCount: number } };
  await expect(page.getByText("アーカイブ完了")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "artifacts/evidence/m12/archive-complete-390x844.png", fullPage: true });

  const duplicateConfirm = await page.request.post("/api/archive/confirm", { data: { archiveBatchId: uiCandidate.archiveBatchId, checksum: uiCandidate.checksum, recordCount: uiCandidate.metadata.recordCount, schemaVersion: uiCandidate.schemaVersion, manifestVersion: uiCandidate.manifestVersion, manifest: uiCandidate.manifest } });
  expect(duplicateConfirm.ok()).toBeTruthy();
  expect((await duplicateConfirm.json() as { alreadyConfirmed?: boolean }).alreadyConfirmed).toBe(true);

  const localState = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lifehub-archive"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const transaction = database.transaction("archiveRecords", "readonly");
    const rows = await new Promise<unknown[]>((resolve, reject) => { const request = transaction.objectStore("archiveRecords").getAll(); request.onsuccess = () => resolve(request.result as unknown[]); request.onerror = () => reject(request.error); });
    database.close();
    return { count: rows.length };
  });
  expect(localState.count).toBeGreaterThan(0);
  expect((await page.request.get(`/api/events/${singlePayload.event.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/events/${endedPayload.event.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/events/${activePayload.event.id}`)).ok()).toBeTruthy();
  const updatedEvent = await page.request.patch(`/api/events/${activePayload.event.id}`, { data: { scope: "series", title: "M12 新週次レビュー", startTime: "11:00", endTime: "11:00" } });
  expect(updatedEvent.ok()).toBeTruthy();
  const updatedMoney = await page.request.patch(`/api/money/${activeMoneyPayload.money.id}`, { data: { scope: "series", title: "M12 新家賃", plannedAmount: 80000, date: "2024-01-01", memo: null, categoryId: expenseCategory.id, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2024-01-01", endsOn: null } } });
  expect(updatedMoney.ok()).toBeTruthy();
  const currentMonth = monthKey();
  const futureMonth = nextMonthKey(currentMonth);
  for (const month of [currentMonth, futureMonth]) {
    const calendarResponse = await page.request.get(`/api/calendar?month=${month}`);
    expect(calendarResponse.ok()).toBeTruthy();
    const calendar = await calendarResponse.json() as { events: Array<{ id: string; title: string; startTime: string | null }>; money: { occurrences: Array<{ id: string; plannedAmount: number }> } };
    expect(calendar.events.find((entry) => entry.id === activePayload.event.id)).toMatchObject({ title: "M12 新週次レビュー", startTime: "11:00" });
    expect(calendar.money.occurrences.find((entry) => entry.id === activeMoneyPayload.money.id)?.plannedAmount).toBe(80000);
  }

  await page.goto("/calendar");
  await expect(page.getByText("M12 新週次レビュー")).toBeVisible({ timeout: 15_000 });
  await page.goto("/daily?date=2024-01-01");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByText("M12 旧週次レビュー").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "お金", exact: true }).click();
  await expect(page.getByText("M12 旧家賃")).toBeVisible({ timeout: 15_000 });
  await page.goto("/daily?date=2024-01-15");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByText("M12 端末へ退避する日メモ")).toBeVisible({ timeout: 15_000 });
  await page.goto("/calendar");
  await page.getByRole("button", { name: "検索" }).click();
  await page.getByRole("textbox", { name: "予定を検索" }).fill("旧週次レビュー");
  await expect(page.getByRole("button", { name: /M12 旧週次レビュー/ }).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "artifacts/evidence/m12/archive-search-390x844.png" });
});
