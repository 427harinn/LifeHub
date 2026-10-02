import { describe, expect, it, vi } from "vitest";
import type { Event, RecurrenceRule } from "../types";
import { EventService } from "./event-service";

const baseEvent = (changes: Partial<Event> = {}): Event => ({ id: "event-1", userId: "user-1", category: "home", title: "予定", place: null, memo: null, timingType: "scheduled", allDay: false, startDate: "2026-09-01", startTime: "09:00", endDate: "2026-09-01", endTime: "10:00", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrenceRuleId: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...changes });
const rule: RecurrenceRule = { id: "rule-1", userId: "user-1", frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-01", endsOn: null, createdAt: "", updatedAt: "" };
const at = new Date("2026-09-01T00:00:00.000Z");

const setup = (recurring = false) => {
  const event = baseEvent({ recurrenceRuleId: recurring ? rule.id : null });
  const refresh = vi.fn(() => Promise.resolve(1));
  const repository = {
    getById: vi.fn(() => Promise.resolve(event)),
    create: vi.fn(() => Promise.resolve(baseEvent({ id: "event-2" }))),
    update: vi.fn(() => Promise.resolve(event)),
    softDelete: vi.fn(() => Promise.resolve(true))
  };
  const recurrenceRepository = {
    getById: vi.fn(() => Promise.resolve(recurring ? rule : null)),
    create: vi.fn(() => Promise.resolve({ ...rule, id: "rule-2" })),
    update: vi.fn(() => Promise.resolve(rule))
  };
  const occurrenceKey = "event:event-1:2026-09-03T09:00";
  const projection = { project: vi.fn(() => Promise.resolve([{ ...event, startDate: "2026-09-03", endDate: "2026-09-03", occurrenceKey, recurrence: recurring ? rule : null }])) };
  const overrideRepository = { upsert: vi.fn(() => Promise.resolve({})) };
  const notificationRepository = {
    replaceEventNotifications: vi.fn(() => Promise.resolve()),
    listEventNotificationsForEvent: vi.fn(() => Promise.resolve([{ id: "notification-1", userId: "user-1", eventId: "event-1", offsetMinutes: 0, sortOrder: 0, createdAt: "" }]))
  };
  const service = new EventService(repository as never, recurrenceRepository as never, overrideRepository as never, projection as never, notificationRepository as never, { refreshForEvent: refresh } as never);
  return { service, refresh, repository, recurrenceRepository, projection, overrideRepository, notificationRepository, occurrenceKey };
};

describe("EventService notification job refresh", () => {
  it("refreshes jobs after Event create", async () => {
    const { service, refresh } = setup();
    const created = await service.create("user-1", { title: "予定", category: "home", timingType: "scheduled", allDay: false, startDate: "2026-09-01", startTime: "09:00", endDate: "2026-09-01", endTime: "10:00", notifications: [0] }, "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledWith("user-1", created.id, at);
  });

  it("refreshes jobs after series update, including changed offsets", async () => {
    const { service, refresh, notificationRepository } = setup();
    await service.update("user-1", "event-1", { scope: "series", title: "更新", notifications: [30] }, "2026-09-01T00:00:00.000Z");
    expect(notificationRepository.replaceEventNotifications).toHaveBeenCalledWith("user-1", "event-1", [30], "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledWith("user-1", "event-1", at);
  });

  it("refreshes the series after modified occurrence update", async () => {
    const { service, refresh, overrideRepository, occurrenceKey } = setup(true);
    await service.update("user-1", "event-1", { scope: "occurrence", occurrenceKey, title: "変更" }, "2026-09-01T00:00:00.000Z");
    expect(overrideRepository.upsert).toHaveBeenCalledWith("user-1", "event-1", occurrenceKey, "modified", expect.objectContaining({ title: "変更" }), "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledWith("user-1", "event-1", at);
  });

  it("refreshes both old and new Events after following split", async () => {
    const { service, refresh, occurrenceKey } = setup(true);
    await service.update("user-1", "event-1", { scope: "following", occurrenceKey }, "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenNthCalledWith(1, "user-1", "event-1", at);
    expect(refresh).toHaveBeenNthCalledWith(2, "user-1", "event-2", at);
  });

  it("refreshes jobs after occurrence cancellation", async () => {
    const { service, refresh, occurrenceKey } = setup(true);
    await service.delete("user-1", "event-1", { scope: "occurrence", occurrenceKey }, "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledWith("user-1", "event-1", at);
  });

  it("refreshes the series after following deletion", async () => {
    const { service, refresh, occurrenceKey, recurrenceRepository } = setup(true);
    await service.delete("user-1", "event-1", { scope: "following", occurrenceKey }, "2026-09-01T00:00:00.000Z");
    expect(recurrenceRepository.update).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith("user-1", "event-1", at);
  });

  it("clears pending jobs after series deletion", async () => {
    const { service, refresh } = setup();
    await service.delete("user-1", "event-1", { scope: "series" }, "2026-09-01T00:00:00.000Z");
    expect(refresh).toHaveBeenCalledWith("user-1", "event-1", at);
  });
});
