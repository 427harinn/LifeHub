import { ARCHIVE_DB_NAME, ARCHIVE_SCHEMA_VERSION, archiveChecksum, archiveRecordCount, archiveRecordsToRows, canonicalSerialize, type ArchiveBundle, type ArchiveMetadata, type ArchiveRecord, type ArchiveRecordType } from "./archive";

type StoredRow = ArchiveRecord & { rowKey: string; archiveBatchId: string; retentionBoundary: string; ordinal: number };
type StoredBatch = ArchiveMetadata & { id: string };
type StoredSearchIndex = { id: string; userId: string; archiveBatchId: string; type: ArchiveRecordType; text: string; recordId: string };

export class ArchiveStorageError extends Error {
  constructor(message: string, readonly cause?: unknown) { super(message); this.name = "ArchiveStorageError"; }
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});
const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
});

export const openArchiveDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") { reject(new ArchiveStorageError("この端末ではIndexedDBを利用できません。")); return; }
  const request = indexedDB.open(ARCHIVE_DB_NAME, ARCHIVE_SCHEMA_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    const batches = db.objectStoreNames.contains("archiveBatches") ? request.transaction?.objectStore("archiveBatches") : db.createObjectStore("archiveBatches", { keyPath: "id" });
    if (batches && !batches.indexNames.contains("userId")) batches.createIndex("userId", "userId", { unique: false });
    if (batches && !batches.indexNames.contains("userIdStatus")) batches.createIndex("userIdStatus", ["userId", "status"], { unique: false });
    const records = db.objectStoreNames.contains("archiveRecords") ? request.transaction?.objectStore("archiveRecords") : db.createObjectStore("archiveRecords", { keyPath: "rowKey" });
    if (records && !records.indexNames.contains("batchId")) records.createIndex("batchId", "archiveBatchId", { unique: false });
    if (records && !records.indexNames.contains("userId")) records.createIndex("userId", "userId", { unique: false });
    if (records && !records.indexNames.contains("userType")) records.createIndex("userType", ["userId", "type"], { unique: false });
    if (records && !records.indexNames.contains("userDate")) records.createIndex("userDate", ["userId", "recordDate"], { unique: false });
    if (!db.objectStoreNames.contains("archivedSearchIndex")) {
      const index = db.createObjectStore("archivedSearchIndex", { keyPath: "id" });
      index.createIndex("userId", "userId", { unique: false });
      index.createIndex("batchId", "archiveBatchId", { unique: false });
      index.createIndex("userType", ["userId", "type"], { unique: false });
    } else {
      const index = request.transaction?.objectStore("archivedSearchIndex");
      if (index && !index.indexNames.contains("batchId")) index.createIndex("batchId", "archiveBatchId", { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new ArchiveStorageError("IndexedDBを開けませんでした。", request.error));
});

const deleteByIndex = async (store: IDBObjectStore, indexName: string, value: IDBValidKey) => {
  const index = store.index(indexName);
  const keys = await requestResult(index.getAllKeys(value));
  keys.forEach((key) => store.delete(key));
};

const searchText = (record: unknown) => {
  if (!record || typeof record !== "object") return "";
  const value = record as Record<string, unknown>;
  return [value.title, value.place, value.memo, value.content].filter((item): item is string => typeof item === "string").join(" ").toLocaleLowerCase();
};

export const saveArchiveBundle = async (bundle: ArchiveBundle): Promise<ArchiveMetadata> => {
  let db: IDBDatabase | null = null;
  try {
    db = await openArchiveDatabase();
    const rows = archiveRecordsToRows(bundle.records, bundle.userId);
    const recordCount = archiveRecordCount(bundle.records);
    const rowKeys = new Set(rows.map((row) => `${row.type}:${row.id}`));
    if (rows.length !== recordCount || bundle.manifest.records.some((entry) => !rowKeys.has(`${entry.type}:${entry.id}`))) throw new ArchiveStorageError("アーカイブ件数またはmanifest対象が一致しません。");
    const recordCountsByType = rows.reduce<Record<string, number>>((counts, row) => { counts[row.type] = (counts[row.type] ?? 0) + 1; return counts; }, {});
    const metadata: ArchiveMetadata = { archiveBatchId: bundle.archiveBatchId, userId: bundle.userId, schemaVersion: bundle.schemaVersion, archivedAt: bundle.generatedAt, retentionBoundary: bundle.retentionBoundary, minDate: rows.map((row) => row.recordDate).filter((date): date is string => Boolean(date)).sort()[0] ?? null, maxDate: rows.map((row) => row.recordDate).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null, recordCount, recordCountsByType, checksum: bundle.checksum, status: "verified" };
    const transaction = db.transaction(["archiveBatches", "archiveRecords", "archivedSearchIndex"], "readwrite");
    const batches = transaction.objectStore("archiveBatches");
    const existing = await requestResult(batches.get(bundle.archiveBatchId)) as StoredBatch | undefined;
    if (existing && (existing.userId !== bundle.userId || existing.checksum !== bundle.checksum)) throw new ArchiveStorageError("同じbatch IDに異なるアーカイブが存在します。");
    const recordsStore = transaction.objectStore("archiveRecords");
    const indexStore = transaction.objectStore("archivedSearchIndex");
    await deleteByIndex(recordsStore, "batchId", bundle.archiveBatchId);
    await deleteByIndex(indexStore, "batchId", bundle.archiveBatchId);
    batches.put({ ...metadata, id: bundle.archiveBatchId });
    rows.forEach((row, ordinal) => {
      const stored: StoredRow = { ...row, rowKey: `${bundle.archiveBatchId}:${row.type}:${row.id}`, archiveBatchId: bundle.archiveBatchId, retentionBoundary: bundle.retentionBoundary, ordinal };
      recordsStore.put(stored);
      if (row.type === "event" || row.type === "daily_note" || row.type === "money_item") indexStore.put({ id: stored.rowKey, userId: bundle.userId, archiveBatchId: bundle.archiveBatchId, type: row.type, recordId: row.id, text: searchText(row.record) } satisfies StoredSearchIndex);
    });
    await transactionDone(transaction);
    const verified = await readArchiveBatch(bundle.userId, bundle.archiveBatchId);
    if (!verified || verified.rows.length !== recordCount) throw new ArchiveStorageError("IndexedDB保存後の件数確認に失敗しました。");
    const expectedRows = rows.map((row, ordinal) => ({ ...row, ordinal }));
    const actualRows = verified.rows.map((row) => { const { rowKey, archiveBatchId, retentionBoundary, ...record } = row; void rowKey; void archiveBatchId; void retentionBoundary; return { ...record, ordinal: row.ordinal }; });
    if (canonicalSerialize(expectedRows) !== canonicalSerialize(actualRows)) throw new ArchiveStorageError("IndexedDB保存後のIDまたは内容確認に失敗しました。");
    if (await archiveChecksum(bundle) !== bundle.checksum) throw new ArchiveStorageError("アーカイブchecksumの検証に失敗しました。");
    return verified.metadata;
  } catch (error) {
    if (error instanceof ArchiveStorageError) throw error;
    throw new ArchiveStorageError("アーカイブを端末へ保存できませんでした。", error);
  } finally { db?.close(); }
};

const readArchiveBatch = async (userId: string, archiveBatchId: string) => {
  const db = await openArchiveDatabase();
  try {
    const transaction = db.transaction(["archiveBatches", "archiveRecords"], "readonly");
    const metadata = await requestResult(transaction.objectStore("archiveBatches").get(archiveBatchId)) as StoredBatch | undefined;
    const rows = await requestResult(transaction.objectStore("archiveRecords").index("batchId").getAll(archiveBatchId)) as StoredRow[];
    await transactionDone(transaction);
    if (!metadata || metadata.userId !== userId) return null;
    return { metadata, rows: rows.sort((left, right) => left.ordinal - right.ordinal) };
  } finally { db.close(); }
};

export const getArchiveMetadata = async (userId: string) => {
  const db = await openArchiveDatabase();
  try {
    const transaction = db.transaction("archiveBatches", "readonly");
    const values = await requestResult(transaction.objectStore("archiveBatches").index("userId").getAll(userId)) as StoredBatch[];
    await transactionDone(transaction);
    return values.sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
  } finally { db.close(); }
};

export const getArchiveRows = async (userId: string) => {
  const db = await openArchiveDatabase();
  try {
    const transaction = db.transaction("archiveRecords", "readonly");
    const rows = await requestResult(transaction.objectStore("archiveRecords").index("userId").getAll(userId)) as StoredRow[];
    await transactionDone(transaction);
    return rows.sort((left, right) => left.ordinal - right.ordinal);
  } finally { db.close(); }
};

export const updateArchiveStatus = async (userId: string, archiveBatchId: string, status: ArchiveMetadata["status"], confirmedAt?: string) => {
  const db = await openArchiveDatabase();
  try {
    const transaction = db.transaction("archiveBatches", "readwrite");
    const store = transaction.objectStore("archiveBatches");
    const current = await requestResult(store.get(archiveBatchId)) as StoredBatch | undefined;
    if (!current || current.userId !== userId) throw new ArchiveStorageError("アーカイブbatchが見つかりません。");
    store.put({ ...current, status, ...(confirmedAt ? { confirmedAt } : {}) });
    await transactionDone(transaction);
  } finally { db.close(); }
};

export const clearArchiveDatabaseForTests = async () => {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(ARCHIVE_DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed")); request.onblocked = () => resolve(); });
};
