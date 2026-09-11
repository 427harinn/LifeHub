import { describe, expect, it } from "vitest";
import { isMoneyDate, moneyFollowingBoundary, moneyOccurrenceKey, moneySummaryFor, moneyYearFromOccurrences, projectMoneyItems } from "./money-service";
import { completedMoneyRange } from "./money-settlement-service";
import { MoneyCategoryRepository } from "../repositories/money-category-repository";
import { MoneyOccurrenceOverrideRepository } from "../repositories/money-occurrence-override-repository";
import { MoneyOccurrenceSettlementRepository } from "../repositories/money-occurrence-settlement-repository";
import { MoneyRepository } from "../repositories/money-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { MoneyService } from "./money-service";
import type { MoneyCategory, MoneyItem, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, RecurrenceRule } from "../types";

const item = (overrides: Partial<MoneyItem> = {}): MoneyItem => ({
  id: "money-1", userId: "user-1", type: "expense", title: "家賃", categoryId: "category-1", plannedAmount: 70000,
  date: "2026-09-01", time: null, recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...overrides
});
const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: "rule-1", userId: "user-1", frequency: "monthly", interval: 1, weekdays: null, dayOfMonth: 31,
  startsOn: "2026-01-31", endsOn: null, createdAt: "", updatedAt: "", ...overrides
});
const category: MoneyCategory = { id: "category-1", userId: "user-1", type: "expense", name: "固定費", colorKey: null, sortOrder: 0, active: true, createdAt: "", updatedAt: "" };

describe("Money validation and projection primitives", () => {
  it("accepts valid dates and rejects impossible dates", () => {
    expect(isMoneyDate("2026-09-08")).toBe(true);
    expect(isMoneyDate("2026-02-30")).toBe(false);
    expect(isMoneyDate("2026-13-01")).toBe(false);
  });

  it("projects expense-only, income-only, both, and empty summaries", () => {
    expect(moneySummaryFor([item()])).toEqual({ expenseForecast: 70000, incomeForecast: 0, remaining: -70000 });
    expect(moneySummaryFor([item({ type: "income", plannedAmount: 210000 })])).toEqual({ expenseForecast: 0, incomeForecast: 210000, remaining: 210000 });
    expect(moneySummaryFor([item(), item({ id: "money-2", type: "income", plannedAmount: 210000 })])).toEqual({ expenseForecast: 70000, incomeForecast: 210000, remaining: 140000 });
    expect(moneySummaryFor([])).toEqual({ expenseForecast: 0, incomeForecast: 0, remaining: 0 });
  });

  it("projects monthly rent and salary across month boundaries with stable keys", () => {
    const rent = item({ id: "rent", title: "家賃", plannedAmount: 70000, date: "2026-01-31", recurrenceRuleId: "rule-rent" });
    const salary = item({ id: "salary", type: "income", title: "給料", plannedAmount: 210000, date: "2026-01-01", recurrenceRuleId: "rule-salary" });
    const occurrences = projectMoneyItems([
      { item: rent, rule: rule({ id: "rule-rent", dayOfMonth: 31 }) },
      { item: salary, rule: rule({ id: "rule-salary", dayOfMonth: 1, startsOn: "2026-01-01" }) }
    ], [category, { ...category, id: "income-category", type: "income", name: "給料" }], "2026-02-01", "2026-03-31");
    expect(occurrences.map((entry) => [entry.title, entry.date, entry.occurrenceKey])).toEqual([
      ["給料", "2026-02-01", "money:salary:2026-02-01"],
      ["家賃", "2026-02-28", "money:rent:2026-02-28"],
      ["給料", "2026-03-01", "money:salary:2026-03-01"],
      ["家賃", "2026-03-31", "money:rent:2026-03-31"]
    ]);
  });

  it("projects weekly, interval, and endsOn recurrence", () => {
    const weekly = item({ id: "weekly", title: "週次", date: "2026-09-01", recurrenceRuleId: "rule-weekly" });
    const interval = item({ id: "interval", title: "隔週", date: "2026-09-01", recurrenceRuleId: "rule-interval" });
    const ended = item({ id: "ended", title: "終了", date: "2026-09-01", recurrenceRuleId: "rule-ended" });
    const entries = projectMoneyItems([
      { item: weekly, rule: rule({ id: "rule-weekly", frequency: "weekly", interval: 1, weekdays: [2], dayOfMonth: null, startsOn: "2026-09-01" }) },
      { item: interval, rule: rule({ id: "rule-interval", frequency: "weekly", interval: 2, weekdays: [2], dayOfMonth: null, startsOn: "2026-09-01" }) },
      { item: ended, rule: rule({ id: "rule-ended", frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-01", endsOn: "2026-09-03" }) }
    ], [category], "2026-09-01", "2026-09-15");
    expect(entries.filter((entry) => entry.title === "週次").map((entry) => entry.date)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15"]);
    expect(entries.filter((entry) => entry.title === "隔週").map((entry) => entry.date)).toEqual(["2026-09-01", "2026-09-15"]);
    expect(entries.filter((entry) => entry.title === "終了").map((entry) => entry.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("applies occurrence overrides without changing the next occurrence", () => {
    const recurring = item({ recurrenceRuleId: "rule-1", date: "2026-09-01" });
    const key = moneyOccurrenceKey(recurring.id, "2026-09-08");
    const override: MoneyOccurrenceOverride = { id: "override-1", userId: "user-1", moneyItemId: recurring.id, occurrenceKey: key, overrideType: "modified", patch: { title: "臨時電気", plannedAmount: 5000, date: "2026-09-08" }, createdAt: "", updatedAt: "" };
    const entries = projectMoneyItems([{ item: recurring, rule: rule({ frequency: "daily", dayOfMonth: null, startsOn: "2026-09-01" }) }], [category], "2026-09-01", "2026-09-15", 1, [override]);
    expect(entries.find((entry) => entry.occurrenceKey === key)).toMatchObject({ title: "臨時電気", plannedAmount: 5000, effectiveAmount: 5000 });
    expect(entries.find((entry) => entry.date === "2026-09-15")).toMatchObject({ title: "家賃", plannedAmount: 70000 });
  });

  it("keeps cancelled occurrences out and gives actual priority over planned", () => {
    const recurring = item({ recurrenceRuleId: "rule-1", date: "2026-09-01" });
    const cancelled: MoneyOccurrenceOverride = { id: "cancelled", userId: "user-1", moneyItemId: recurring.id, occurrenceKey: moneyOccurrenceKey(recurring.id, "2026-09-08"), overrideType: "cancelled", patch: null, createdAt: "", updatedAt: "" };
    const reducedPlan: MoneyOccurrenceOverride = { id: "reduced-plan", userId: "user-1", moneyItemId: recurring.id, occurrenceKey: moneyOccurrenceKey(recurring.id, "2026-09-15"), overrideType: "modified", patch: { plannedAmount: 4000 }, createdAt: "", updatedAt: "" };
    const actual: MoneyOccurrenceSettlement = { id: "actual", userId: "user-1", moneyItemId: recurring.id, occurrenceKey: moneyOccurrenceKey(recurring.id, "2026-09-15"), status: "actual", amount: 5200, finalizedAt: "", updatedAt: "", estimatedAmount: null };
    const entries = projectMoneyItems([{ item: recurring, rule: rule({ frequency: "weekly", weekdays: [2], dayOfMonth: null, startsOn: "2026-09-01" }) }], [category], "2026-09-01", "2026-09-15", 1, [cancelled, reducedPlan], [actual], "2026-09");
    expect(entries.map((entry) => entry.date)).toEqual(["2026-09-01", "2026-09-15"]);
    expect(entries.find((entry) => entry.date === "2026-09-15")).toMatchObject({ effectiveAmount: 5200, signedAmount: -5200, settlementStatus: "actual", displayState: "実績" });
  });

  it("uses estimated actual for past months and remains fixed after a base change", () => {
    const recurring = item({ recurrenceRuleId: "rule-1", date: "2026-09-01", plannedAmount: 12000 });
    const key = moneyOccurrenceKey(recurring.id, "2026-09-01");
    const settlement: MoneyOccurrenceSettlement = { id: "estimated", userId: "user-1", moneyItemId: recurring.id, occurrenceKey: key, status: "estimated_actual", amount: 10000, finalizedAt: "", updatedAt: "", estimatedAmount: null };
    const entries = projectMoneyItems([{ item: recurring, rule: rule({ frequency: "daily", dayOfMonth: null, startsOn: "2026-09-01" }) }], [category], "2026-09-01", "2026-10-01", 1, [], [settlement], "2026-10");
    expect(entries.find((entry) => entry.date === "2026-09-01")).toMatchObject({ plannedAmount: 12000, effectiveAmount: 10000, settlementStatus: "estimated_actual" });
  });

  it("restores a settled past occurrence after the series recurrence date changes", () => {
    const rent = item({ id: "rent", date: "2026-09-09", plannedAmount: 75000, recurrenceRuleId: "rule-rent" });
    const settledKey = moneyOccurrenceKey(rent.id, "2026-09-09");
    const settlement: MoneyOccurrenceSettlement = { id: "rent-settlement", userId: "user-1", moneyItemId: rent.id, occurrenceKey: settledKey, status: "actual", amount: 70000, finalizedAt: "2026-09-10T00:00:00.000Z", updatedAt: "", estimatedAmount: null };
    const entries = projectMoneyItems([{ item: rent, rule: rule({ id: "rule-rent", dayOfMonth: 15, startsOn: "2026-09-09" }) }], [category], "2026-09-01", "2026-10-31", 1, [], [settlement], "2026-10");
    expect(entries.find((entry) => entry.occurrenceKey === settledKey)).toMatchObject({ date: "2026-09-09", effectiveAmount: 70000, settlementStatus: "actual" });
    expect(entries.find((entry) => entry.date === "2026-10-15")).toMatchObject({ plannedAmount: 75000, effectiveAmount: 75000, settlementStatus: null });
  });

  it("uses the original occurrence key date as a following split boundary", () => {
    const key = moneyOccurrenceKey("rent", "2026-09-10");
    expect(moneyFollowingBoundary(key, "rent")).toBe("2026-09-10");
    expect(moneyFollowingBoundary(key, "other-rent")).toBeNull();
  });

  it("splits a moved occurrence at its original key date and carries its override forward", async () => {
    const movedItem = item({ id: "moved-rent", date: "2026-09-10", plannedAmount: 70000, recurrenceRuleId: "moved-rule" });
    const movedRule = rule({ id: "moved-rule", frequency: "daily", dayOfMonth: null, startsOn: "2026-09-10" });
    const movedKey = moneyOccurrenceKey(movedItem.id, "2026-09-10");
    const movedOverride: MoneyOccurrenceOverride = { id: "moved-override", userId: "user-1", moneyItemId: movedItem.id, occurrenceKey: movedKey, overrideType: "modified", patch: { date: "2026-09-12", plannedAmount: 70000 }, createdAt: "", updatedAt: "" };
    const movedSettlement: MoneyOccurrenceSettlement = { id: "moved-settlement", userId: "user-1", moneyItemId: movedItem.id, occurrenceKey: movedKey, status: "actual", amount: 68000, finalizedAt: "", updatedAt: "", estimatedAmount: null };
    const money = Object.create(MoneyRepository.prototype) as MoneyRepository;
    const categories = Object.create(MoneyCategoryRepository.prototype) as MoneyCategoryRepository;
    const recurrences = Object.create(RecurrenceRepository.prototype) as RecurrenceRepository;
    const overrides = Object.create(MoneyOccurrenceOverrideRepository.prototype) as MoneyOccurrenceOverrideRepository;
    const settlements = Object.create(MoneyOccurrenceSettlementRepository.prototype) as MoneyOccurrenceSettlementRepository;
    let updatedRule: RecurrenceRule | null = null;
    let createdRule: RecurrenceRule | null = null;
    let createdItem: MoneyItem | null = null;
    const copiedOverrides: Array<{ moneyItemId: string; occurrenceKey: string; patch: Partial<MoneyItem> | null }> = [];
    const copiedSettlements: Array<{ moneyItemId: string; occurrenceKey: string; status: string; amount: number }> = [];
    money.getById = () => Promise.resolve(movedItem);
    money.listForProjection = () => Promise.resolve([movedItem]);
    money.create = (_userId, input, recurrenceRuleId, now) => { createdItem = { ...movedItem, ...input, id: "split-rent", recurrenceRuleId, createdAt: now, updatedAt: now }; return Promise.resolve(createdItem); };
    categories.getById = () => Promise.resolve(category);
    categories.list = () => Promise.resolve([category]);
    recurrences.getById = () => Promise.resolve(movedRule);
    recurrences.update = (_userId, _id, input, now) => { updatedRule = { ...movedRule, ...input, updatedAt: now }; return Promise.resolve(updatedRule); };
    recurrences.create = (_userId, input, now) => { createdRule = { ...movedRule, ...input, id: "split-rule", createdAt: now, updatedAt: now }; return Promise.resolve(createdRule); };
    overrides.get = () => Promise.resolve(movedOverride);
    overrides.listForItem = () => Promise.resolve([movedOverride]);
    overrides.upsert = (_userId, moneyItemId, occurrenceKey, _type, patch) => { copiedOverrides.push({ moneyItemId, occurrenceKey, patch }); return Promise.resolve(movedOverride); };
    settlements.listForUser = () => Promise.resolve([movedSettlement]);
    settlements.upsert = (_userId, moneyItemId, occurrenceKey, status, amount) => { copiedSettlements.push({ moneyItemId, occurrenceKey, status, amount }); return Promise.resolve({ ...movedSettlement, moneyItemId, occurrenceKey, status, amount }); };
    const service = new MoneyService(money, categories, recurrences, overrides, settlements);
    await service.update("user-1", movedItem.id, { scope: "following", occurrenceKey: movedKey, title: "家賃変更", plannedAmount: 75000, categoryId: category.id, date: "2026-09-12", memo: null, recurrence: { frequency: "daily", interval: 1, weekdays: null, dayOfMonth: null, startsOn: "2026-09-12", endsOn: null } }, "2026-09-01T00:00:00.000Z");
    expect(updatedRule).toMatchObject({ endsOn: "2026-09-09" });
    expect(createdRule).toMatchObject({ startsOn: "2026-09-10" });
    expect(createdItem).toMatchObject({ id: "split-rent", date: "2026-09-10", plannedAmount: 75000 });
    expect(copiedOverrides).toEqual([{ moneyItemId: "split-rent", occurrenceKey: moneyOccurrenceKey("split-rent", "2026-09-10"), patch: movedOverride.patch }]);
    expect(copiedSettlements).toEqual([{ moneyItemId: "split-rent", occurrenceKey: moneyOccurrenceKey("split-rent", "2026-09-10"), status: "actual", amount: 68000 }]);
  });

  it("uses the user's local month boundary for settlement", () => {
    expect(completedMoneyRange(new Date("2026-10-01T00:30:00.000Z"), "Asia/Tokyo")).toEqual({ startDate: "0001-01-01", endDate: "2026-09-30", currentMonth: "2026-10" });
    expect(completedMoneyRange(new Date("2026-09-30T14:59:00.000Z"), "Asia/Tokyo").endDate).toBe("2026-08-31");
  });

  it("returns twelve months with forecast and actual values while leaving future actual months undefined", () => {
    const occurrences = projectMoneyItems([
      { item: item({ id: "jan", date: "2026-01-15", plannedAmount: 10000 }), rule: null },
      { item: item({ id: "feb", date: "2026-02-15", plannedAmount: 12000 }), rule: null },
      { item: item({ id: "sep", date: "2026-09-15", plannedAmount: 9000 }), rule: null },
      { item: item({ id: "oct", date: "2026-10-15", plannedAmount: 11000 }), rule: null },
      { item: item({ id: "income", type: "income", date: "2026-02-01", plannedAmount: 210000, categoryId: "income-category" }), rule: null }
    ], [category, { ...category, id: "income-category", type: "income", name: "給料", colorKey: "gold" }], "2026-01-01", "2026-12-31", 1, [], [
      { id: "jan-settlement", userId: "user-1", moneyItemId: "jan", occurrenceKey: moneyOccurrenceKey("jan", "2026-01-15"), status: "estimated_actual", amount: 9500, finalizedAt: "", updatedAt: "", estimatedAmount: null },
      { id: "feb-settlement", userId: "user-1", moneyItemId: "feb", occurrenceKey: moneyOccurrenceKey("feb", "2026-02-15"), status: "actual", amount: 13000, finalizedAt: "", updatedAt: "", estimatedAmount: null }
    ], "2026-09");
    const result = moneyYearFromOccurrences(2026, occurrences, "2026-09");
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({ month: "2026-01", expenseForecast: 9500, expenseActual: 9500 });
    expect(result.months[1]).toMatchObject({ month: "2026-02", expenseForecast: 13000, expenseActual: 13000, incomeForecast: 210000, incomeActual: 0 });
    expect(result.months[8]).toMatchObject({ month: "2026-09", expenseForecast: 9000, expenseActual: 0 });
    expect(result.months[9]).toMatchObject({ month: "2026-10", expenseForecast: 11000, expenseActual: null, incomeActual: null });
    expect(result.summary).toMatchObject({ expenseForecast: 42500, incomeForecast: 210000, remainingForecast: 167500, expenseActual: 22500, incomeActual: 0, remainingActual: -22500 });
    expect(result.categoryForecast[0]).toMatchObject({ category: { id: "category-1" }, amountForecast: 42500 });
    expect(result.categoryActual[0]).toMatchObject({ category: { id: "category-1" }, amountActual: 22500 });
  });

  it("keeps a recurring occurrence across the year boundary", () => {
    const recurring = item({ id: "year-boundary", date: "2025-12-31", recurrenceRuleId: "year-boundary-rule" });
    const entries = projectMoneyItems([{ item: recurring, rule: rule({ id: "year-boundary-rule", startsOn: "2025-12-31", dayOfMonth: 31 }) }], [category], "2025-12-01", "2026-01-31");
    expect(entries.map((entry) => entry.date)).toEqual(["2025-12-31", "2026-01-31"]);
  });
});
