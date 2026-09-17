import type { Event, MoneyItem, MoneyProjection, RecurrenceRuleInput } from "../api/client";
import { moneyCategoryColor, moneyCategoryColorKey } from "./money-category-colors";

export type CalendarProjectedEvent = { band?: "start" | "middle" | "end"; category: Event["category"]; day: number; date: string; eventId: string; isMultiDay?: boolean; kind: "single"; label: string };
export type CalendarBandSegment = { category: Event["category"]; endColumn: number; isEnd: boolean; isStart: boolean; label: string; lane: number; row: number; startColumn: number };
export type CalendarMoneyItem = { amount: number; category: "expense" | "income"; isSummary?: boolean; label: string };
export type CalendarMoneySummary = { amount: number; category: "expense" | "income" };

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;
const pad = (value: number) => String(value).padStart(2, "0");
const dateFromKey = (value: string) => new Date(`${value}T00:00:00`);
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shiftDate = (value: string, amount: number) => { const date = dateFromKey(value); date.setDate(date.getDate() + amount); return dateKey(date); };
const recurrenceWeekday = (date: string) => dateFromKey(date).getDay();
const recurrenceFrequencyLabel = (frequency: RecurrenceRuleInput["frequency"]) => frequency === "daily" ? "日ごと" : frequency === "weekly" ? "週間ごと" : "か月ごと";
const recurrenceWeekdayText = (weekdays: number[], startDate: string) => {
  const selected = weekdays.length > 0 ? weekdays : [recurrenceWeekday(startDate)];
  return selected.map((weekday) => weekdayLabels[weekday]).join("・");
};
const recurrenceEndText = (endsOn: string | null | undefined) => endsOn ? `（〜${formatDate(endsOn)}）` : "";

export const recurrenceSummary = (recurrence: RecurrenceRuleInput | null | undefined, startDate = "2026-01-01", period = false) => {
  if (!recurrence) return "なし";
  const interval = recurrence.interval || 1;
  const prefix = interval === 1
    ? recurrence.frequency === "daily" ? "毎日" : recurrence.frequency === "weekly" ? "毎週" : "毎月"
    : `${interval}${recurrenceFrequencyLabel(recurrence.frequency)}`;
  if (period) return `${prefix}${recurrenceEndText(recurrence.endsOn)}`;
  if (recurrence.frequency === "daily") return `${prefix}${recurrenceEndText(recurrence.endsOn)}`;
  if (recurrence.frequency === "weekly") {
    const weekdays = recurrenceWeekdayText(recurrence.weekdays ?? [], startDate);
    const weekdaySuffix = (recurrence.weekdays ?? [recurrenceWeekday(startDate)]).length === 1 ? `${weekdays}曜` : ` ${weekdays}`;
    return `${prefix}${weekdaySuffix}${recurrenceEndText(recurrence.endsOn)}`;
  }
  return `${prefix}${recurrence.dayOfMonth ?? Number(startDate.slice(-2))}日${recurrenceEndText(recurrence.endsOn)}`;
};

export const recurrenceAfterBaseDateChange = (recurrence: RecurrenceRuleInput | null, previousDate: string, nextDate: string): RecurrenceRuleInput | null => {
  if (!recurrence || previousDate === nextDate) return recurrence;
  const next = { ...recurrence, startsOn: nextDate };
  if (recurrence.frequency === "monthly" && (recurrence.dayOfMonth === null || recurrence.dayOfMonth === undefined || recurrence.dayOfMonth === Number(previousDate.slice(-2)))) next.dayOfMonth = Number(nextDate.slice(-2));
  if (recurrence.frequency === "weekly") {
    const weekdays = recurrence.weekdays ?? [recurrenceWeekday(previousDate)];
    if (weekdays.length === 1 && weekdays[0] === recurrenceWeekday(previousDate)) next.weekdays = [recurrenceWeekday(nextDate)];
  }
  return next;
};

export const formatDate = (value: string, includeYear = false) => { const date = dateFromKey(value); return `${includeYear ? `${date.getFullYear()}年` : ""}${date.getMonth() + 1}月${date.getDate()}日(${weekdayLabels[date.getDay()]})`; };
export const formatDateRange = (startDate: string, endDate: string, includeYear = false) => startDate === endDate ? formatDate(startDate, includeYear) : `${formatDate(startDate, includeYear)}〜${formatDate(endDate, includeYear)}`;
export const weekEnd = (value: string, weekStartsOn: number) => { const day = dateFromKey(value).getDay(); const normalizedStart = ((weekStartsOn % 7) + 7) % 7; return shiftDate(value, (normalizedStart + 6 - day + 7) % 7); };

export const calendarMoneyEntriesForDate = (date: string, _today: string, projection?: MoneyProjection): CalendarMoneyItem[] => projection ? projection.occurrences.filter((item) => item.date === date).map((item) => ({ amount: item.signedAmount ?? (item.type === "income" ? item.plannedAmount : -item.plannedAmount), category: item.type, label: item.title })) : [];
export const calendarMoneySummaryForDate = (date: string, today: string, projection?: MoneyProjection): CalendarMoneySummary | null => { const entries = calendarMoneyEntriesForDate(date, today, projection); if (entries.length === 0) return null; const amount = entries.reduce((total, entry) => total + entry.amount, 0); return { amount, category: amount >= 0 ? "income" : "expense" }; };

export function allocateCalendarCellRows(events: CalendarProjectedEvent[], bandCount: number, money: CalendarMoneyItem[] | null, rowCapacity = 4, maxVisibleEvents = rowCapacity) {
  const moneyItems = money ?? [];
  const summary = moneyItems.find((item) => item.isSummary);
  const details = moneyItems.filter((item) => !item.isSummary);
  const reservedSummaryRows = summary ? 1 : 0;
  const eventCapacity = Math.max(0, rowCapacity - reservedSummaryRows);
  const visibleBandCount = Math.min(eventCapacity, bandCount);
  const singleEventCapacity = Math.max(0, eventCapacity - visibleBandCount);
  const visibleEvents = events.slice(0, Math.min(maxVisibleEvents, singleEventCapacity));
  const detailCapacity = Math.max(0, rowCapacity - visibleBandCount - visibleEvents.length - reservedSummaryRows);
  const visibleMoney = [...details.slice(0, detailCapacity), ...(summary ? [summary] : [])];
  const hiddenDetailCount = Math.max(0, details.length - visibleMoney.filter((item) => !item.isSummary).length);
  const hiddenCount = Math.max(0, bandCount - visibleBandCount) + Math.max(0, events.length - visibleEvents.length) + hiddenDetailCount;
  const contentRows = visibleEvents.length + visibleMoney.length;
  return { contentRows, emptyRows: 0, hiddenCount, summaryRowIndex: summary ? contentRows : null, visibleBandCount, visibleEvents, visibleMoney };
}

export type MoneyChartMode = "forecast" | "actual";
export type MoneyCategoryGroup = { amount: number; color: string; colorKey: string; name: string };
export const moneyAverageDivisorFor = (year: number, currentMonth: string, mode: MoneyChartMode): number | null => {
  if (mode === "forecast") return 12;
  const currentYear = Number(currentMonth.slice(0, 4));
  if (year < currentYear) return 12;
  if (year > currentYear) return null;
  const month = Number(currentMonth.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 12;
};
export const moneyCategoryGroupsFor = (occurrences: MoneyItem[], mode: MoneyChartMode = "forecast"): MoneyCategoryGroup[] => Array.from(occurrences.filter((item) => item.type === "expense" && (mode === "forecast" || item.settlementStatus === "actual" || item.settlementStatus === "estimated_actual")).reduce((map, item) => {
  const key = item.category?.id ?? item.category?.name ?? "other";
  const current = map.get(key) ?? { amount: 0, color: moneyCategoryColor(item.category), colorKey: moneyCategoryColorKey(item.category), name: item.category?.name ?? "その他" };
  current.amount += Math.abs(item.effectiveAmount ?? item.signedAmount ?? item.plannedAmount);
  map.set(key, current);
  return map;
}, new Map<string, MoneyCategoryGroup>()).values()).sort((left, right) => right.amount - left.amount);
