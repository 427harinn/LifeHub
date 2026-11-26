import { describe, expect, it } from "vitest";
import { clearLastAuthUser, isAuthUser, readLastAuthSnapshotContext, readLastAuthUser, saveLastAuthSnapshotContext, saveLastAuthUser } from "./offline-session";

const user = { id: "user-1", email: "me@example.com", displayName: "自分" };

const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    setItem: (key: string, value: string) => { map.set(key, value); },
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => { map.delete(key); }
  };
};

describe("offline session (last auth user)", () => {
  it("round-trips a saved user", () => {
    const storage = fakeStorage();
    saveLastAuthUser(user, storage);
    expect(readLastAuthUser(storage)).toEqual(user);
  });

  it("clears the saved user", () => {
    const storage = fakeStorage();
    saveLastAuthUser(user, storage);
    clearLastAuthUser(storage);
    expect(readLastAuthUser(storage)).toBeNull();
  });

  it("returns null for missing or corrupt values", () => {
    const storage = fakeStorage();
    expect(readLastAuthUser(storage)).toBeNull();
    storage.setItem("lifehub:last-auth-user:v1", "{not-json");
    expect(readLastAuthUser(storage)).toBeNull();
    storage.setItem("lifehub:last-auth-user:v1", JSON.stringify({ id: "user-1" }));
    expect(readLastAuthUser(storage)).toBeNull();
  });

  it("stores and reads the snapshot context for the same user only", () => {
    const storage = fakeStorage();
    saveLastAuthUser(user, storage);
    saveLastAuthSnapshotContext(user.id, "Asia/Tokyo", 1, storage, 1234567890);
    expect(readLastAuthSnapshotContext(user.id, storage)).toEqual({ timezone: "Asia/Tokyo", weekStartsOn: 1, savedAt: 1234567890 });
    expect(readLastAuthSnapshotContext("another-user", storage)).toBeNull();
    // Re-saving the user (e.g. next login) preserves the context.
    saveLastAuthUser(user, storage);
    expect(readLastAuthSnapshotContext(user.id, storage)).not.toBeNull();
    // A different user replaces the record without the old context.
    saveLastAuthUser({ ...user, id: "user-2" }, storage);
    expect(readLastAuthSnapshotContext("user-2", storage)).toBeNull();
  });

  it("validates the auth user shape", () => {
    expect(isAuthUser(user)).toBe(true);
    expect(isAuthUser({ ...user, id: "" })).toBe(false);
    expect(isAuthUser(null)).toBe(false);
    expect(isAuthUser("user-1")).toBe(false);
  });

  it("does not throw when storage is unavailable", () => {
    const broken = {
      setItem: () => { throw new Error("denied"); },
      getItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); }
    };
    expect(() => saveLastAuthUser(user, broken)).not.toThrow();
    expect(readLastAuthUser(broken)).toBeNull();
    expect(() => clearLastAuthUser(broken)).not.toThrow();
  });
});
