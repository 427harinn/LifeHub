import { describe, expect, it } from "vitest";
import { assertMigrationWritable } from "./middleware/migration-guard";

describe("migration_locked guard", () => {
  it("allows active user state", () => {
    expect(() => assertMigrationWritable("active")).not.toThrow();
  });

  it("rejects ordinary writes while migration is locked", () => {
    expect(() => assertMigrationWritable("migration_locked")).toThrow("機種変更中のため");
  });
});
