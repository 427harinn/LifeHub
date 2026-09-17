import { describe, expect, it } from "vitest";
import { emptyNotificationPreference, normalizeNotificationPreference, notificationPreferenceFromStorage, notificationPreferenceToStorage } from "./notification-preferences";

describe("notification last-used preference", () => {
  it("keeps none as an explicit preference and normalizes offsets", () => {
    expect(normalizeNotificationPreference({ mode: "none", templateId: "stale", offsets: [30, 30] })).toEqual(emptyNotificationPreference());
    expect(normalizeNotificationPreference({ mode: "custom", templateId: "ignored", offsets: [60, 30, 60] })).toEqual({ mode: "custom", templateId: null, offsets: [60, 30] });
  });

  it("round-trips template snapshots and safely falls back for deleted or invalid values", () => {
    const preference = { mode: "template" as const, templateId: "template-1", offsets: [60, 30] };
    expect(notificationPreferenceFromStorage(notificationPreferenceToStorage(preference))).toEqual(preference);
    expect(notificationPreferenceFromStorage(notificationPreferenceToStorage({ mode: "template", templateId: "deleted-template", offsets: [60, 30] }))).toEqual({ mode: "template", templateId: "deleted-template", offsets: [60, 30] });
    expect(notificationPreferenceFromStorage("not-json")).toEqual(emptyNotificationPreference());
    expect(notificationPreferenceFromStorage(JSON.stringify({ mode: "custom", offsets: [999999] }))).toEqual(emptyNotificationPreference());
  });
});
