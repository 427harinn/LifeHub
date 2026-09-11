import { describe, expect, it } from "vitest";
import { ARCHIVE_SCHEMA_VERSION, archiveChecksum, canonicalSerialize, type ArchiveRecords } from "./archive";

describe("archive canonical payload", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalSerialize({ z: 1, nested: { b: 2, a: 1 }, a: ["x", "y"] })).toBe(canonicalSerialize({ a: ["x", "y"], nested: { a: 1, b: 2 }, z: 1 }));
  });

  it("creates a deterministic SHA-256 checksum for the archive bundle", async () => {
    const records: ArchiveRecords = { events: [], recurrenceRules: [], eventOverrides: [], eventNotifications: [], dailyNotes: [], moneyItems: [], moneyOverrides: [], moneySettlements: [], moneyCategories: [] };
    const unsigned = { schemaVersion: ARCHIVE_SCHEMA_VERSION, generatedAt: "2026-09-11T00:00:00.000Z", userId: "user-1", retentionBoundary: "2026-09-01", archiveBatchId: "batch-1", records, manifest: { version: 1, records: [] } };
    expect(await archiveChecksum(unsigned)).toBe(await archiveChecksum({ ...unsigned, records: { ...records } }));
    expect((await archiveChecksum(unsigned)).length).toBe(64);
  });
});
