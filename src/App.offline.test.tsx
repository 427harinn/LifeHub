import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/archive-storage", () => ({
  ArchiveStorageError: class ArchiveStorageError extends Error {},
  getArchiveMetadata: vi.fn(() => Promise.resolve([])),
  getArchiveRows: vi.fn(() => Promise.resolve([])),
  saveArchiveBundle: vi.fn(),
  updateArchiveStatus: vi.fn()
}));

import { App } from "./App";
import { clearMemoryActiveSnapshots, isCalendarSnapshotData, writeServerConfirmedActiveSnapshot, type CalendarSnapshotData } from "./cache/active-snapshot";
import { saveLastAuthSnapshotContext, saveLastAuthUser } from "./lib/offline-session";
import type { Event } from "./api/client";

const user = { id: "offline-user", email: "offline@example.com", displayName: "オフライン" };
const money = { occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] };
const event: Event = {
  id: "event-offline-1", userId: user.id, category: "home", title: "オフラインで見る予定", place: null, memo: null, timingType: "scheduled", allDay: false,
  startDate: "2026-09-10", startTime: "09:00", endDate: "2026-09-10", endTime: "10:00", periodWindowType: null, periodAnchorDate: null,
  periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: null, active: true, deletedAt: null,
  createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z"
};
const calendarData: CalendarSnapshotData = { month: "2026-09", range: { startDate: "2026-08-30", endDate: "2026-10-10" }, events: [event], money };

describe("Offline read-only mode", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T03:00:00.000Z"));
    window.history.pushState({}, "", "/calendar");
    localStorage.clear();
    clearMemoryActiveSnapshots();
    vi.restoreAllMocks();
    saveLastAuthUser(user);
    saveLastAuthSnapshotContext(user.id, "Asia/Tokyo", 1);
    await writeServerConfirmedActiveSnapshot({ userId: user.id, timezone: "Asia/Tokyo", weekStartsOn: 1, month: "2026-09" }, calendarData, isCalendarSnapshotData);
  });

  it("restores the snapshot calendar with an offline banner when the network is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "2026年9月" })).toBeInTheDocument();
    expect(await screen.findByText(/オフライン中です/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "ログイン" })).not.toBeInTheDocument();
    // The add flow is blocked in offline mode.
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(await screen.findByText(/オフライン中は編集できません/)).toBeInTheDocument();
  });

  it("does not restore a session when the server answers 401", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401, headers: { "content-type": "application/json" } })));
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/オフライン中です/)).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "2026年9月" })).not.toBeInTheDocument();
    expect(localStorage.getItem("lifehub:last-auth-user:v1")).toBeNull();
  });
});
