import { AppError, notFoundError, validationError } from "../lib/errors";
import { getLocalDate } from "../lib/date-time";
import { MoneyCategoryRepository } from "../repositories/money-category-repository";
import { MoneyOccurrenceOverrideRepository } from "../repositories/money-occurrence-override-repository";
import { MoneyOccurrenceSettlementRepository } from "../repositories/money-occurrence-settlement-repository";
import { MoneyRepository } from "../repositories/money-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import type { MoneyCategory, MoneyItem, MoneyItemInput, MoneyOccurrenceOverride, MoneyOccurrenceSettlement, MoneyType, RecurrenceRule, RecurrenceRuleInput } from "../types";
import { isDateKey, normalizeRecurrenceInput, shiftDate } from "./recurrence-service";
import { occurrenceDates } from "./event-projection-service";

export const isMoneyDate = (value: unknown): value is string => isDateKey(typeof value === "string" ? value : "");
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
export type MoneySettlementStatus = "actual" | "estimated_actual";
export type MoneyDisplayState = "実績" | "予定" | "予定額のまま";
export type MoneyOccurrence = MoneyItem & { category: MoneyCategory | null; signedAmount: number; occurrenceKey: string; recurrence: RecurrenceRule | null; definitionDate: string; basePlannedAmount: number; effectivePlannedAmount: number; effectiveAmount: number; settlementStatus: MoneySettlementStatus | null; displayState: MoneyDisplayState };
export type MoneySummary = { expenseForecast: number; incomeForecast: number; remaining: number; confirmedExpense?: number; confirmedIncome?: number; plannedExpense?: number; plannedIncome?: number };
export type MoneyDay = MoneySummary & { date: string };
export type MoneyProjection = { occurrences: MoneyOccurrence[]; summary: MoneySummary; days: MoneyDay[] };
export type MoneyProjectionDefinition = { item: MoneyItem; rule: RecurrenceRule | null; overrides?: MoneyOccurrenceOverride[] };
export type MoneyScope = "occurrence" | "following" | "series";
export type MoneyCommand = Partial<MoneyItemInput> & { scope?: MoneyScope; occurrenceKey?: string; recurrence?: Partial<RecurrenceRuleInput> | null };

export const moneyOccurrenceKey = (moneyItemId: string, date: string) => `money:${moneyItemId}:${date}`;
export const parseMoneyOccurrenceKey = (value: string, moneyItemId: string) => {
  const prefix = `money:${moneyItemId}:`;
  if (!value.startsWith(prefix)) return null;
  const date = value.slice(prefix.length);
  return isMoneyDate(date) ? date : null;
};

const recurrenceInput = (rule: RecurrenceRule | null): RecurrenceRuleInput | null => rule ? { frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, dayOfMonth: rule.dayOfMonth, startsOn: rule.startsOn, endsOn: rule.endsOn } : null;
const amountFor = (item: Pick<MoneyItem, "type" | "plannedAmount"> & Partial<Pick<MoneyOccurrence, "effectiveAmount" | "signedAmount">>) => item.effectiveAmount ?? Math.abs(item.signedAmount ?? item.plannedAmount);
export const moneySummaryFor = (items: Array<Pick<MoneyItem, "type" | "plannedAmount"> & Partial<Pick<MoneyOccurrence, "effectiveAmount" | "signedAmount">>>): MoneySummary => {
  const expenseForecast = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + amountFor(item), 0);
  const incomeForecast = items.filter((item) => item.type === "income").reduce((sum, item) => sum + amountFor(item), 0);
  return { expenseForecast, incomeForecast, remaining: incomeForecast - expenseForecast };
};
const summaryWithStates = (items: MoneyOccurrence[]): MoneySummary => {
  const base = moneySummaryFor(items);
  return {
    ...base,
    confirmedExpense: items.filter((item) => item.type === "expense" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0),
    confirmedIncome: items.filter((item) => item.type === "income" && item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0),
    plannedExpense: items.filter((item) => item.type === "expense" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0),
    plannedIncome: items.filter((item) => item.type === "income" && !item.settlementStatus).reduce((sum, item) => sum + item.effectiveAmount, 0)
  };
};
const applyOverride = (item: MoneyItem, override: MoneyOccurrenceOverride | undefined): MoneyItem | null => !override ? item : override.overrideType === "cancelled" ? null : { ...item, ...(override.patch ?? {}) };
const baseDateFromKey = (key: string, itemId: string) => parseMoneyOccurrenceKey(key, itemId);
const isScheduledDate = (item: MoneyItem, rule: RecurrenceRule | null, date: string, weekStartsOn: number) => rule ? occurrenceDates(rule, { startDate: date, endDate: date }, weekStartsOn).includes(date) : item.date === date;
const isMoneyOccurrenceDate = (item: MoneyItem, rule: RecurrenceRule | null, date: string) => rule ? [1, 0].some((weekStartsOn) => isScheduledDate(item, rule, date, weekStartsOn)) : item.date === date;

export const projectMoneyItems = (definitions: MoneyProjectionDefinition[], categories: MoneyCategory[], startDate: string, endDate: string, weekStartsOn = 1, overrides: MoneyOccurrenceOverride[] = definitions.flatMap((definition) => definition.overrides ?? []), settlements: MoneyOccurrenceSettlement[] = [], currentMonth = startDate.slice(0, 7)): MoneyOccurrence[] => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const overridesByItem = new Map<string, MoneyOccurrenceOverride[]>();
  for (const override of overrides) overridesByItem.set(override.moneyItemId, [...(overridesByItem.get(override.moneyItemId) ?? []), override]);
  const settlementsByKey = new Map(settlements.map((settlement) => [`${settlement.moneyItemId}:${settlement.occurrenceKey}`, settlement]));
  const projectOne = (item: MoneyItem, rule: RecurrenceRule | null, date: string, override: MoneyOccurrenceOverride | undefined): MoneyOccurrence | null => {
    const effective = applyOverride({ ...item, date }, override);
    if (!effective || effective.date < startDate || effective.date > endDate) return null;
    const occurrenceKey = moneyOccurrenceKey(item.id, date);
    const settlement = settlementsByKey.get(`${item.id}:${occurrenceKey}`);
    const isPastMonth = effective.date.slice(0, 7) < currentMonth;
    const effectiveAmount = settlement?.status === "actual" || isPastMonth && settlement?.status === "estimated_actual" ? settlement.amount : effective.plannedAmount;
    const displayState: MoneyDisplayState = settlement?.status === "actual" ? "実績" : settlement?.status === "estimated_actual" ? "予定額のまま" : isPastMonth ? "予定額のまま" : "予定";
    return { ...effective, time: null, category: categoryMap.get(effective.categoryId) ?? null, plannedAmount: effective.plannedAmount, basePlannedAmount: item.plannedAmount, effectivePlannedAmount: effective.plannedAmount, effectiveAmount, signedAmount: effective.type === "income" ? effectiveAmount : -effectiveAmount, occurrenceKey, settlementStatus: settlement?.status ?? null, displayState, recurrence: rule, definitionDate: item.date };
  };
  return definitions.flatMap(({ item, rule }) => {
    const itemOverrides = overridesByItem.get(item.id) ?? [];
    const overrideByKey = new Map(itemOverrides.map((override) => [override.occurrenceKey, override]));
    const dates = rule ? occurrenceDates(rule, { startDate, endDate }, weekStartsOn) : item.date >= startDate && item.date <= endDate ? [item.date] : [];
    const generated = dates.flatMap((date) => { const projected = projectOne(item, rule, date, overrideByKey.get(moneyOccurrenceKey(item.id, date))); return projected ? [projected] : []; });
    const generatedKeys = new Set(generated.map((entry) => entry.occurrenceKey));
    const moved = itemOverrides.flatMap((override) => {
      const originalDate = baseDateFromKey(override.occurrenceKey, item.id); const movedDate = override.patch?.date;
      if (override.overrideType !== "modified" || !originalDate || !movedDate || movedDate === originalDate || generatedKeys.has(override.occurrenceKey) || !isScheduledDate(item, rule, originalDate, weekStartsOn)) return [];
      const projected = projectOne(item, rule, originalDate, override); return projected ? [projected] : [];
    });
    return [...generated, ...moved];
  }).sort((left, right) => `${left.date}:${left.id}:${left.occurrenceKey}`.localeCompare(`${right.date}:${right.id}:${right.occurrenceKey}`));
};

export class MoneyService {
  constructor(private readonly money: MoneyRepository, private readonly categories: MoneyCategoryRepository, private readonly recurrences: RecurrenceRepository, private readonly overrides: MoneyOccurrenceOverrideRepository, private readonly settlements: MoneyOccurrenceSettlementRepository) {}
  async ensureCategories(userId: string, now: string) { await this.categories.ensureForUser(userId, now); }
  async prepareInput(userId: string, body: Record<string, unknown>, current?: MoneyItem, includeRecurrence = true): Promise<{ input: MoneyItemInput; recurrence: RecurrenceRuleInput | null }> {
    const value = { type: body.type ?? current?.type, title: body.title ?? current?.title, categoryId: body.categoryId ?? current?.categoryId, plannedAmount: body.plannedAmount ?? current?.plannedAmount, date: body.date ?? current?.date, memo: body.memo === undefined ? current?.memo ?? null : body.memo };
    const details: Record<string, string> = {};
    if (value.type !== "expense" && value.type !== "income") details.type = "支出または収入を選択してください。";
    if (!stringValue(value.title) || stringValue(value.title).length > 120) details.title = "タイトルを入力してください。";
    if (!Number.isInteger(value.plannedAmount) || Number(value.plannedAmount) <= 0) details.plannedAmount = "金額は1円以上の整数で入力してください。";
    if (!isMoneyDate(value.date)) details.date = "日付をYYYY-MM-DD形式で指定してください。";
    if (body.time !== undefined && body.time !== null && body.time !== "") details.time = "Moneyでは時間を指定できません。";
    if (value.memo !== null && typeof value.memo !== "string") details.memo = "メモが不正です。";
    const categoryId = stringValue(value.categoryId); const category = categoryId ? await this.categories.getById(userId, categoryId) : null;
    if (!category) details.categoryId = "カテゴリを選択してください.";
    else if (category.type !== value.type) details.categoryId = "支出・収入とカテゴリの種類を合わせてください。";
    else if (!category.active && !current) details.categoryId = "有効なカテゴリを選択してください。";
    if (Object.keys(details).length > 0) throw validationError(details);
    const recurrence = includeRecurrence ? normalizeRecurrenceInput(body.recurrence === undefined ? current?.recurrence ?? null : body.recurrence, value.date as string) : null;
    return { input: { type: value.type as MoneyType, title: stringValue(value.title), categoryId, plannedAmount: Number(value.plannedAmount), date: value.date as string, memo: value.memo === null ? null : stringValue(value.memo) }, recurrence };
  }
  private async withRecurrence(userId: string, item: MoneyItem): Promise<MoneyItem> { return { ...item, time: null, recurrence: item.recurrenceRuleId ? await this.recurrences.getById(userId, item.recurrenceRuleId) : null }; }
  async get(userId: string, id: string) { const item = await this.money.getById(userId, id); return item ? this.withRecurrence(userId, item) : null; }
  async recentDefinitions(userId: string, limit: number) { const [items, categories] = await Promise.all([this.money.recentDefinitions(userId, limit), this.categories.list(userId, undefined, true)]); const categoryMap = new Map(categories.map((category) => [category.id, category])); return Promise.all(items.map(async (item) => ({ ...(await this.withRecurrence(userId, item)), category: categoryMap.get(item.categoryId) ?? null })));
  }
  async create(userId: string, body: Record<string, unknown>, now: string) { const prepared = await this.prepareInput(userId, body); const rule = prepared.recurrence ? await this.recurrences.create(userId, prepared.recurrence, now) : null; return this.withRecurrence(userId, await this.money.create(userId, prepared.input, rule?.id ?? null, now)); }
  private async base(userId: string, id: string) { const item = await this.money.getById(userId, id); if (!item) throw notFoundError(); const rule = item.recurrenceRuleId ? await this.recurrences.getById(userId, item.recurrenceRuleId) : null; return { item, rule }; }
  private async targetOccurrence(userId: string, item: MoneyItem, rule: RecurrenceRule | null, occurrenceKey: string | undefined, allowSingle = true) {
    if (!occurrenceKey) throw validationError({ occurrenceKey: "occurrenceKeyが必要です。" });
    const originalDate = parseMoneyOccurrenceKey(occurrenceKey, item.id);
    if (!originalDate || (!rule && !allowSingle) || !isMoneyOccurrenceDate(item, rule, originalDate)) throw notFoundError();
    const override = await this.overrides.get(userId, item.id, occurrenceKey); if (override?.overrideType === "cancelled") throw notFoundError();
    const finalDate = override?.patch?.date ?? originalDate; const range = { startDate: finalDate < originalDate ? finalDate : originalDate, endDate: finalDate > originalDate ? finalDate : originalDate };
    const projected = (await Promise.all([1, 0].map((weekStartsOn) => this.project(userId, range.startDate, range.endDate, weekStartsOn)))).flatMap((result) => result.occurrences); const occurrence = projected.find((entry) => entry.occurrenceKey === occurrenceKey); if (!occurrence) throw notFoundError(); return occurrence;
  }
  async update(userId: string, id: string, body: MoneyCommand, now: string) {
    const { item, rule } = await this.base(userId, id); const scope = body.scope ?? "series";
    if (scope === "occurrence") {
      if (!rule) throw validationError({ scope: "繰り返し項目ではありません。" });
      const occurrence = await this.targetOccurrence(userId, item, rule, body.occurrenceKey, false); const prepared = await this.prepareInput(userId, { ...occurrence, ...body }, undefined, false);
      await this.overrides.upsert(userId, id, body.occurrenceKey as string, "modified", prepared.input, now); return { ...occurrence, ...prepared.input, occurrenceKey: body.occurrenceKey, recurrence: rule };
    }
    const recurrence = body.recurrence === undefined ? recurrenceInput(rule) : body.recurrence; const prepared = await this.prepareInput(userId, body, { ...item, recurrence: rule }); const normalized = normalizeRecurrenceInput(recurrence, prepared.input.date);
    if (scope === "following") {
      if (!rule || !body.occurrenceKey) throw validationError({ scope: "繰り返し項目の対象範囲が不正です。" });
      const occurrence = await this.targetOccurrence(userId, item, rule, body.occurrenceKey, false); await this.recurrences.update(userId, rule.id, { ...rule, endsOn: shiftDate(occurrence.date, -1), weekdays: rule.weekdays }, now);
      const newRule = normalized ? await this.recurrences.create(userId, { ...normalized, startsOn: occurrence.date }, now) : null; const created = await this.money.create(userId, { ...prepared.input, date: occurrence.date }, newRule?.id ?? null, now); await this.copyForwardData(userId, id, created.id, occurrence.date, now); return this.withRecurrence(userId, created);
    }
    let ruleId = rule?.id ?? null; if (normalized) { if (rule) await this.recurrences.update(userId, rule.id, normalized, now); else ruleId = (await this.recurrences.create(userId, normalized, now)).id; } else ruleId = null;
    const updated = await this.money.update(userId, id, prepared.input, ruleId, now); if (!updated) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。"); return this.withRecurrence(userId, updated);
  }
  private async copyForwardData(userId: string, oldId: string, newId: string, fromDate: string, now: string) {
    const [overrideRows, settlementRows] = await Promise.all([this.overrides.listForItem(userId, oldId), this.settlements.listForUser(userId)]);
    for (const override of overrideRows) { const date = parseMoneyOccurrenceKey(override.occurrenceKey, oldId); if (date && date >= fromDate) await this.overrides.upsert(userId, newId, moneyOccurrenceKey(newId, date), override.overrideType, override.patch, now); }
    for (const settlement of settlementRows.filter((entry) => entry.moneyItemId === oldId)) { const date = parseMoneyOccurrenceKey(settlement.occurrenceKey, oldId); if (date && date >= fromDate) await this.settlements.upsert(userId, newId, moneyOccurrenceKey(newId, date), settlement.status, settlement.amount, settlement.updatedAt); }
  }
  async delete(userId: string, id: string, body: Pick<MoneyCommand, "scope" | "occurrenceKey"> = {}, now: string): Promise<void> {
    const { item, rule } = await this.base(userId, id); const scope = body.scope ?? "series";
    if (scope === "occurrence") { if (!rule) throw validationError({ scope: "繰り返し項目ではありません。" }); await this.targetOccurrence(userId, item, rule, body.occurrenceKey, false); await this.overrides.upsert(userId, id, body.occurrenceKey as string, "cancelled", null, now); return; }
    if (scope === "following") { if (!rule || !body.occurrenceKey) throw validationError({ scope: "繰り返し項目の対象範囲が不正です。" }); const occurrence = await this.targetOccurrence(userId, item, rule, body.occurrenceKey, false); await this.recurrences.update(userId, rule.id, { ...rule, endsOn: shiftDate(occurrence.date, -1), weekdays: rule.weekdays }, now); return; }
    if (!await this.money.softDelete(userId, id, now)) throw notFoundError();
  }
  async setActual(userId: string, id: string, occurrenceKey: string, amount: number, now: string) { if (!Number.isInteger(amount) || amount <= 0) throw validationError({ amount: "実際の金額は1円以上の整数で入力してください。" }); const { item, rule } = await this.base(userId, id); const occurrence = await this.targetOccurrence(userId, item, rule, occurrenceKey); return this.settlements.upsert(userId, id, occurrence.occurrenceKey, "actual", amount, now); }
  async deleteActual(userId: string, id: string, occurrenceKey: string, now: string) { const { item, rule } = await this.base(userId, id); const occurrence = await this.targetOccurrence(userId, item, rule, occurrenceKey); await this.settlements.deleteActual(userId, id, occurrence.occurrenceKey, now); }
  async project(userId: string, startDate: string, endDate: string, weekStartsOn = 1, now = new Date(), timezone = "UTC"): Promise<MoneyProjection> {
    const [items, categories, settlementRows] = await Promise.all([this.money.listForProjection(userId, startDate, endDate), this.categories.list(userId, undefined, true), this.settlements.listForUser(userId)]);
    const definitions = await Promise.all(items.map(async (item) => ({ item, rule: item.recurrenceRuleId ? await this.recurrences.getById(userId, item.recurrenceRuleId) : null, overrides: await this.overrides.listForItem(userId, item.id) })));
    const occurrences = projectMoneyItems(definitions, categories, startDate, endDate, weekStartsOn, undefined, settlementRows, getLocalDate(now, timezone).slice(0, 7)); const days = new Map<string, MoneyOccurrence[]>(); occurrences.forEach((item) => days.set(item.date, [...(days.get(item.date) ?? []), item]));
    const daySummaries = [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dayItems]) => ({ date, ...summaryWithStates(dayItems) })); return { occurrences, summary: summaryWithStates(occurrences), days: daySummaries };
  }
  async projectMonth(userId: string, month: string, weekStartsOn = 1, now = new Date(), timezone = "UTC") {
    const match = /^(\d{4})-(\d{2})$/.exec(month); if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw validationError({ month: "表示月をYYYY-MM形式で指定してください。" });
    const year = Number(match[1]); const monthIndex = Number(match[2]); const start = `${month}-01`; const nextMonth = monthIndex === 12 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`; const endDate = new Date(`${nextMonth}T00:00:00Z`); endDate.setUTCDate(0);
    return { month, ...(await this.project(userId, start, endDate.toISOString().slice(0, 10), weekStartsOn, now, timezone)) };
  }
  async projectDate(userId: string, date: string, weekStartsOn = 1, now = new Date(), timezone = "UTC") { return this.project(userId, date, date, weekStartsOn, now, timezone); }
}
