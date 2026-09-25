import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidenceDir = path.resolve(process.env.EVENTFORM_TIME_EVIDENCE_DIR ?? "artifacts/evidence/eventform-time");
const password = "correct-horse-battery";
const uniqueEmail = () => `eventform-time-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
const today = () => new Date().toISOString().slice(0, 10);

async function registerThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントを作成する" }).click();
  await page.getByLabel("表示名").fill("EventForm確認");
  await page.getByLabel("メールアドレス").fill(uniqueEmail());
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
}

async function openAdd(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page.getByRole("button", { name: "家を追加" }).click();
  await expect(page.getByRole("heading", { name: "予定を追加" })).toBeVisible();
}

async function createEvent(page: import("@playwright/test").Page, input: Record<string, unknown>) {
  const result = await page.request.post("/api/events", { data: {
    category: "home", title: "staging確認", place: null, memo: null, timingType: "scheduled", allDay: false,
    startDate: today(), startTime: "10:00", endDate: today(), endTime: "11:00", periodWindowType: null,
    periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, ...input
  } });
  expect(result.status()).toBe(201);
  return (await result.json() as { event: { id: string } }).event.id;
}

async function swipeLeftToRevealEdit(page: import("@playwright/test").Page, row: import("@playwright/test").Locator) {
  const box = await row.boundingBox();
  if (!box) throw new Error("Event row bounds unavailable");
  await page.mouse.move(box.x + 260, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 24, { steps: 4 });
  await page.mouse.up();
  await expect(row.getByRole("button", { name: "編集", exact: true })).toBeVisible();
}

test("staging EventForm timed UX at 390x844", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await registerThroughUi(page);

  await openAdd(page);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByLabel("開始時間")).toHaveValue("09:00");
  await expect(page.getByLabel("終了時間")).toHaveValue("10:00");
  await page.getByLabel("タイトル").fill("開始追従確認");
  await page.getByLabel("開始時間").fill("14:30");
  await expect(page.getByLabel("終了時間")).toHaveValue("15:30");
  await page.screenshot({ path: path.join(evidenceDir, "start-follow-end-390x844.png") });
  await page.getByLabel("終了時間").fill("16:00");
  await page.getByLabel("開始時間").fill("15:00");
  await expect(page.getByLabel("終了時間")).toHaveValue("16:00");
  await page.screenshot({ path: path.join(evidenceDir, "manual-end-kept-390x844.png") });
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await openAdd(page);
  await page.getByLabel("タイトル").fill("23時台確認");
  await page.getByLabel("開始時間").fill("23:30");
  await expect(page.getByLabel("終了時間")).toHaveValue("23:59");
  await page.screenshot({ path: path.join(evidenceDir, "late-start-390x844.png") });
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  const editEventId = await createEvent(page, { title: "編集終了保持", startTime: "09:00", endTime: "16:00" });
  await page.getByRole("button", { name: "デイリー" }).click();
  const editRow = page.locator(".tap-expand-row").filter({ hasText: "編集終了保持" }).first();
  await expect(editRow).toBeVisible();
  await editRow.locator(".tap-expand-row__trigger").click();
  await editRow.locator(".event-inline-detail").getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByRole("heading", { name: "予定を編集" })).toBeVisible();
  await page.getByLabel("開始時間").fill("15:00");
  await expect(page.getByLabel("終了時間")).toHaveValue("16:00");
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await createEvent(page, { title: "recent終了保持", startTime: "11:00", endTime: "12:45" });
  await page.getByRole("button", { name: "カレンダー" }).click();
  await openAdd(page);
  await page.getByRole("button", { name: "以前の項目から選ぶ" }).click();
  await page.getByRole("button", { name: /recent終了保持/ }).click();
  await page.getByLabel("開始時間").fill("15:00");
  await expect(page.getByLabel("終了時間")).toHaveValue("12:45");
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await openAdd(page);
  await page.getByLabel("開始時間").fill("14:30");
  await page.getByRole("checkbox").check();
  await expect(page.getByLabel("開始時間")).toHaveCount(0);
  await page.getByRole("checkbox").uncheck();
  await expect(page.getByLabel("開始時間")).toHaveValue("14:30");
  await expect(page.getByLabel("終了時間")).toHaveValue("15:30");
  await page.getByRole("button", { name: "予定一覧へ戻る" }).click();

  await page.request.delete(`/api/events/${editEventId}`);
});
