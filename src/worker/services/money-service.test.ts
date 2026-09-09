import { describe, expect, it } from "vitest";
import { isMoneyDate, moneySummaryFor, projectMoneyItems } from "./money-service";
import type { MoneyCategory, MoneyItem, RecurrenceRule } from "../types";

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
});
