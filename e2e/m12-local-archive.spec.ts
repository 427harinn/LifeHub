import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const unique = () => `m12-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  const active = await page.request.post("/api/events", { data: { category: "home", title: "M12 継続家賃", timingType: "scheduled", allDay: true, startDate: "2024-01-01", startTime: null, endDate: "2024-01-01", endTime: null, recurrence: { frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 1, startsOn: "2024-01-01", endsOn: null }, notifications: [] } });
  expect(active.ok()).toBeTruthy();
  const activePayload = await active.json() as { event: { id: string; recurrenceRuleId: string } };
  const note = await page.request.put("/api/daily-notes/2024-01-15", { data: { content: "M12 端末へ退避する日メモ" } });
  expect(note.ok()).toBeTruthy();

  const candidates = await page.request.get("/api/archive/candidates");
  expect(candidates.ok()).toBeTruthy();
  const candidate = await candidates.json() as { archiveBatchId: string; retentionBoundary: string; records: { events: Array<{ id: string }>; dailyNotes: Array<{ date: string }> }; manifest: { records: Array<{ type: string; id: string }> }; checksum: string };
  expect(candidate.retentionBoundary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(candidate.records.events.map((event) => event.id)).toEqual(expect.arrayContaining([singlePayload.event.id, endedPayload.event.id]));
  expect(candidate.records.events.map((event) => event.id)).not.toContain(activePayload.event.id);
  expect(candidate.records.dailyNotes.map((item) => item.date)).toContain("2024-01-15");
  expect(candidate.manifest.records).toEqual(expect.arrayContaining([{ type: "event", id: singlePayload.event.id }, { type: "event", id: endedPayload.event.id }]));
  expect(candidate.manifest.records).not.toContainEqual({ type: "event", id: activePayload.event.id });

  await page.goto("/settings");
  await page.getByRole("button", { name: "データとバックアップを開く" }).click();
  await page.getByRole("button", { name: "アーカイブを確認" }).click();
  await expect(page.getByText("アーカイブ完了")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "artifacts/evidence/m12/archive-complete-390x844.png", fullPage: true });

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

  await page.goto("/calendar");
  await page.getByRole("button", { name: "検索" }).click();
  await page.getByRole("textbox", { name: "予定を検索" }).fill("旧単発");
  await expect(page.getByRole("button", { name: /M12 旧単発/ })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "artifacts/evidence/m12/archive-search-390x844.png" });
});
