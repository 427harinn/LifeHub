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
import { clearMemoryActiveSnapshots } from "./cache/active-snapshot";

const user = { id: "prefetch-user", email: "prefetch@example.com", displayName: "Prefetch" };
const settings = {
  userId: user.id,
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  morningSummaryEnabled: true,
  morningSummaryTime: "09:00",
  eveningSummaryEnabled: true,
  eveningSummaryTime: "21:00",
  periodDefaultDeadlineTime: "21:00",
  lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] },
  lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] }
};
const money = { occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] };
const calendarResponse = (month: string) => ({ month, range: { startDate: `${month}-01`, endDate: `${month}-28` }, events: [], money });
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const requestUrl = (input: RequestInfo | URL) => typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

describe("Calendar month prefetch", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/calendar?date=2026-09-24");
    clearMemoryActiveSnapshots();
    vi.restoreAllMocks();
  });

  it("prefetches previous and next months only after current network success", async () => {
    const pending = new Map<string, { resolve: (response: Response) => void }>();
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(requestUrl(input), window.location.origin);
      if (url.pathname === "/api/auth/me") return Promise.resolve(jsonResponse({ user }));
      if (url.pathname === "/api/settings") return Promise.resolve(jsonResponse({ settings }));
      if (url.pathname === "/api/user-state") return Promise.resolve(jsonResponse({ state: { migrationState: "active" } }));
      if (url.pathname !== "/api/calendar") return Promise.resolve(jsonResponse({}));
      const month = url.searchParams.get("month") ?? "";
      requests.push(month);
      if (month === "2026-09") return Promise.resolve(jsonResponse(calendarResponse(month)));
      return new Promise<Response>((resolve) => pending.set(month, { resolve }));
    });

    render(<App />);
    await waitFor(() => expect(requests).toEqual(expect.arrayContaining(["2026-09", "2026-08", "2026-10"])));
    expect(screen.getByRole("heading", { name: "2026年9月" })).toBeInTheDocument();
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
    expect(requests.filter((month) => month === "2026-08")).toHaveLength(1);
    expect(requests.filter((month) => month === "2026-10")).toHaveLength(1);

    pending.get("2026-08")?.resolve(jsonResponse(calendarResponse("2026-08")));
    pending.get("2026-10")?.resolve(jsonResponse(calendarResponse("2026-10")));
    await waitFor(() => expect(screen.getByRole("heading", { name: "2026年9月" })).toBeInTheDocument());
  });

  it("uses a prefetched month immediately while refreshing it in the background", async () => {
    const requests: string[] = [];
    let refreshResolve!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(requestUrl(input), window.location.origin);
      if (url.pathname === "/api/auth/me") return Promise.resolve(jsonResponse({ user }));
      if (url.pathname === "/api/settings") return Promise.resolve(jsonResponse({ settings }));
      if (url.pathname === "/api/user-state") return Promise.resolve(jsonResponse({ state: { migrationState: "active" } }));
      if (url.pathname !== "/api/calendar") return Promise.resolve(jsonResponse({}));
      const month = url.searchParams.get("month") ?? "";
      requests.push(month);
      if (month === "2026-10" && requests.filter((value) => value === month).length > 1) return new Promise<Response>((resolve) => { refreshResolve = resolve; });
      return Promise.resolve(jsonResponse(calendarResponse(month)));
    });

    render(<App />);
    await waitFor(() => expect(requests.filter((month) => month === "2026-10")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(await screen.findByRole("heading", { name: "2026年10月" })).toBeInTheDocument();
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
    expect(requests.filter((month) => month === "2026-10")).toHaveLength(2);
    refreshResolve(jsonResponse(calendarResponse("2026-10")));
  });
});

describe("Money month local-first", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/money");
    clearMemoryActiveSnapshots();
    vi.restoreAllMocks();
  });

  it("prefetches previous and next Money months only after current network success", async () => {
    const pending = new Map<string, { resolve: (response: Response) => void }>();
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(requestUrl(input), window.location.origin);
      if (url.pathname === "/api/auth/me") return Promise.resolve(jsonResponse({ user }));
      if (url.pathname === "/api/settings") return Promise.resolve(jsonResponse({ settings }));
      if (url.pathname === "/api/user-state") return Promise.resolve(jsonResponse({ state: { migrationState: "active" } }));
      if (url.pathname !== "/api/money/month") return Promise.resolve(jsonResponse({}));
      const month = url.searchParams.get("month") ?? "";
      requests.push(month);
      if (month === "2026-09") return Promise.resolve(jsonResponse({ month, ...money }));
      return new Promise<Response>((resolve) => pending.set(month, { resolve }));
    });

    render(<App />);
    await waitFor(() => expect(requests).toEqual(expect.arrayContaining(["2026-09", "2026-08", "2026-10"])));
    expect(screen.getByRole("heading", { name: "2026年9月" })).toBeInTheDocument();
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
    expect(requests.filter((month) => month === "2026-08")).toHaveLength(1);
    expect(requests.filter((month) => month === "2026-10")).toHaveLength(1);
    pending.get("2026-08")?.resolve(jsonResponse({ month: "2026-08", ...money }));
    pending.get("2026-10")?.resolve(jsonResponse({ month: "2026-10", ...money }));
  });

  it("uses a prefetched Money month immediately while refreshing it", async () => {
    const requests: string[] = [];
    let refreshResolve!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(requestUrl(input), window.location.origin);
      if (url.pathname === "/api/auth/me") return Promise.resolve(jsonResponse({ user }));
      if (url.pathname === "/api/settings") return Promise.resolve(jsonResponse({ settings }));
      if (url.pathname === "/api/user-state") return Promise.resolve(jsonResponse({ state: { migrationState: "active" } }));
      if (url.pathname !== "/api/money/month") return Promise.resolve(jsonResponse({}));
      const month = url.searchParams.get("month") ?? "";
      requests.push(month);
      if (month === "2026-10" && requests.filter((value) => value === month).length > 1) return new Promise<Response>((resolve) => { refreshResolve = resolve; });
      return Promise.resolve(jsonResponse({ month, ...money }));
    });

    render(<App />);
    await waitFor(() => expect(requests.filter((month) => month === "2026-10")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(await screen.findByRole("heading", { name: "2026年10月" })).toBeInTheDocument();
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
    expect(requests.filter((month) => month === "2026-10")).toHaveLength(2);
    refreshResolve(jsonResponse({ month: "2026-10", ...money }));
  });
});
