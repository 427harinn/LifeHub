import { describe, expect, it } from "vitest";
import { canCancelMigration, canCompleteMigration, canRestoreMigration, type MigrationStatus } from "./migration-service";

const statuses: MigrationStatus[] = ["locked", "awaiting_restore", "restoring", "restore_verified", "completed", "error_recoverable"];

describe("M13 migration state machine", () => {
  it("only allows restore while the account remains locked", () => {
    expect(statuses.filter(canRestoreMigration)).toEqual(["awaiting_restore", "restoring", "error_recoverable"]);
    expect(canCompleteMigration("awaiting_restore")).toBe(false);
  });

  it("only allows completion after restore verification", () => {
    expect(canCompleteMigration("restore_verified")).toBe(true);
    expect(canCompleteMigration("completed")).toBe(true);
    expect(canCompleteMigration("restoring")).toBe(false);
  });

  it("never cancels after destructive cleanup", () => {
    expect(canCancelMigration("locked", false)).toBe(true);
    expect(canCancelMigration("locked", true)).toBe(false);
    expect(canCancelMigration("awaiting_restore", false)).toBe(false);
  });
});
