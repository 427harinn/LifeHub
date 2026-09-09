import { AppError, validationError } from "../lib/errors";
import { MoneyCategoryRepository } from "../repositories/money-category-repository";
import { MoneyRepository } from "../repositories/money-repository";
import type { MoneyCategory, MoneyItem, MoneyItemInput, MoneyType } from "../types";

export const isMoneyDate = (value: unknown): value is string => { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return date.getUTCFullYear() === Number(value.slice(0, 4)) && date.getUTCMonth() + 1 === Number(value.slice(5, 7)) && date.getUTCDate() === Number(value.slice(8, 10)); };
const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
export type MoneyOccurrence = MoneyItem & { category: MoneyCategory | null; signedAmount: number };
export type MoneySummary = { expenseForecast: number; incomeForecast: number; remaining: number };
export type MoneyDay = MoneySummary & { date: string };
export const moneySummaryFor = (items: MoneyItem[]): MoneySummary => { const expenseForecast = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.plannedAmount, 0); const incomeForecast = items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.plannedAmount, 0); return { expenseForecast, incomeForecast, remaining: incomeForecast - expenseForecast }; };

export class MoneyService {
  constructor(private readonly money: MoneyRepository, private readonly categories: MoneyCategoryRepository) {}
  async ensureCategories(userId: string, now: string) { await this.categories.ensureForUser(userId, now); }
  async validateInput(userId: string, body: Record<string, unknown>, current?: MoneyItem): Promise<MoneyItemInput> {
    const value = { type: body.type ?? current?.type, title: body.title ?? current?.title, categoryId: body.categoryId ?? current?.categoryId, plannedAmount: body.plannedAmount ?? current?.plannedAmount, date: body.date ?? current?.date, time: body.time === undefined ? current?.time ?? null : body.time, memo: body.memo === undefined ? current?.memo ?? null : body.memo };
    const details: Record<string, string> = {};
    if (value.type !== "expense" && value.type !== "income") details.type = "支出または収入を選択してください。";
    if (!stringValue(value.title) || stringValue(value.title).length > 120) details.title = "タイトルを入力してください。";
    if (!Number.isInteger(value.plannedAmount) || Number(value.plannedAmount) <= 0) details.plannedAmount = "金額は1円以上の整数で入力してください。";
    if (!isMoneyDate(value.date)) details.date = "日付をYYYY-MM-DD形式で指定してください。";
    if (value.time !== null && !isTime(value.time)) details.time = "時間はHH:mm形式または未設定にしてください。";
    if (value.memo !== null && typeof value.memo !== "string") details.memo = "メモが不正です。";
    if (body.recurrence !== undefined || body.recurrenceRuleId !== undefined) details.recurrence = "M8では繰り返しを登録できません。";
    const categoryId = stringValue(value.categoryId); const category = categoryId ? await this.categories.getById(userId, categoryId) : null;
    if (!category) details.categoryId = "カテゴリを選択してください。";
    else if (category.type !== value.type) details.categoryId = "支出・収入とカテゴリの種類を合わせてください。";
    else if (!category.active && !current) details.categoryId = "有効なカテゴリを選択してください。";
    if (Object.keys(details).length > 0) throw validationError(details);
    return { type: value.type as MoneyType, title: stringValue(value.title), categoryId, plannedAmount: Number(value.plannedAmount), date: value.date as string, time: value.time as string | null, memo: value.memo === null ? null : stringValue(value.memo) };
  }
  async create(userId: string, body: Record<string, unknown>, now: string) { return this.money.create(userId, await this.validateInput(userId, body), now); }
  async update(userId: string, id: string, body: Record<string, unknown>, now: string) { const current = await this.money.getById(userId, id); if (!current) throw new AppError("NOT_FOUND", 404, "対象が見つかりません。"); return this.money.update(userId, id, await this.validateInput(userId, body, current), now); }
  async project(userId: string, startDate: string, endDate: string) { const [items, categories] = await Promise.all([this.money.listForRange(userId, startDate, endDate), this.categories.list(userId, undefined, true)]); const categoryMap = new Map(categories.map((category) => [category.id, category])); const occurrences: MoneyOccurrence[] = items.map((item) => ({ ...item, category: categoryMap.get(item.categoryId) ?? null, signedAmount: item.type === "income" ? item.plannedAmount : -item.plannedAmount })); const days = new Map<string, MoneyItem[]>(); items.forEach((item) => days.set(item.date, [...(days.get(item.date) ?? []), item])); const daySummaries: MoneyDay[] = [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dayItems]) => ({ date, ...moneySummaryFor(dayItems) })); return { occurrences, summary: moneySummaryFor(items), days: daySummaries }; }
  async projectMonth(userId: string, month: string) { const match = /^(\d{4})-(\d{2})$/.exec(month); if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw validationError({ month: "表示月をYYYY-MM形式で指定してください。" }); const year = Number(match[1]); const monthIndex = Number(match[2]); const start = `${month}-01`; const nextMonth = monthIndex === 12 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`; const endDate = new Date(`${nextMonth}T00:00:00Z`); endDate.setUTCDate(0); return { month, ...(await this.project(userId, start, endDate.toISOString().slice(0, 10))) }; }
  async projectDate(userId: string, date: string) { return this.project(userId, date, date); }
}
