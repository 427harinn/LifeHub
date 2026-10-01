import { describe, expect, it, vi } from "vitest";
import { EventOccurrenceOverrideRepository } from "./event-occurrence-override-repository";
import { RecurrenceRepository } from "./recurrence-repository";

const fakeDatabase = () => {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const call = { sql, bindings: [] as unknown[] };
    calls.push(call);
    const statement = {
      bind: (...bindings: unknown[]) => {
        call.bindings = bindings;
        return statement;
      },
      all: <T>() => Promise.resolve({ results: [] as T[] })
    };
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, calls, prepare };
};

describe("batch recurrence repositories", () => {
  it("returns empty lists without querying for empty IDs", async () => {
    const { db, prepare } = fakeDatabase();
    await expect(new RecurrenceRepository(db).listByIds("user-1", [])).resolves.toEqual([]);
    await expect(new EventOccurrenceOverrideRepository(db).listForEvents("user-1", [])).resolves.toEqual([]);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("binds user ownership and deduplicated IDs for both repositories", async () => {
    const { db, calls } = fakeDatabase();
    await new RecurrenceRepository(db).listByIds("user-1", ["rule-1", "rule-1", "rule-2"]);
    await new EventOccurrenceOverrideRepository(db).listForEvents("user-2", ["event-1", "event-1"]);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain("WHERE user_id = ? AND id IN (?, ?)");
    expect(calls[0].bindings).toEqual(["user-1", "rule-1", "rule-2"]);
    expect(calls[1].sql).toContain("WHERE user_id = ? AND event_id IN (?)");
    expect(calls[1].bindings).toEqual(["user-2", "event-1"]);
    expect(calls[0].sql).not.toContain("rule-1");
  });

  it("splits IDs to stay within D1's 100 bound-parameter limit", async () => {
    const { db, calls } = fakeDatabase();
    const ids = Array.from({ length: 100 }, (_, index) => `event-${index}`);
    await new EventOccurrenceOverrideRepository(db).listForEvents("user-1", ids);

    expect(calls).toHaveLength(2);
    expect(calls[0].bindings).toHaveLength(100);
    expect(calls[1].bindings).toHaveLength(2);
  });
});
