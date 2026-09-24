export const ACTIVE_SNAPSHOT_DB_NAME = "lifehub-active-snapshots";
export const ACTIVE_SNAPSHOT_STORE_NAME = "snapshots";
export const ACTIVE_SNAPSHOT_DB_VERSION = 1;

export type ActiveSnapshotRecord = {
  schemaVersion: number;
  key: string;
  userId: string;
  timezone: string;
  weekStartsOn: number;
  savedAt: number;
  serverConfirmedAt: string;
  data: unknown;
};

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ACTIVE_SNAPSHOT_DB_NAME, ACTIVE_SNAPSHOT_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ACTIVE_SNAPSHOT_STORE_NAME)) {
        request.result.createObjectStore(ACTIVE_SNAPSHOT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
};

export const readActiveSnapshotRecord = async (key: string): Promise<ActiveSnapshotRecord | null> => {
  const database = await openDatabase();
  return new Promise<ActiveSnapshotRecord | null>((resolve, reject) => {
    const transaction = database.transaction(ACTIVE_SNAPSHOT_STORE_NAME, "readonly");
    const request = transaction.objectStore(ACTIVE_SNAPSHOT_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as ActiveSnapshotRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
  }).finally(() => database.close());
};

export const writeActiveSnapshotRecord = async (record: ActiveSnapshotRecord): Promise<void> => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ACTIVE_SNAPSHOT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ACTIVE_SNAPSHOT_STORE_NAME);
      const existingRequest = store.get(record.key);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as ActiveSnapshotRecord | undefined;
        if (!existing || existing.savedAt <= record.savedAt) store.put(record);
      };
      existingRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
};

export const deleteActiveSnapshotRecordsForUser = async (userId: string): Promise<void> => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ACTIVE_SNAPSHOT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ACTIVE_SNAPSHOT_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result as ActiveSnapshotRecord[])
          .filter((record) => record.userId === userId)
          .forEach((record) => store.delete(record.key));
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB delete aborted"));
    });
  } finally {
    database.close();
  }
};
