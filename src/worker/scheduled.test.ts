import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/notification-scheduler-service", () => ({
  runNotificationScheduler: vi.fn(() => Promise.resolve())
}));
vi.mock("./services/money-settlement-service", () => ({
  runMoneySettlement: vi.fn(() => Promise.resolve())
}));
vi.mock("./services/notification-job-service", () => ({
  runNotificationJobRefill: vi.fn(() => Promise.resolve())
}));
vi.mock("./services/notification-summary-job-service", () => ({
  NotificationSummaryJobService: vi.fn(),
  runNotificationSummaryJobRefill: vi.fn(() => Promise.resolve())
}));

import worker from "./index";
import { runMoneySettlement } from "./services/money-settlement-service";
import { runNotificationScheduler } from "./services/notification-scheduler-service";
import { runNotificationJobRefill } from "./services/notification-job-service";
import { runNotificationSummaryJobRefill } from "./services/notification-summary-job-service";

describe("scheduled handler", () => {
  const env = {} as Env;
  const scheduledTime = Date.parse("2026-10-01T15:02:00.000Z");

  beforeEach(() => vi.clearAllMocks());

  const invoke = (cron: string) => {
    const waitUntil = vi.fn();
    worker.scheduled({ cron, scheduledTime } as ScheduledController, env, { waitUntil } as unknown as ExecutionContext);
    return waitUntil;
  };

  it("runs only the notification scheduler for the five-minute cron", () => {
    const waitUntil = invoke("*/5 * * * *");

    expect(runNotificationScheduler).toHaveBeenCalledWith(env, new Date(scheduledTime));
    expect(runMoneySettlement).not.toHaveBeenCalled();
    expect(runNotificationJobRefill).not.toHaveBeenCalled();
    expect(runNotificationSummaryJobRefill).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("runs money settlement and both notification job refills for the daily cron", () => {
    const waitUntil = invoke("2 15 * * *");

    expect(runMoneySettlement).toHaveBeenCalledWith(env, new Date(scheduledTime));
    expect(runNotificationScheduler).not.toHaveBeenCalled();
    expect(runNotificationJobRefill).toHaveBeenCalledWith(env, new Date(scheduledTime));
    expect(runNotificationSummaryJobRefill).toHaveBeenCalledWith(env, new Date(scheduledTime));
    expect(waitUntil).toHaveBeenCalledTimes(3);
  });

  it("ignores unknown crons", () => {
    const waitUntil = invoke("0 * * * *");

    expect(runMoneySettlement).not.toHaveBeenCalled();
    expect(runNotificationScheduler).not.toHaveBeenCalled();
    expect(runNotificationJobRefill).not.toHaveBeenCalled();
    expect(runNotificationSummaryJobRefill).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
