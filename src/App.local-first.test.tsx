import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const archiveState = vi.hoisted(() => {
  const makeDeferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
  return { rows: makeDeferred<unknown[]>(), metadata: makeDeferred<unknown[]>(), loaded: false };
});
const dailyState = vi.hoisted(() => {
  const makeDeferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
  return { response: makeDeferred<unknown>() };
});

vi.mock("./lib/archive-storage", () => ({
  ArchiveStorageError: class ArchiveStorageError extends Error {},
  getArchiveMetadata: () => archiveState.metadata.promise,
  getArchiveRows: () => archiveState.rows.promise.then((rows) => { archiveState.loaded = true; return rows; }),
  saveArchiveBundle: vi.fn(),
  updateArchiveStatus: vi.fn()
}));

import { App } from "./App";

const date = "2026-09-24";
const user = { id: "user-1", email: "me@example.com", displayName: "自分" };
const settings = { userId: user.id, timezone: "Asia/Tokyo", weekStartsOn: 1, morningSummaryEnabled: true, morningSummaryTime: "09:00", eveningSummaryEnabled: true, eveningSummaryTime: "21:00", periodDefaultDeadlineTime: "21:00", lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] }, lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] } };
const money = { occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] };
const archivedNote = { id: "archive-note", userId: user.id, date, content: "archive note", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const archiveRows = [{ type: "daily_note", id: archivedNote.id, userId: user.id, record: archivedNote, recordDate: date, updatedAt: archivedNote.updatedAt, archiveBatchId: "archive-batch", retentionBoundary: "2026-09-25" }];

const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const requestPath = (input: RequestInfo | URL) => typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

describe("Daily local-first archive reconciliation", () => {
  beforeEach(() => {
    window.history.pushState({}, "", `/daily?date=${date}`);
    vi.restoreAllMocks();
    archiveState.loaded = false;
    archiveState.rows = deferred<unknown[]>();
    archiveState.metadata = deferred<unknown[]>();
    dailyState.response = deferred<unknown>();
  });

  it("keeps an archive DailyNote when archive loading completes before Daily network", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const path = requestPath(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(response({ user }));
      if (path.endsWith("/api/settings")) return Promise.resolve(response({ settings }));
      if (path.endsWith("/api/user-state")) return Promise.resolve(response({ state: { migrationState: "active" } }));
      if (path.startsWith("/api/daily")) return dailyState.response.promise.then((body) => response(body));
      return Promise.resolve(response({}));
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "デイリー" })).toBeInTheDocument();
    await act(async () => {
      archiveState.rows.resolve(archiveRows);
      archiveState.metadata.resolve([]);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(archiveState.loaded).toBe(true));
    await act(async () => {
      dailyState.response.resolve({ date, events: [], dailyNote: null, money });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByText("archive note", { exact: true })).toBeInTheDocument();
  });
});
