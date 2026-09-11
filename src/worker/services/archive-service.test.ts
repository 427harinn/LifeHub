import { describe, expect, it } from "vitest";
import { retentionBoundaryFor } from "./archive-service";

describe("archive retention boundary", () => {
  it("uses the user's local calendar date and twelve calendar months", () => {
    expect(retentionBoundaryFor(new Date("2027-09-30T15:30:00.000Z"), "Asia/Tokyo")).toBe("2026-10-01");
    expect(retentionBoundaryFor(new Date("2027-10-01T00:30:00.000Z"), "America/Los_Angeles")).toBe("2026-09-30");
  });
});
