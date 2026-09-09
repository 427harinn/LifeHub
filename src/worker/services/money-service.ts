import { AppError, validationError } from "../lib/errors";
import { MoneyCategoryRepository } from "../repositories/money-category-repository";
import { MoneyRepository } from "../repositories/money-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import type { MoneyCategory, MoneyItem, MoneyItemInput, MoneyType, RecurrenceRule, RecurrenceRuleInput } from "../types";
import { isDateKey, normalizeRecurrenceInput } from "./recurrence-service";
import { occurrenceDates } from "./event-projection-service";

export const isMoneyDate = (value: unknown): value is string => isDateKey(typeof value === "string" ? value : "");
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
export type MoneyOccurrence = MoneyItem & { category: MoneyCategory | null; signedAmount: number; occurrenceKey: string | null; recurrence: RecurrenceRule | null; definitionDate: string };
export type MoneySummary = { expenseForecast: number; incomeForecast: number; remaining: number };
export type MoneyDay = MoneySummary & { date: string };
export type MoneyProjection = { occurrences: MoneyOccurrence[]; summary: MoneySummary; days: MoneyDay[] };
export type MoneyProjectionDefinition = { item: MoneyItem; rule: RecurrenceRule | null };

export const moneySummaryFor = (items: MoneyItem[]): MoneySummary => {
  const expenseForecast = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.plannedAmount, 0);
  const incomeForecast = items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.plannedAmount, 0);
  return { expenseForecast, incomeForecast, remaining: incomeForecast - expenseForecast };
};

const recurrenceInput = (rule: RecurrenceRule | null): RecurrenceRuleInput | null => rule ? {
  frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, dayOfMonth: rule.dayOfMonth, startsOn: rule.startsOn, endsOn: rule.endsOn
} : null;

export const projectMoneyItems = (definitions: MoneyProjectionDefinition[], categories: MoneyCategory[], startDate: string, endDate: string, weekStartsOn = 1): MoneyOccurrence[] => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  return definitions.flatMap(({ item, rule }) => {
    const dates = rule ? occurrenceDates(rule, { startDate, endDate }, weekStartsOn) : item.date >= startDate && item.date <= endDate ? [item.date] : [];
    return dates.map((date) => ({ ...item, date, time: null, category: categoryMap.get(item.categoryId) ?? null, signedAmount: item.type === "income" ? item.plannedAmount : -item.plannedAmount, occurrenceKey: rule ? `money:${item.id}:${date}` : null, recurrence: rule, definitionDate: item.date }));
  }).sort((left, right) => `${left.date}:${left.id}`.localeCompare(`${right.date}:${right.id}`));
};

export class MoneyService {
  constructor(private readonly money: MoneyRepository, private readonly categories: MoneyCategoryRepository, private readonly recurrences: RecurrenceRepository) {}

  async ensureCategories(userId: string, now: string) { await this.categories.ensureForUser(userId, now); }

  async prepareInput(userId: string, body: Record<string, unknown>, current?: MoneyItem): Promise<{ input: MoneyItemInput; recurrence: RecurrenceRuleInput | null }> {
    const value = {
      type: body.type ?? current?.type,
      title: body.title ?? current?.title,
      categoryId: body.categoryId ?? current?.categoryId,
      plannedAmount: body.plannedAmount ?? current?.plannedAmount,
      date: body.date ?? current?.date,
      memo: body.memo === undefined ? current?.memo ?? null : body.memo
    };
    const details: Record<string, string> = {};
    if (value.type !== "expense" && value.type !== "income") details.type = "支出または収入を選択してください。";
    if (!stringValue(value.title) || stringValue(value.title).length > 120) details.title = "タイトルを入力してください。";
    if (!Number.isInteger(value.plannedAmount) || Number(value.plannedAmount) <= 0) details.plannedAmount = "金額は1円以上の整数で入力してください。";
    if (!isMoneyDate(value.date)) details.date = "日付をYYYY-MM-DD形式で指定してください。";
    if (body.time !== undefined && body.time !== null && body.time !== "") details.time = "Moneyでは時間を指定できません。";
    if (value.memo !== null && typeof value.memo !== "string") details.memo = "メモが不正です。";
    const categoryId = stringValue(value.categoryId);
    const category = categoryId ? await this.categories.getById(userId, categoryId) : null;
    if (!category) details.categoryId = "カテゴリを選択してください。";
    else if (category.type !== value.type) details.categoryId = "支出・収入とカテゴリの種類を合わせてください。";
    else if (!category.active && !current) details.categoryId = "有効なカテゴリを選択してください。";
    if (Object.keys(details).length > 0) throw validationError(details);
    const recurrence = normalizeRecurrenceInput(body.recurrence === undefined ? current?.recurrence ?? null : body.recurrence, value.date as string);
    return {
      input: { type: value.type as MoneyType, title: stringValue(value.title), categoryId, plannedAmount: Number(value.plannedAmount), date: value.date as string, memo: value.memo === null ? null : stringValue(value.memo) },
      recurrence
    };
  }

  private async withRecurrence(userId: string, item: MoneyItem): Promise<MoneyItem> {
    const recurrence = item.recurrenceRuleId ? await this.recurrences.getById(userId, item.recurrenceRuleId) : null;
    return { ...item, time: null, recurrence };
  }

  async get(userId: string, id: string) {
    const item = await this.money.getById(userId, id);
    return item ? this.withRecurrence(userId, item) : null;
  }

  async recentDefinitions(userId: string, limit: number) {
    const [items, categories] = await Promise.all([this.money.recentDefinitions(userId, limit), this.categories.list(userId, undefined, true)]);
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    return Promise.all(items.map(async (item) => ({ ...(await this.withRecurrence(userId, item)), category: categoryMap.get(item.categoryId) ?? null })));
  }

  async create(userId: string, body: Record<string, unknown>, now: string) {
    const prepared = await this.prepareInput(userId, body);
    const rule = prepared.recurrence ? await this.recurrences.create(userId, prepared.recurrence, now) : null;
    return this.withRecurrence(userId, await this.money.create(userId, prepared.input, rule?.id ?? null, now));
  }

  async update(userId: string, id: string, body: Record<string, unknown>, now: string) {
    const current = await this.money.getById(userId, id);
    if (!current) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
    const currentWithRule = await this.withRecurrence(userId, current);
    const prepared = await this.prepareInput(userId, { ...body, recurrence: body.recurrence === undefined ? recurrenceInput(currentWithRule.recurrence ?? null) : body.recurrence }, currentWithRule);
    let ruleId = current.recurrenceRuleId;
    if (prepared.recurrence) {
      if (current.recurrenceRuleId) await this.recurrences.update(userId, current.recurrenceRuleId, prepared.recurrence, now);
      else ruleId = (await this.recurrences.create(userId, prepared.recurrence, now)).id;
    } else ruleId = null;
    const updated = await this.money.update(userId, id, prepared.input, ruleId, now);
    if (!updated) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。");
    return this.withRecurrence(userId, updated);
  }

  async project(userId: string, startDate: string, endDate: string, weekStartsOn = 1): Promise<MoneyProjection> {
    const [items, categories] = await Promise.all([this.money.listForProjection(userId, startDate, endDate), this.categories.list(userId, undefined, true)]);
    const definitions = await Promise.all(items.map(async (item) => ({ item, rule: item.recurrenceRuleId ? await this.recurrences.getById(userId, item.recurrenceRuleId) : null })));
    const occurrences = projectMoneyItems(definitions, categories, startDate, endDate, weekStartsOn);
    const projectedItems = occurrences.map((item) => item as MoneyItem);
    const days = new Map<string, MoneyItem[]>();
    projectedItems.forEach((item) => days.set(item.date, [...(days.get(item.date) ?? []), item]));
    const daySummaries = [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dayItems]) => ({ date, ...moneySummaryFor(dayItems) }));
    return { occurrences, summary: moneySummaryFor(projectedItems), days: daySummaries };
  }

  async projectMonth(userId: string, month: string, weekStartsOn = 1) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw validationError({ month: "表示月をYYYY-MM形式で指定してください。" });
    const year = Number(match[1]); const monthIndex = Number(match[2]); const start = `${month}-01`;
    const nextMonth = monthIndex === 12 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const endDate = new Date(`${nextMonth}T00:00:00Z`); endDate.setUTCDate(0);
    return { month, ...(await this.project(userId, start, endDate.toISOString().slice(0, 10), weekStartsOn)) };
  }

  async projectDate(userId: string, date: string, weekStartsOn = 1) { return this.project(userId, date, date, weekStartsOn); }
}
