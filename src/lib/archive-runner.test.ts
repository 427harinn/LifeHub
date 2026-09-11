import { describe, expect, it, vi } from "vitest";
import { runArchiveBatch } from "./archive-runner";
import type { ArchiveCandidateResponse } from "./archive";

const candidate = { schemaVersion: 1, generatedAt: "2026-09-11T00:00:00.000Z", userId: "user-1", retentionBoundary: "2026-09-01", archiveBatchId: "batch-1", records: { events: [], recurrenceRules: [], eventOverrides: [], eventNotifications: [], dailyNotes: [], moneyItems: [], moneyOverrides: [], moneySettlements: [], moneyCategories: [] }, manifest: { version: 1, records: [] }, checksum: "checksum", metadata: { archiveBatchId: "batch-1", userId: "user-1", schemaVersion: 1, archivedAt: "2026-09-11T00:00:00.000Z", retentionBoundary: "2026-09-01", minDate: null, maxDate: null, recordCount: 0, recordCountsByType: { event: 0, recurrence_rule: 0, event_override: 0, event_notification: 0, daily_note: 0, money_item: 0, money_override: 0, money_settlement: 0, money_category: 0 }, checksum: "checksum" }, manifestVersion: 1 } satisfies ArchiveCandidateResponse;

describe("archive processing safety order", () => {
  it("does not call confirm when local save/read-back fails", async () => {
    const confirm = vi.fn();
    await expect(runArchiveBatch(candidate, { saveAndVerify: vi.fn().mockRejectedValue(new Error("quota")), markConfirmPending: vi.fn(), confirm })).rejects.toThrow("quota");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not call confirm when local metadata state cannot be written", async () => {
    const confirm = vi.fn();
    await expect(runArchiveBatch(candidate, { saveAndVerify: vi.fn().mockResolvedValue(undefined), markConfirmPending: vi.fn().mockRejectedValue(new Error("metadata")), confirm })).rejects.toThrow("metadata");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps the local step before confirm and propagates stale/server failures for retry", async () => {
    const order: string[] = [];
    const confirm = vi.fn(() => { order.push("confirm"); return Promise.reject(new Error("409")); });
    await expect(runArchiveBatch(candidate, { saveAndVerify: vi.fn(() => { order.push("save"); return Promise.resolve(); }), markConfirmPending: vi.fn(() => { order.push("pending"); return Promise.resolve(); }), confirm })).rejects.toThrow("409");
    expect(order).toEqual(["save", "pending", "confirm"]);
  });
});
