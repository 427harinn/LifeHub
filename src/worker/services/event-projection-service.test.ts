import { describe, expect, it } from "vitest";
import { dayToRange, isDateKey, monthKeyToGridRange } from "./event-projection-service";

describe("scheduled Event projection range", () => {
  it("requests the six-week Calendar grid range around the month", () => {
    expect(monthKeyToGridRange("2026-09")).toEqual({ startDate: "2026-08-30", endDate: "2026-10-10" });
  });

  it("keeps Daily projection to the requested date", () => {
    expect(dayToRange("2026-09-08")).toEqual({ startDate: "2026-09-08", endDate: "2026-09-08" });
  });

  it("rejects malformed and impossible dates", () => {
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-09-08")).toBe(true);
    expect(monthKeyToGridRange("2026-13")).toBeNull();
  });
});
