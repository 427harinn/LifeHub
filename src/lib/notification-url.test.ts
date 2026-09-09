import { describe, expect, it } from "vitest";
import { eventNotificationUrl, resolveNotificationUrl, summaryNotificationUrl } from "./notification-url";

describe("notification deep links", () => {
  it("preserves date and recurring occurrence context", () => {
    expect(eventNotificationUrl("event 1", "2026-09-10", "event:event 1:2026-09-10T10:00")).toBe("/calendar?date=2026-09-10&event=event+1&occurrenceKey=event%3Aevent+1%3A2026-09-10T10%3A00");
    expect(summaryNotificationUrl("2026-09-10")).toBe("/calendar?date=2026-09-10");
  });

  it("rejects external and malformed URLs", () => {
    expect(resolveNotificationUrl("https://evil.example/phish")).toBe("/calendar");
    expect(resolveNotificationUrl("//evil.example/phish")).toBe("/calendar");
    expect(resolveNotificationUrl("/calendar?date=2026-09-10")).toBe("/calendar?date=2026-09-10");
    expect(resolveNotificationUrl("/%E0%A4%A")).toBe("/calendar");
  });
});
