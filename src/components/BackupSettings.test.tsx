import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MigrationScreen } from "./BackupSettings";

const mocks = vi.hoisted(() => ({
  cancelMigration: vi.fn(),
  completeMigration: vi.fn(),
  getMigrationStatus: vi.fn(),
  parseBackupFile: vi.fn(),
  restoreArchiveBackup: vi.fn(),
  restoreMigration: vi.fn(),
  startMigration: vi.fn(),
  verifyMigration: vi.fn()
}));

vi.mock("../api/client", () => ({
  cancelMigration: mocks.cancelMigration,
  completeMigration: mocks.completeMigration,
  getMigrationStatus: mocks.getMigrationStatus,
  restoreMigration: mocks.restoreMigration,
  startMigration: mocks.startMigration,
  verifyMigration: mocks.verifyMigration
}));
vi.mock("../lib/backup-client", () => ({ parseBackupFile: mocks.parseBackupFile }));
vi.mock("../lib/archive-storage", () => ({ restoreArchiveBackup: mocks.restoreArchiveBackup }));

const user = { id: "user-1", email: "user@example.com", displayName: "Test User" };

describe("MigrationScreen cleanup safety UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMigrationStatus.mockResolvedValue({
      state: { migrationState: "migration_locked" },
      migration: { migrationId: "migration-1", status: "awaiting_restore", backupChecksum: "a".repeat(64), cleanupCompleted: true }
    });
  });

  it("hides cancellation and shows recovery guidance after cleanup", async () => {
    render(<MigrationScreen user={user} onCompleted={vi.fn()} />);

    await screen.findByText("データの移行準備は完了しています。元の端末に戻す場合も、保存したバックアップから復元してください。");
    expect(screen.queryByRole("button", { name: "機種変更をキャンセル" })).not.toBeInTheDocument();
    expect(screen.getByText("データの移行準備は完了しています。元の端末に戻す場合も、保存したバックアップから復元してください。")).toBeInTheDocument();
  });

  it("keeps cancellation available before cleanup", async () => {
    mocks.getMigrationStatus.mockResolvedValue({
      state: { migrationState: "migration_locked" },
      migration: { migrationId: "migration-1", status: "locked", backupChecksum: "a".repeat(64), cleanupCompleted: false }
    });
    render(<MigrationScreen user={user} onCompleted={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "機種変更をキャンセル" })).toBeInTheDocument();
    expect(screen.queryByText("データの移行準備は完了しています。元の端末に戻す場合も、保存したバックアップから復元してください。")).not.toBeInTheDocument();
  });
});
