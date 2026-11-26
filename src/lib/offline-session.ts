import type { AuthUser } from "../api/client";

// The last server-confirmed authenticated user, kept in localStorage so an
// offline cold start can restore the read-only snapshot view without asking
// the server. This is an identity hint for the local UI only: it never grants
// API access, and it is cleared on logout and whenever the server answers 401.
// The snapshot context (timezone / week start) is stored alongside it because
// snapshot keys are derived from those settings; the IndexedDB snapshot
// metadata remains the other source and is consulted as a fallback.
export const LAST_AUTH_USER_STORAGE_KEY = "lifehub:last-auth-user:v1";

export type LastAuthSnapshotContext = {
  timezone: string;
  weekStartsOn: 0 | 1;
  savedAt: number;
};

type LastAuthRecord = {
  user: AuthUser;
  snapshotContext?: LastAuthSnapshotContext;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

export const isAuthUser = (value: unknown): value is AuthUser => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.email === "string" && value.email.length > 0 &&
    typeof value.displayName === "string" && value.displayName.length > 0
  );
};

const isSnapshotContext = (value: unknown): value is LastAuthSnapshotContext => {
  if (!isRecord(value)) return false;
  return (
    typeof value.timezone === "string" && value.timezone.length > 0 &&
    (value.weekStartsOn === 0 || value.weekStartsOn === 1) &&
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
  );
};

const readRecord = (storage: Pick<Storage, "getItem">): LastAuthRecord | null => {
  try {
    const raw = storage.getItem(LAST_AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isAuthUser(parsed.user)) return null;
    const record: LastAuthRecord = { user: { id: parsed.user.id, email: parsed.user.email, displayName: parsed.user.displayName } };
    if (isSnapshotContext(parsed.snapshotContext)) record.snapshotContext = parsed.snapshotContext;
    return record;
  } catch {
    return null;
  }
};

const writeRecord = (record: LastAuthRecord, storage: Pick<Storage, "setItem">): void => {
  try {
    storage.setItem(LAST_AUTH_USER_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage can be unavailable (private mode, quota); offline restore is optional.
  }
};

export function saveLastAuthUser(user: AuthUser, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): void {
  const existing = readRecord(storage);
  const record: LastAuthRecord = { user: { id: user.id, email: user.email, displayName: user.displayName } };
  if (existing && existing.user.id === user.id && existing.snapshotContext) record.snapshotContext = existing.snapshotContext;
  writeRecord(record, storage);
}

export function saveLastAuthSnapshotContext(userId: string, timezone: string, weekStartsOn: number, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage, now: number = Date.now()): void {
  const existing = readRecord(storage);
  if (!existing || existing.user.id !== userId) return;
  if (weekStartsOn !== 0 && weekStartsOn !== 1) return;
  writeRecord({ user: existing.user, snapshotContext: { timezone, weekStartsOn, savedAt: now } }, storage);
}

export function readLastAuthUser(storage: Pick<Storage, "getItem"> = window.localStorage): AuthUser | null {
  return readRecord(storage)?.user ?? null;
}

export function readLastAuthSnapshotContext(userId: string, storage: Pick<Storage, "getItem"> = window.localStorage): LastAuthSnapshotContext | null {
  const record = readRecord(storage);
  if (!record || record.user.id !== userId) return null;
  return record.snapshotContext ?? null;
}

export function clearLastAuthUser(storage: Pick<Storage, "removeItem"> = window.localStorage): void {
  try {
    storage.removeItem(LAST_AUTH_USER_STORAGE_KEY);
  } catch {
    // Nothing depends on removal succeeding synchronously.
  }
}
