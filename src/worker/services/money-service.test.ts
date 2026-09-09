import { describe, expect, it } from "vitest";
import { isMoneyDate, moneySummaryFor } from "./money-service";
import type { MoneyItem } from "../types";

const item = (overrides: Partial<MoneyItem> = {}): MoneyItem => ({
  id: "money-1", userId: "user-1", type: "expense", title: "家賃", categoryId: "category-1", plannedAmount: 70000,
  date: "2026-09-01", time: null, recurrenceRuleId: null, memo: null, active: true, deletedAt: null, createdAt: "", updatedAt: "", ...overrides
});

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
});
