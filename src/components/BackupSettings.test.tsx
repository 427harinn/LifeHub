import { fireEvent, render, screen } from "@testing-library/react";
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

  it("exposes status failure as an alert and can retry", async () => {
    mocks.getMigrationStatus.mockRejectedValueOnce(new Error("network"));
    mocks.getMigrationStatus.mockResolvedValueOnce({
      state: { migrationState: "migration_locked" },
      migration: { migrationId: "migration-1", status: "awaiting_restore", backupChecksum: "a".repeat(64), cleanupCompleted: false }
    });
    render(<MigrationScreen user={user} onCompleted={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("機種変更の状態を確認できませんでした。");
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    screen.getByRole("button", { name: "再試行" }).click();
    await screen.findByRole("button", { name: "機種変更をキャンセル" });
    expect(mocks.getMigrationStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps the lock recovery flow available after restore failure", async () => {
    const backup = {
      checksum: "a".repeat(64),
      manifest: { countsByType: {}, archiveRecordCount: 0, minDate: null, maxDate: null }
    };
    mocks.getMigrationStatus.mockResolvedValue({
      state: { migrationState: "migration_locked" },
      migration: { migrationId: "migration-1", status: "awaiting_restore", backupChecksum: backup.checksum, cleanupCompleted: true }
    });
    mocks.parseBackupFile.mockResolvedValue({ backup });
    mocks.restoreMigration.mockRejectedValueOnce(new Error("restore network")).mockResolvedValueOnce({ restored: true });
    mocks.restoreArchiveBackup.mockResolvedValue([]);
    mocks.verifyMigration.mockResolvedValue({ verified: true });
    mocks.completeMigration.mockResolvedValue({ completed: true });
    const { container } = render(<MigrationScreen user={user} onCompleted={vi.fn()} />);

    const file = new File(["{}"], "backup.json", { type: "application/json" });
    await screen.findByRole("button", { name: "バックアップを選択" });
    fireEvent.change(container.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [file] } });
    await screen.findByRole("button", { name: "このバックアップを復元" });
    fireEvent.click(screen.getByRole("button", { name: "このバックアップを復元" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("restore network");
    expect(screen.getByRole("button", { name: "復元をもう一度試す" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "機種変更をキャンセル" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "復元をもう一度試す" }));
    await screen.findByText("復元が完了しました。");
    expect(mocks.restoreMigration).toHaveBeenCalledTimes(2);
  });
});
