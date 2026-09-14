import { getArchiveMetadata, getArchiveRows } from "./archive-storage";
import { BACKUP_MAX_BYTES, backupChecksum, createBackupManifest, normalizeBackup, serializeBackup, validateBackup, type BackupArchivePayload, type LifeHubBackup } from "./backup";
import { getBackupExport } from "../api/client";

const archivePayload = async (userId: string): Promise<BackupArchivePayload> => {
  const [metadata, rows] = await Promise.all([getArchiveMetadata(userId), getArchiveRows(userId)]);
  return {
    schemaVersion: 1,
    batches: metadata.map(({ id: _id, ...item }) => { void _id; return item; }),
    records: rows.map((row) => { const { rowKey: _rowKey, ordinal: _ordinal, ...record } = row; void _rowKey; void _ordinal; return record; })
  };
};

export const createFullBackup = async (userId: string) => {
  const cloud = await getBackupExport();
  const archive = await archivePayload(userId);
  const draft = normalizeBackup({ ...cloud, archive, manifest: {} as LifeHubBackup["manifest"], checksum: "" });
  const manifest = await createBackupManifest(userId, draft.cloud, draft.archive);
  const unsigned = normalizeBackup({ ...draft, manifest, checksum: "" });
  const backup: LifeHubBackup = { ...unsigned, checksum: await backupChecksum(unsigned) };
  const serialized = serializeBackup(backup);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  await validateBackup(JSON.parse(serialized), { currentUserId: userId, byteLength });
  return { backup, serialized, byteLength };
};

export const downloadBackup = (serialized: string, date = new Date()) => {
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > BACKUP_MAX_BYTES) throw new Error("バックアップファイルが大きすぎます。");
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lifehub-backup-${date.toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const parseBackupFile = async (file: File, currentUserId?: string) => {
  if (file.size > BACKUP_MAX_BYTES) throw new Error("バックアップファイルが大きすぎます。");
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error("JSONを読み取れませんでした。"); }
  return validateBackup(parsed, { currentUserId, byteLength: file.size });
};
