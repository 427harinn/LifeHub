import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  apiErrorStatus, authMe, createEvent, createMoney, createMoneyCategory, deleteEvent, deleteMoney, deleteMoneyActual, deleteMoneyCategory, getCalendar, getDaily, getMoneyCategories, getMoneyMonth, getRecentEventDefinitions, getRecentMoneyDefinitions, getSettings, login, logout, putMoneyActual, register, updateEvent, updateMoney, updateMoneyCategory, upsertDailyNote,
  type AuthUser, type DailyNote, type Event, type EventCommandInput, type EventScope, type MoneyCategory, type MoneyItem, type MoneyProjection, type MoneyType, type RecurrenceRuleInput, type UserSettings
} from "./api/client";
import { BottomSheet, Button, DateInput, FormRow, Input, MobileShell, NavIcon } from "./components/ui";
import { SwipeActionRow } from "./components/SwipeActionRow";
import { dailyFixture } from "./fixtures/m2ShellFixtures";
import { NotificationOffsetPicker, NotificationSettingsSection, notificationSummary } from "./components/NotificationSettings";
import { getNotificationTemplates } from "./api/notifications";
import type { NotificationTemplate } from "./worker/types";
import { defaultEndTimeForStart } from "./lib/event-time";

type Screen = "calendar" | "daily" | "money" | "settings";
type AddChoice = "家" | "仕事" | "お金";
type CalendarFilter = "all" | "home" | "work" | "money";
type SettingsDetail = "account" | "notifications" | "calendar" | "money" | "data";
type ReturnContext = { screen: "calendar" | "daily"; date: string; filter: CalendarFilter };
type MoneyReturnContext = ReturnContext | { screen: "money"; month: string };
type CalendarProjectedEvent = { band?: "start" | "middle" | "end"; category: Event["category"]; day: number; date: string; eventId: string; isMultiDay?: boolean; kind: "single"; label: string };
type CalendarBandSegment = { category: Event["category"]; endColumn: number; isEnd: boolean; isStart: boolean; label: string; lane: number; row: number; startColumn: number };
type CalendarMoneyItem = { amount: number; category: "expense" | "income"; isSummary?: boolean; label: string };
type CalendarMoneySummary = { amount: number; category: "expense" | "income" };

const screenFromPath = (): Screen => { const path = window.location.pathname; if (path === "/daily") return "daily"; if (path === "/money") return "money"; if (path === "/settings") return "settings"; return "calendar"; };
const notificationDateFromPath = () => { const value = new URLSearchParams(window.location.search).get("date") ?? ""; return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; };
const screenPath: Record<Screen, string> = { calendar: "/calendar", daily: "/daily", money: "/money", settings: "/settings" };
const filterLabels: Record<CalendarFilter, string> = { all: "すべて", home: "家", work: "仕事", money: "お金" };
const categoryLabel: Record<Event["category"], string> = { home: "家", work: "仕事" };
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayDateKey = () => dateKey(new Date());
const dateFromKey = (value: string) => new Date(`${value}T00:00:00`);
const monthStart = (value: string) => { const date = dateFromKey(value); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`; };
const monthEnd = (value: string) => { const date = dateFromKey(value); return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)); };
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;
const eventIdentity = (event: Event) => event.occurrenceKey ?? event.id;
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
const formatMonth = (value: string) => { const date = dateFromKey(value); return `${date.getFullYear()}年${date.getMonth() + 1}月`; };
const shiftMonth = (value: string, amount: number) => { const date = dateFromKey(value); date.setMonth(date.getMonth() + amount, 1); return dateKey(date); };
const shiftDate = (value: string, amount: number) => { const date = dateFromKey(value); date.setDate(date.getDate() + amount); return dateKey(date); };
const dateDifference = (from: string, to: string) => Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86400000);
function useHorizontalSwipe(onSwipe: (direction: "previous" | "next") => void, shouldIgnore?: (target: EventTarget | null) => boolean) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ axis: "pending" | "horizontal" | "vertical"; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    if (shouldIgnore?.(pointerEvent.target)) return;
    gesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY };
    suppressClick.current = false;
  };
  const pointerMove = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = pointerEvent.clientX - current.x;
    const dy = pointerEvent.clientY - current.y;
    if (current.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) + 4) { current.axis = "vertical"; setDragging(false); return; }
      current.axis = "horizontal";
      pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId);
      setDragging(true);
    }
    if (current.axis === "horizontal") { pointerEvent.preventDefault(); setOffset(Math.max(-96, Math.min(96, dx))); }
  };
  const pointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = pointerEvent.clientX - current.x;
    const dy = pointerEvent.clientY - current.y;
    if (current.axis === "horizontal") {
      pointerEvent.preventDefault();
      suppressClick.current = true;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) onSwipe(dx < 0 ? "next" : "previous");
      pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId);
    }
    gesture.current = null;
    setDragging(false);
    setOffset(0);
  };
  const pointerCancel = () => { gesture.current = null; setDragging(false); setOffset(0); };
  const clickCapture = (clickEvent: React.MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    suppressClick.current = false;
  };
  return { clickCapture, dragging, offset, pointerCancel, pointerDown, pointerMove, pointerUp };
}

function useRecentEntryOpenGuard(suppressInitialOpen: boolean) {
  const [open, setOpenState] = useState(false);
  const suppressOpen = useRef(suppressInitialOpen);

  useLayoutEffect(() => {
    const releaseForExplicitInteraction = (event: globalThis.Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".recent-entry-button")) suppressOpen.current = false;
    };
    const swallowInitialClick = (event: globalThis.Event) => {
      if (!suppressOpen.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".recent-entry-button")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", releaseForExplicitInteraction, true);
    document.addEventListener("keydown", releaseForExplicitInteraction, true);
    document.addEventListener("click", swallowInitialClick, true);
    return () => {
      document.removeEventListener("pointerdown", releaseForExplicitInteraction, true);
      document.removeEventListener("keydown", releaseForExplicitInteraction, true);
      document.removeEventListener("click", swallowInitialClick, true);
    };
  }, []);

  const setOpen = (nextOpen: boolean) => {
    if (nextOpen && suppressOpen.current) return;
    setOpenState(nextOpen);
  };
  return [open, setOpen] as const;
}
export const weekEnd = (value: string, weekStartsOn: number) => { const day = dateFromKey(value).getDay(); const normalizedStart = ((weekStartsOn % 7) + 7) % 7; return shiftDate(value, (normalizedStart + 6 - day + 7) % 7); };
const eventMatchesFilter = (event: Event, filter: CalendarFilter) => filter === "all" || filter === event.category;
const fixtureEventMatchesFilter = (event: CalendarProjectedEvent, filter: CalendarFilter) => filter !== "money" && (filter === "all" || filter === event.category);
const eventOverlapsDate = (event: Event, date: string) => event.timingType === "period"
  ? Boolean(event.periodStartDate && event.periodEndDate && event.periodStartDate <= date && event.periodEndDate >= date)
  : Boolean(event.startDate && event.endDate && event.startDate <= date && event.endDate >= date);
const eventTimeLabel = (event: Event) => event.timingType === "period" ? "期間" : event.allDay ? "終日" : `${event.startTime}〜${event.endTime}`;
const moneyAmountLabel = (amount: number) => `${amount >= 0 ? "+" : "-"}${Math.abs(amount).toLocaleString("ja-JP")}`;
export const calendarMoneyEntriesForDate = (date: string, today: string, projection?: MoneyProjection): CalendarMoneyItem[] => projection ? projection.occurrences.filter((item) => item.date === date).map((item) => ({ amount: item.signedAmount ?? (item.type === "income" ? item.plannedAmount : -item.plannedAmount), category: item.type, label: item.title })) : date === today ? [{ amount: -1500, category: "expense", label: "食費" }, { amount: 2999, category: "income", label: "副収入" }, { amount: -800, category: "expense", label: "交通費" }] : date === shiftDate(today, 6) ? [{ amount: 2999, category: "income", label: "副収入" }] : [];
export const calendarMoneySummaryForDate = (date: string, today: string, projection?: MoneyProjection): CalendarMoneySummary | null => { const entries = calendarMoneyEntriesForDate(date, today, projection); if (entries.length === 0) return null; const amount = entries.reduce((total, entry) => total + entry.amount, 0); return { amount, category: amount >= 0 ? "income" : "expense" }; };
const calendarMoneyForCell = (date: string | null, filter: CalendarFilter, today: string, projection?: MoneyProjection): CalendarMoneyItem[] => {
  if (!date || filter === "home" || filter === "work") return [];
  const entries = calendarMoneyEntriesForDate(date, today, projection);
  const summary = calendarMoneySummaryForDate(date, today, projection);
  if (filter === "money") return [...entries.map((entry) => ({ ...entry, isSummary: false })), ...(summary ? [{ ...summary, isSummary: true, label: "収支" }] : [])];
  return summary ? [{ ...summary, isSummary: true, label: "収支" }] : [];
};

export function allocateCalendarCellRows(events: CalendarProjectedEvent[], bandCount: number, money: CalendarMoneyItem[] | null, rowCapacity = 4, maxVisibleEvents = rowCapacity) {
  const moneyItems = money ?? [];
  const summary = moneyItems.find((item) => item.isSummary);
  const details = moneyItems.filter((item) => !item.isSummary);
  const eventCapacity = Math.max(0, rowCapacity - (summary ? 1 : 0));
  const visibleBandCount = Math.min(eventCapacity, bandCount);
  const singleEventCapacity = Math.max(0, eventCapacity - visibleBandCount);
  const visibleEvents = events.slice(0, Math.min(maxVisibleEvents, singleEventCapacity));
  const moneyCapacity = Math.max(0, rowCapacity - visibleBandCount - visibleEvents.length);
  const visibleMoney = moneyCapacity > 0
    ? [...details.slice(0, Math.max(0, moneyCapacity - (summary ? 1 : 0))), ...(summary && moneyCapacity > 0 ? [summary] : [])]
    : [];
  const hiddenDetailCount = Math.max(0, details.length - visibleMoney.filter((item) => !item.isSummary).length);
  const hiddenCount = Math.max(0, bandCount - visibleBandCount) + Math.max(0, events.length - visibleEvents.length) + hiddenDetailCount;
  return { emptyRows: Math.max(0, rowCapacity - visibleBandCount - visibleEvents.length - visibleMoney.length), hiddenCount, visibleEvents, visibleMoney };
}

function toCalendarFixtureEvents(events: Event[], month: string): CalendarProjectedEvent[] {
  const firstDate = monthStart(month);
  const lastDate = monthEnd(month);
  return events.flatMap((event) => {
    if (event.timingType === "period" && event.startDate !== event.periodStartDate) return [];
    if (!event.startDate || !event.endDate) return [];
    const start = event.startDate < firstDate ? firstDate : event.startDate;
    const end = event.endDate > lastDate ? lastDate : event.endDate;
    if (start > end) return [];
    const identity = eventIdentity(event);
    if (start === end) return [{ day: Number(start.slice(-2)), date: start, eventId: identity, label: event.title, category: event.category, kind: "single" }];
    const result: CalendarProjectedEvent[] = [];
    let current = dateFromKey(start);
    const final = dateFromKey(end);
    while (current <= final) {
      const currentKey = dateKey(current);
      result.push({ day: current.getDate(), date: currentKey, eventId: identity, label: event.title, category: event.category, kind: "single", isMultiDay: true, band: currentKey === event.startDate ? "start" : currentKey === event.endDate ? "end" : "middle" });
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return result;
  });
}

function buildCalendarBandSegments(events: CalendarProjectedEvent[], firstWeekday: number): CalendarBandSegment[] {
  const grouped = [...new Map(events.filter((event) => event.isMultiDay).map((event) => [event.eventId, event])).values()];
  const segments = grouped.flatMap((event) => {
    const days = events.filter((candidate) => candidate.eventId === event.eventId && candidate.isMultiDay).sort((left, right) => left.day - right.day);
    const startDay = days[0]?.day ?? 0;
    const endDay = days.at(-1)?.day ?? 0;
    const center = Math.round((startDay + endDay) / 2);
    const result: CalendarBandSegment[] = [];
    let currentDay = startDay;
    while (currentDay <= endDay) {
      const row = Math.floor((firstWeekday + currentDay - 1) / 7);
      const rowEnd = Math.min(endDay, (row + 1) * 7 - firstWeekday);
      result.push({ category: event.category, endColumn: ((firstWeekday + rowEnd - 1) % 7) + 1, isEnd: rowEnd === endDay && days.some((day) => day.band === "end"), isStart: currentDay === startDay && days.some((day) => day.band === "start"), label: center >= currentDay && center <= rowEnd ? event.label : "", lane: 0, row, startColumn: ((firstWeekday + currentDay - 1) % 7) + 1 });
      currentDay = rowEnd + 1;
    }
    if (!result.some((segment) => segment.label)) result[0].label = event.label;
    return result;
  });
  return segments.reduce<CalendarBandSegment[]>((placed, segment) => {
    let lane = 0;
    while (placed.some((other) => other.row === segment.row && other.lane === lane && other.startColumn <= segment.endColumn && segment.startColumn <= other.endColumn)) lane += 1;
    placed.push({ ...segment, lane });
    return placed;
  }, []);
}

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [isRegistering, setIsRegistering] = useState(false); const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); setBusy(true); try { const result = isRegistering ? await register(displayName, email, password) : await login(email, password); onAuthenticated(result.user); } catch (caught) { setError(caught instanceof Error ? caught.message : "ログインできませんでした。"); } finally { setBusy(false); } };
  return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><h2>{isRegistering ? "アカウントを作成" : "ログイン"}</h2><form className="auth-form" onSubmit={(event) => { void submit(event); }}>{isRegistering ? <label className="input-field" htmlFor="display-name"><span>表示名</span><Input id="display-name" autoComplete="name" onChange={setDisplayName} required value={displayName} /></label> : null}<label className="input-field" htmlFor="email"><span>メールアドレス</span><Input id="email" autoComplete="email" onChange={setEmail} required type="email" value={email} /></label><label className="input-field" htmlFor="password"><span>パスワード</span><Input id="password" autoComplete={isRegistering ? "new-password" : "current-password"} minLength={12} onChange={setPassword} required type="password" value={password} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "確認中…" : isRegistering ? "アカウントを作成" : "ログイン"}</Button></form><button className="text-button" onClick={() => { setIsRegistering((current) => !current); setError(""); }} type="button">{isRegistering ? "ログインに戻る" : "アカウントを作成する"}</button></main></div>;
}

function FixtureTabs({ active, onChange }: { active: CalendarFilter; onChange: (filter: CalendarFilter) => void }) { return <div aria-label="表示切替" className="shell-tabs" role="tablist">{(Object.keys(filterLabels) as CalendarFilter[]).map((filter) => <button aria-selected={active === filter} className="shell-tab" key={filter} onClick={() => onChange(filter)} role="tab" type="button">{filterLabels[filter]}</button>)}</div>; }

function CalendarShell({ events, money, filter, month, onDateSelect, onFilterChange, onMonthChange, onSearch }: { events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; month: string; onDateSelect: (date: string, filter: CalendarFilter) => void; onFilterChange: (filter: CalendarFilter) => void; onMonthChange: (month: string) => void; onSearch: () => void }) {
  const { clickCapture, dragging: monthDragging, offset: monthOffset, pointerCancel, pointerDown, pointerMove, pointerUp } = useHorizontalSwipe((direction) => onMonthChange(shiftMonth(month, direction === "next" ? 1 : -1)));
  const date = dateFromKey(month);
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = useMemo(() => Array.from({ length: 42 }, (_, index) => { const day = index - firstWeekday + 1; return day > 0 && day <= daysInMonth ? day : null; }), [daysInMonth, firstWeekday]);
  const projectedEvents = useMemo(() => toCalendarFixtureEvents(events, month), [events, month]);
  const filteredEvents = useMemo(() => projectedEvents.filter((event) => fixtureEventMatchesFilter(event, filter)), [filter, projectedEvents]);
  const today = todayDateKey();
  const bands = useMemo(() => filter === "money" ? [] : buildCalendarBandSegments(filteredEvents, firstWeekday), [filteredEvents, filter, firstWeekday]);
  const bandLaneCountByCell = useMemo(() => bands.reduce<Record<string, number>>((counts, segment) => { for (let column = segment.startColumn; column <= segment.endColumn; column += 1) { const key = `${segment.row}:${column}`; counts[key] = Math.max(counts[key] ?? 0, segment.lane + 1); } return counts; }, {}), [bands]);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const [calendarCellHeight, setCalendarCellHeight] = useState(0);
  useEffect(() => {
    const grid = calendarGridRef.current;
    if (!grid) return undefined;
    const measure = () => { const height = grid.getBoundingClientRect().height / 6; if (height > 0) setCalendarCellHeight(height); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [month]);
  const candidateValue = Number(new URLSearchParams(window.location.search).get("calendarMax"));
  const autoRowCapacity = calendarCellHeight > 0 ? Math.max(1, Math.min(4, Math.floor((calendarCellHeight - 33) / 14))) : 4;
  const rowCapacity = candidateValue === 2 || candidateValue === 3 || candidateValue === 4 ? Math.min(autoRowCapacity, candidateValue) : autoRowCapacity;
  const bandFitsRowAllocation = (segment: CalendarBandSegment) => {
    if (filter !== "all") return segment.lane < rowCapacity;
    const moneyReservedLane = rowCapacity - 1;
    if (moneyReservedLane < 0 || segment.lane >= moneyReservedLane) {
      for (let column = segment.startColumn; column <= segment.endColumn; column += 1) {
        const cellIndex = segment.row * 7 + column - 1;
        const day = cells[cellIndex];
        const cellDate = day ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : null;
        if (calendarMoneyForCell(cellDate, filter, today, money ?? undefined).some((item) => item.isSummary)) return false;
      }
    }
    return segment.lane < rowCapacity;
  };
  return <main className="screen-page calendar-page">
    <header className="screen-header"><h1>カレンダー</h1><button aria-label="検索" className="icon-button" onClick={onSearch} type="button"><NavIcon name="search" /></button></header>
    <FixtureTabs active={filter} onChange={onFilterChange} />
    <section aria-label={`${year}年${monthIndex + 1}月`} className="calendar-section">
      <div className="calendar-month"><button aria-label="前の月" className="month-button" onClick={() => onMonthChange(shiftMonth(month, -1))} type="button">‹</button><h2>{formatMonth(month)}</h2><button aria-label="次の月" className="month-button" onClick={() => onMonthChange(shiftMonth(month, 1))} type="button">›</button></div>
      <button className="calendar-today" onClick={() => onMonthChange(monthStart(today))} type="button">今日</button>
      <div className="calendar-weekdays">{weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className={`calendar-grid${monthDragging ? " is-swipe-dragging" : ""}`} ref={calendarGridRef} onClickCapture={clickCapture} onPointerCancel={pointerCancel} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} style={{ "--calendar-swipe-offset": `${monthOffset}px` } as CSSProperties}>
        {cells.map((day, index) => {
          const cellDate = day ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : null;
          const dayEvents = day ? filteredEvents.filter((event) => event.day === day) : [];
          const cellEvents = dayEvents.filter((event) => !event.isMultiDay);
          const bandLaneCount = bandLaneCountByCell[`${Math.floor(index / 7)}:${(index % 7) + 1}`] ?? 0;
          const moneyItems = calendarMoneyForCell(cellDate, filter, today, money ?? undefined);
          const allocation = allocateCalendarCellRows(cellEvents, bandLaneCount, moneyItems, rowCapacity, rowCapacity);
          const hasBand = bandLaneCount > 0;
          return <button aria-label={day ? `${day}日` : "空の日付"} className={`calendar-cell${cellDate === today ? " calendar-cell--today" : ""}${hasBand ? " calendar-cell--has-band" : ""}`} disabled={!day} key={`${day ?? "empty"}-${index}`} onClick={() => { if (cellDate) onDateSelect(cellDate, filter); }} style={{ "--calendar-band-lanes": Math.min(rowCapacity, bandLaneCount) } as CSSProperties} type="button">
            {day ? <><span className="calendar-cell__date">{day}</span>{allocation.hiddenCount > 0 ? <span aria-label={`${allocation.hiddenCount}件の予定を省略`} className="calendar-cell__count">{allocation.hiddenCount}</span> : null}<span className="calendar-cell__single-events">
              {allocation.visibleEvents.map((event) => <span className={`calendar-event calendar-event--${event.category} calendar-event--${event.kind}`} key={`${event.eventId}-${event.date}`}>{event.label}</span>)}
              {allocation.visibleMoney.map((entry, moneyIndex) => <span className={`calendar-cell__money calendar-cell__money--${entry.category}${entry.isSummary ? " calendar-cell__money--summary" : " calendar-cell__money--detail"}`} key={`${entry.label}-${entry.amount}-${moneyIndex}`}>{entry.isSummary ? moneyAmountLabel(entry.amount) : entry.label}</span>)}
            </span></> : null}
          </button>;
        })}
        <div aria-hidden="true" className="calendar-band-layer">{bands.filter(bandFitsRowAllocation).map((segment, index) => <span className={`calendar-band calendar-band--multi calendar-band--${segment.category}${segment.isStart ? " calendar-band--start" : ""}${segment.isEnd ? " calendar-band--end" : ""}`} key={`${segment.category}-${segment.row}-${segment.startColumn}-${index}`} style={{ "--band-lane": segment.lane, gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`, gridRow: segment.row + 1 } as CSSProperties}>{segment.label}</span>)}</div>
      </div>
    </section>
  </main>;
}

function CalendarDateSheet({ date, events, money, filter, settings, onClose, onAddCategory, onAddMoney, onOpenDaily, onEditEvent, onEditMoney, onEditPeriod, onMoneyChanged, onDateChange }: { date: string; events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; settings: UserSettings | null; onClose: () => void; onAddCategory: (category: Event["category"]) => void; onAddMoney: () => void; onOpenDaily: () => void; onEditEvent: (event: Event) => void; onEditMoney: (item: MoneyItem) => void; onEditPeriod?: (label: string) => void; onMoneyChanged?: () => void; onDateChange: (date: string) => void }) {
  void onEditPeriod;
  const scheduledEvents = filter === "money" ? [] : [...new Map(events.filter((event) => eventOverlapsDate(event, date) && (filter === "all" || event.category === filter)).map((event) => [eventIdentity(event), event])).values()];
  const periodEvents = filter === "money" ? [] : dailyFixture.period.filter((item) => filter === "all" || item.category === filter).map((item, index) => periodFixtureEvent(item, date, settings?.weekStartsOn ?? 1, index));
  const dayEvents = [...periodEvents, ...scheduledEvents].sort((left, right) => (left.allDay ? "00:00" : left.startTime ?? "00:00").localeCompare(right.allDay ? "00:00" : right.startTime ?? "00:00"));
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedMoneyId, setExpandedMoneyId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [moneyActionId, setMoneyActionId] = useState<string | null>(null);
  const [actualMoney, setActualMoney] = useState<MoneyItem | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const gesture = useRef<{ axis: "pending" | "horizontal"; x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const moveDate = (amount: number) => { setExpandedEventId(null); setOpenRowId(null); onDateChange(shiftDate(date, amount)); };
    const chooseAdd = (choice: "home" | "work" | "money") => { setQuickAddOpen(false); if (choice === "money") onAddMoney(); else onAddCategory(choice); };
    useEffect(() => {
      if (!quickAddOpen) return undefined;
      const closeOnOutsidePointer = (pointerEvent: PointerEvent) => {
        const target = pointerEvent.target;
        if (!(target instanceof Element) || !target.closest(".calendar-date-sheet__quick-add")) setQuickAddOpen(false);
      };
      document.addEventListener("pointerdown", closeOnOutsidePointer);
      return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
    }, [quickAddOpen]);
  const pointerDown = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { if (!(pointerEvent.target instanceof Element) || !pointerEvent.target.closest(".event-swipe-row")) setOpenRowId(null); if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".event-swipe-row")) return; gesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressClick.current = false; };
  const pointerMove = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { const current = gesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { gesture.current = null; return; } current.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); } if (current.axis === "horizontal") pointerEvent.preventDefault(); };
  const pointerUp = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { const current = gesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "horizontal" && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) { suppressClick.current = true; moveDate(dx < 0 ? 1 : -1); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } gesture.current = null; };
  const toggleEvent = (eventId: string) => { setOpenRowId(null); setExpandedEventId((current) => current === eventId ? null : eventId); };
  const toggleMoney = (moneyId: string) => { if (moneyActionId === moneyId) { setMoneyActionId(null); return; } setOpenRowId(null); setMoneyActionId(null); setExpandedMoneyId((current) => current === moneyId ? null : moneyId); };
  const openRowAction = (rowId: string | null) => { setOpenRowId(rowId); if (rowId) setExpandedEventId(null); };
  const moneyItems = money?.occurrences.filter((item) => item.date === date) ?? [];
  const moneySummary = filter === "all" || filter === "money" ? calendarMoneySummaryForDate(date, todayDateKey(), money ?? undefined) : null;
  const isPeriod = (event: Event) => event.timingType === "period" || event.id.startsWith("period-fixture-");
  return <><BottomSheet className="calendar-date-sheet" headerActions={<div aria-label="日付を移動" className="calendar-date-sheet__header-nav"><button aria-label="前の日" onClick={() => moveDate(-1)} type="button">‹</button><button aria-label="次の日" onClick={() => moveDate(1)} type="button">›</button></div>} open title={formatDate(date, true)} onClose={onClose}><div className="sheet-detail calendar-date-sheet__gesture" onClickCapture={(clickEvent) => { if (quickAddOpen && (!(clickEvent.target instanceof Element) || !clickEvent.target.closest(".calendar-date-sheet__quick-add"))) setQuickAddOpen(false); if (!suppressClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressClick.current = false; }} onPointerCancel={() => { gesture.current = null; }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}><div className="sheet-list">{filter === "money" ? moneyItems.map((item) => { const key = item.occurrenceKey ?? item.id; return <SwipeActionRow actions={[{ label: "編集", onClick: () => onEditMoney(item) }]} ariaLabel={item.title} expandedContent={expandedMoneyId === key ? <MoneyInlineDetail item={item} onActual={() => setActualMoney(item)} /> : null} key={key} onHorizontalSwipeStart={() => setExpandedMoneyId(null)} onOpenChange={(open) => setMoneyActionId(open ? key : null)} onOtherRowTouch={() => setMoneyActionId(null)} open={moneyActionId === key}><button className="sheet-money-entry sheet-money-entry--button money-sheet-row" onClick={(event) => { event.stopPropagation(); toggleMoney(key); }} type="button"><MoneyStatusIcon status={item.settlementStatus} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "その他"}</small></span><strong className={`sheet-money-summary--${item.type}`}>{moneyAmountLabel(item.signedAmount ?? 0)}</strong></button></SwipeActionRow>; }) : null}{dayEvents.map((event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onActionsClose={() => openRowAction(null)} onActionsOpen={() => openRowAction(identity)} onEdit={() => isPeriod(event) ? onEditEvent(event) : onEditEvent(event)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} showTimeInDetail={false} />; })}{dayEvents.length === 0 && filter !== "money" ? <p className="empty-state">予定はありません</p> : null}</div>{moneySummary ? <div className="sheet-money-summary"><span>収支</span><strong className={`sheet-money-summary--${moneySummary.category}`}>{moneyAmountLabel(moneySummary.amount)}円</strong></div> : null}<div className="sheet-footer"><Button onClick={onOpenDaily} variant="secondary">1日の詳細を見る</Button><div className="calendar-date-sheet__quick-add">{quickAddOpen ? <div aria-label="この日に追加" className="calendar-date-sheet__quick-add-menu" role="menu"><button onClick={() => chooseAdd("home")} role="menuitem" type="button">家</button><button onClick={() => chooseAdd("work")} role="menuitem" type="button">仕事</button><button onClick={() => chooseAdd("money")} role="menuitem" type="button">お金</button></div> : null}<button aria-expanded={quickAddOpen} aria-label="当日に追加" className="sheet-add-button calendar-date-sheet__quick-add-toggle" onClick={() => setQuickAddOpen((open) => !open)} type="button"><NavIcon name="add" /></button></div></div></div></BottomSheet><MoneyActualSheet item={actualMoney} onClose={() => setActualMoney(null)} onSaved={onMoneyChanged ?? (() => undefined)} open={Boolean(actualMoney)} /></>;
}

function DailyEventDetail({ event, showTime = true }: { event: Event; showTime?: boolean }) {
  const dateRange = event.timingType === "period" && event.periodStartDate && event.periodEndDate ? formatDateRange(event.periodStartDate, event.periodEndDate) : event.startDate && event.endDate ? formatDateRange(event.startDate, event.endDate) : "期間";
  const dateTime = `${dateRange} ${eventTimeLabel(event)}`;
  const dateOnly = dateRange;
  return <div className="event-inline-detail" id={`daily-event-detail-${eventIdentity(event)}`}><p>{showTime ? dateTime : dateOnly}</p>{event.place ? <p>{event.place}</p> : null}{event.memo ? <p>{event.memo}</p> : null}</div>;
}

function DailyEventRow({ event, expanded, onToggle, actionsOpen, onActionsOpen, onActionsClose, onEdit, onOtherRowTouch, showTimeInDetail = true }: { event: Event; expanded: boolean; onToggle: () => void; actionsOpen: boolean; onActionsOpen: () => void; onActionsClose: () => void; onEdit: () => void; onOtherRowTouch: () => void; showTimeInDetail?: boolean }) {
  return <SwipeActionRow actions={[{ label: "編集", onClick: onEdit }]} ariaLabel={event.title} expandedContent={expanded ? <DailyEventDetail event={event} showTime={showTimeInDetail} /> : null} onMainClick={onToggle} onOpenChange={(open) => open ? onActionsOpen() : onActionsClose()} onOtherRowTouch={onOtherRowTouch} open={actionsOpen}><button aria-controls={`daily-event-detail-${eventIdentity(event)}`} aria-expanded={expanded} className={`fixture-row fixture-row--${event.category} event-swipe-row__main${event.allDay ? " event-swipe-row__main--all-day" : ""}`} type="button">{event.allDay ? null : <time>{event.startTime}〜{event.endTime}</time>}<span className="fixture-row__title">{event.title}</span></button></SwipeActionRow>;
}

function periodFixtureEvent(item: typeof dailyFixture.period[number], date: string, weekStartsOn: number, index: number): Event {
  const endDate = item.periodType === "week" ? weekEnd(date, weekStartsOn) : monthEnd(date);
  return { active: true, allDay: true, category: item.category as Event["category"], createdAt: "", deletedAt: null, endDate, endTime: null, id: `period-fixture-${item.periodType}-${date}-${index}`, memo: null, place: null, startDate: date, startTime: null, timingType: "scheduled", title: item.label, updatedAt: "", userId: "fixture", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null };
}

function DailyShell({ date, events, money, filter, dailyNote, settings, onDateChange, onFilterChange, onEditEvent, onEditMoney, onEditPeriod, onMoneyChanged, onSaveNote }: { date: string; events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; dailyNote: DailyNote | null; settings: UserSettings | null; onDateChange: (date: string) => void; onFilterChange: (filter: CalendarFilter) => void; onEditEvent: (event: Event) => void; onEditMoney: (item: MoneyItem) => void; onEditPeriod?: (label: string) => void; onMoneyChanged?: () => void; onSaveNote: (content: string) => Promise<DailyNote | null> }) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedMoneyId, setExpandedMoneyId] = useState<string | null>(null);
  const [moneyActionId, setMoneyActionId] = useState<string | null>(null);
  const [actualMoney, setActualMoney] = useState<MoneyItem | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(dailyNote?.content ?? "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const showTimeline = filter !== "money";
  const showOverview = filter === "all";
  const moneyItems = money?.occurrences.filter((item) => item.date === date) ?? [];
  const moneySummary = calendarMoneySummaryForDate(date, todayDateKey(), money ?? undefined);
  const dayEvents = events.filter((event) => eventOverlapsDate(event, date) && eventMatchesFilter(event, filter)).sort((left, right) => (left.allDay ? "00:00" : left.startTime ?? "00:00").localeCompare(right.allDay ? "00:00" : right.startTime ?? "00:00"));
  const periodEvents = dayEvents.filter((event) => event.timingType === "period");
  const allDay = dayEvents.filter((event) => event.timingType !== "period" && event.allDay);
  const timed = dayEvents.filter((event) => !event.allDay);
  const openRowAction = (rowId: string | null) => { setOpenRowId(rowId); if (rowId) setExpandedEventId(null); };
  const toggleEvent = (eventId: string) => { setOpenRowId(null); setExpandedEventId((current) => current === eventId ? null : eventId); };
  const toggleMoney = (moneyId: string) => { if (moneyActionId === moneyId) { setMoneyActionId(null); return; } setOpenRowId(null); setMoneyActionId(null); setExpandedMoneyId((current) => current === moneyId ? null : moneyId); };
  const eventRow = (event: Event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} onActionsOpen={() => openRowAction(identity)} onActionsClose={() => openRowAction(null)} onEdit={() => onEditEvent(event)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} />; };
  const saveNote = async () => { setNoteBusy(true); setNoteError(""); try { await onSaveNote(noteDraft); setNoteEditing(false); } catch (caught) { setNoteError(caught instanceof Error ? caught.message : "メモを保存できませんでした。"); } finally { setNoteBusy(false); } };
  const dailyGesture = useRef<{ axis: "pending" | "horizontal"; x: number; y: number } | null>(null);
  const suppressDailyClick = useRef(false);
  const dailyPointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return; if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".event-swipe-row")) return; dailyGesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressDailyClick.current = false; };
  const dailyPointerMove = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { dailyGesture.current = null; return; } current.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); } if (current.axis === "horizontal") pointerEvent.preventDefault(); };
  const dailyPointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "horizontal" && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) { suppressDailyClick.current = true; onDateChange(shiftDate(date, dx < 0 ? 1 : -1)); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } dailyGesture.current = null; };
    const periodRow = (item: typeof dailyFixture.period[number], index: number) => { const event = periodFixtureEvent(item, date, settings?.weekStartsOn ?? 1, index); const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onActionsClose={() => openRowAction(null)} onActionsOpen={() => openRowAction(identity)} onEdit={() => onEditPeriod?.(item.label)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} showTimeInDetail={false} />; };
  return <main className="screen-page daily-page" onClickCapture={(clickEvent) => { if (!suppressDailyClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressDailyClick.current = false; }} onPointerCancel={() => { dailyGesture.current = null; }} onPointerDown={dailyPointerDown} onPointerDownCapture={(pointerEvent) => { if (!openRowId) return; if (!(pointerEvent.target instanceof Element) || !pointerEvent.target.closest(".event-swipe-row")) openRowAction(null); }} onPointerMove={dailyPointerMove} onPointerUp={dailyPointerUp}><header className="screen-header"><h1>デイリー</h1><span className="daily-date-label">{formatDate(date)}</span><div className="daily-date-actions"><button aria-label="前の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, -1))} type="button">‹</button><button className="today-button" onClick={() => onDateChange(todayDateKey())} type="button">今日</button><button aria-label="次の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, 1))} type="button">›</button></div></header><FixtureTabs active={filter} onChange={onFilterChange} />{showTimeline ? <section className="timeline-section"><h2>予定</h2><div className="fixture-group"><h3>終日</h3>{allDay.map(eventRow)}</div><div className="fixture-group"><h3>期間</h3>{periodEvents.map(eventRow)}{dailyFixture.period.filter((item) => filter === "all" || item.category === filter).map(periodRow)}</div><div className="fixture-group"><h3>時間あり</h3>{timed.map(eventRow)}</div>{dayEvents.length === 0 ? <p className="empty-state">予定はありません</p> : null}</section> : null}{filter === "money" || showOverview ? <section className="daily-section"><h2>今日のお金</h2>{filter === "money" ? moneyItems.map((item) => { const key = item.occurrenceKey ?? item.id; return <SwipeActionRow actions={[{ label: "編集", onClick: () => onEditMoney(item) }]} ariaLabel={item.title} expandedContent={expandedMoneyId === key ? <MoneyInlineDetail id={`daily-money-detail-${key}`} item={item} onActual={() => setActualMoney(item)} /> : null} key={key} onHorizontalSwipeStart={() => setExpandedMoneyId(null)} onOpenChange={(open) => setMoneyActionId(open ? key : null)} onOtherRowTouch={() => setMoneyActionId(null)} open={moneyActionId === key}><button aria-expanded={expandedMoneyId === key} className="fixture-row daily-money-row" onClick={(event) => { event.stopPropagation(); toggleMoney(key); }} type="button"><MoneyStatusIcon status={item.settlementStatus} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "その他"}</small></span><strong className={`daily-money--${item.type}`}>{moneyAmountLabel(item.signedAmount ?? 0)}円</strong></button></SwipeActionRow>; }) : moneySummary ? <div className="fixture-row"><span>収支</span><strong className={`daily-money--${moneySummary.category}`}>{moneyAmountLabel(moneySummary.amount)}円</strong></div> : <p className="empty-state">記録はありません</p>}</section> : null}{showOverview ? <section className="daily-section daily-note-section"><h2>今日のメモ</h2>{noteEditing ? <div className="daily-note-editor"><textarea aria-label="今日のメモ" className="textarea" onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} /><div className="daily-note-actions"><Button disabled={noteBusy} onClick={() => { void saveNote(); }}>{noteBusy ? "保存中…" : "保存"}</Button><Button disabled={noteBusy} onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(false); }} variant="ghost">キャンセル</Button></div>{noteError ? <p className="form-error" role="alert">{noteError}</p> : null}</div> : <button aria-label="今日のメモを編集" className="daily-note-body" onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(true); }} type="button">{dailyNote?.content || "メモはありません"}</button>}</section> : null}<MoneyActualSheet item={actualMoney} onClose={() => setActualMoney(null)} onSaved={onMoneyChanged ?? (() => undefined)} open={Boolean(actualMoney)} /></main>;
}

function RecentEventSheet({ open, category, onClose, onSelect }: { open: boolean; category: Event["category"]; onClose: () => void; onSelect: (event: Event) => void }) { const [events, setEvents] = useState<Event[]>([]); const [error, setError] = useState(""); useEffect(() => { if (!open) return; void getRecentEventDefinitions().then(({ events: nextEvents }) => setEvents((nextEvents ?? []).filter((event) => event.category === category))).catch(() => setError("候補を読み込めませんでした。")); }, [category, open]); return <BottomSheet open={open} title="以前の項目から選ぶ" onClose={onClose}><div className="recent-list">{events.map((event) => <button className={`recent-event recent-event--${event.category}`} key={event.id} onClick={() => onSelect(event)} type="button"><span className="recent-event__marker" /><span><strong>{event.title}</strong><small>{event.allDay ? "終日" : eventTimeLabel(event)}{event.place ? ` · ${event.place}` : ""}</small></span></button>)}{events.length === 0 && !error ? <p className="empty-state">最近の項目はありません</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div></BottomSheet>; }

function EventOptionSheet({ option, onClose, recurrence, startDate, timingType, periodWindowType, onTimingTypeChange, onPeriodWindowChange, onRecurrenceChange, notifications, onNotificationsChange, deadlineTime, onDeadlineTimeChange }: { option: "type" | "repeat" | "notification" | "period" | null; onClose: () => void; recurrence: RecurrenceRuleInput | null; startDate: string; timingType: Event["timingType"]; periodWindowType: Event["periodWindowType"]; onTimingTypeChange: (value: Event["timingType"]) => void; onPeriodWindowChange: (value: NonNullable<Event["periodWindowType"]>) => void; onRecurrenceChange: (value: RecurrenceRuleInput | null) => void; notifications: number[]; onNotificationsChange: (value: number[]) => void; deadlineTime: string; onDeadlineTimeChange: (value: string) => void }) {
  const titles = { type: "予定の種類", period: "実施時期", repeat: "繰り返し", notification: "通知" };
  const [customOpen, setCustomOpen] = useState(false);
  const [endOptionOpen, setEndOptionOpen] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  useEffect(() => { if (option !== "notification") return; void getNotificationTemplates().then(({ templates: nextTemplates }) => setTemplates(nextTemplates ?? [])).catch(() => setTemplates([])); }, [option]);
  const defaults = (frequency: RecurrenceRuleInput["frequency"]): RecurrenceRuleInput => ({ frequency, interval: 1, weekdays: frequency === "weekly" ? [recurrenceWeekday(startDate)] : null, dayOfMonth: frequency === "monthly" ? Number(startDate.slice(-2)) : null, startsOn: startDate, endsOn: null });
  const setFrequency = (frequency: RecurrenceRuleInput["frequency"]) => { onRecurrenceChange(defaults(frequency)); setCustomOpen(false); onClose(); };
  const repeatFrequencies: RecurrenceRuleInput["frequency"][] = timingType === "period" ? periodWindowType === "this_week" ? ["weekly"] : periodWindowType === "this_month" ? ["monthly"] : [] : ["daily", "weekly", "monthly"];
  const current = recurrence ?? defaults("weekly");
  const update = (patch: Partial<RecurrenceRuleInput>) => onRecurrenceChange({ ...current, ...patch });
  return <BottomSheet open={Boolean(option)} title={option ? titles[option] : ""} onClose={onClose}><div className="event-option-sheet">{option === "type" ? <>
    <button className="event-option-sheet__option" onClick={() => { onTimingTypeChange("scheduled"); onClose(); }} type="button"><span>日時が決まっている</span><span aria-hidden="true">{timingType === "scheduled" ? "✓" : ""}</span></button>
    <button className="event-option-sheet__option" onClick={() => { onTimingTypeChange("period"); onClose(); }} type="button"><span>期間中にやりたい</span><span aria-hidden="true">{timingType === "period" ? "✓" : ""}</span></button>
  </> : option === "period" ? <>
    {(["this_week", "this_month", "custom_range"] as const).map((windowType) => <button className="event-option-sheet__option" key={windowType} onClick={() => { onPeriodWindowChange(windowType); onClose(); }} type="button"><span>{windowType === "this_week" ? "今週中" : windowType === "this_month" ? "今月中" : "日付範囲を指定"}</span><span aria-hidden="true">{periodWindowType === windowType ? "✓" : ""}</span></button>)}
  </> : option === "repeat" ? <>
    <button className="event-option-sheet__option" onClick={() => { onRecurrenceChange(null); onClose(); }} type="button"><span>なし</span><span aria-hidden="true">{!recurrence ? "✓" : ""}</span></button>
    {repeatFrequencies.includes("daily") ? <button className="event-option-sheet__option" onClick={() => setFrequency("daily")} type="button"><span>毎日</span><span aria-hidden="true">{recurrence?.frequency === "daily" && recurrence.interval === 1 ? "✓" : ""}</span></button> : null}
    {repeatFrequencies.includes("weekly") ? <button className="event-option-sheet__option" onClick={() => setFrequency("weekly")} type="button"><span>毎週</span><span aria-hidden="true">{recurrence?.frequency === "weekly" && recurrence.interval === 1 ? "✓" : ""}</span></button> : null}
    {repeatFrequencies.includes("monthly") ? <button className="event-option-sheet__option" onClick={() => setFrequency("monthly")} type="button"><span>毎月</span><span aria-hidden="true">{recurrence?.frequency === "monthly" && recurrence.interval === 1 ? "✓" : ""}</span></button> : null}
    {timingType === "scheduled" || repeatFrequencies.length > 0 ? <button className="event-option-sheet__option" onClick={() => setCustomOpen(true)} type="button"><span>カスタム</span><span aria-hidden="true">{customOpen || (recurrence !== null && (recurrence.interval !== 1 || recurrence.frequency === "weekly" && (recurrence.weekdays?.length ?? 0) > 1 || recurrence.frequency === "monthly" && recurrence.dayOfMonth !== Number(startDate.slice(-2)))) ? "✓" : ""}</span></button> : null}
    {customOpen ? <div className="recurrence-details">
      <div className="recurrence-frequency-control"><span>繰り返し間隔</span><div className="recurrence-frequency-control__inputs"><Input aria-label="繰り返し間隔の数" id="recurrence-interval" min="1" onChange={(value) => update({ interval: Math.max(1, Number(value) || 1) })} type="number" value={String(current.interval)} /><select aria-label="繰り返し単位" id="recurrence-frequency" onChange={(event) => update({ frequency: event.target.value as RecurrenceRuleInput["frequency"], weekdays: event.target.value === "weekly" ? (current.weekdays ?? [recurrenceWeekday(startDate)]) : null, dayOfMonth: event.target.value === "monthly" ? (current.dayOfMonth ?? Number(startDate.slice(-2))) : null })} value={current.frequency}>{(timingType === "scheduled" ? ["daily", "weekly", "monthly"] : repeatFrequencies).map((frequency) => <option key={frequency} value={frequency}>{frequency === "daily" ? "日ごと" : frequency === "weekly" ? "週間ごと" : "か月ごと"}</option>)}</select></div></div>
      {current.frequency === "weekly" ? <fieldset className="weekday-picker"><legend>曜日</legend>{weekdayLabels.map((label, weekday) => <label key={label}><input checked={current.weekdays?.includes(weekday) ?? false} onChange={(event) => { if (!event.target.checked && (current.weekdays?.length ?? 0) <= 1) return; update({ weekdays: event.target.checked ? [...(current.weekdays ?? []), weekday].sort((a, b) => a - b) : (current.weekdays ?? []).filter((item) => item !== weekday) }); }} type="checkbox" /><span>{label}</span></label>)}</fieldset> : null}
      {current.frequency === "monthly" ? <label className="input-field" htmlFor="recurrence-day-of-month"><span>日付</span><Input id="recurrence-day-of-month" max="31" min="1" onChange={(value) => update({ dayOfMonth: Math.max(1, Math.min(31, Number(value) || 1)) })} type="number" value={String(current.dayOfMonth ?? Number(startDate.slice(-2)))} /></label> : null}
      <FormRow ariaLabel="終了設定" label="終了" onClick={() => setEndOptionOpen((open) => !open)} summary={current.endsOn ? formatDate(current.endsOn) : "なし"} />
      {endOptionOpen ? <div className="recurrence-end-options"><button className="event-option-sheet__option" onClick={() => { update({ endsOn: null }); setEndOptionOpen(false); }} type="button"><span>終了なし</span><span aria-hidden="true">{current.endsOn ? "" : "✓"}</span></button><button className="event-option-sheet__option" onClick={() => { update({ endsOn: current.endsOn ?? startDate }); setEndOptionOpen(false); }} type="button"><span>終了日を指定</span><span aria-hidden="true">{current.endsOn ? "✓" : ""}</span></button></div> : null}
      {current.endsOn ? <label className="input-field" htmlFor="recurrence-ends-on"><span>終了日</span><Input id="recurrence-ends-on" min={startDate} onChange={(value) => update({ endsOn: value })} type="date" value={current.endsOn} /></label> : null}<Button onClick={onClose}>この設定にする</Button>
    </div> : null}<button aria-label="繰り返しを閉じる" className="event-option-sheet__close" onClick={onClose} type="button">閉じる</button>
  </> : <><div className="notification-template-options"><p>テンプレート</p>{templates.map((template) => <button className="event-option-sheet__option" key={template.id} onClick={() => { onNotificationsChange(template.offsets.map((offset) => offset.offsetMinutes)); onClose(); }} type="button"><span>{template.name}</span><span>{notificationSummary(template.offsets.map((offset) => offset.offsetMinutes))}</span></button>)}</div><NotificationOffsetPicker offsets={notifications} onChange={onNotificationsChange} /><p className="notification-summary-preview">{notificationSummary(notifications)}</p>{timingType === "period" && notifications.length > 0 ? <label className="input-field" htmlFor="event-deadline-time"><span>期限時刻</span><Input id="event-deadline-time" onChange={onDeadlineTimeChange} type="time" value={deadlineTime || "21:00"} /></label> : null}<Button onClick={onClose}>この設定にする</Button></>}</div></BottomSheet>;
}

function ScopeSheet({ open, action, subject = "予定", onClose, onSelect }: { open: boolean; action: "edit" | "delete"; subject?: "予定" | "項目"; onClose: () => void; onSelect: (scope: EventScope) => void }) { const title = action === "edit" ? "編集する範囲" : "削除する範囲"; const options: Array<{ scope: EventScope; label: string }> = [{ scope: "occurrence", label: `この${subject}のみ` }, { scope: "following", label: `この${subject}以降` }, { scope: "series", label: `すべての${subject}` }]; return <BottomSheet open={open} title={title} onClose={onClose}><div className="event-option-sheet">{options.map((option) => <button className="event-option-sheet__option" key={option.scope} onClick={() => onSelect(option.scope)} type="button"><span>{option.label}</span></button>)}</div></BottomSheet>; }

const periodWindowLabel = (value: Event["periodWindowType"]) => value === "this_week" ? "今週中" : value === "this_month" ? "今月中" : "日付範囲を指定";
export function EventForm({ category, initialDate, event, scope = "series", onCancel, onSaved, onDelete, suppressInitialRecentOpen = true }: { category: Event["category"]; initialDate: string; event?: Event; scope?: EventScope; onCancel: () => void; onSaved: (event: Event) => void; onDelete?: () => void; suppressInitialRecentOpen?: boolean }) {
  const baseStartDate = scope === "series" && event?.recurrence ? event.recurrence.startsOn : event?.startDate ?? event?.periodAnchorDate ?? event?.periodStartDate ?? initialDate;
  const baseEndDate = scope === "series" && event?.recurrence && event?.startDate && event?.endDate ? shiftDate(baseStartDate, dateDifference(event.startDate, event.endDate)) : event?.endDate ?? initialDate;
  const [title, setTitle] = useState(event?.title ?? "");
  const [timingType, setTimingType] = useState<Event["timingType"]>(event?.timingType ?? "scheduled");
  const [startDate, setStartDate] = useState(baseStartDate);
  const [endDate, setEndDate] = useState(baseEndDate);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startTime, setRawStartTime] = useState(event?.startTime ?? "09:00");
  const [endTime, setRawEndTime] = useState(event?.endTime ?? "10:00");
  const [endTimeExplicit, setEndTimeExplicit] = useState(Boolean(event));
  const [periodWindowType, setPeriodWindowType] = useState<Event["periodWindowType"]>(event?.periodWindowType ?? "this_week");
  const [periodAnchorDate, setPeriodAnchorDate] = useState(scope === "series" && event?.recurrence ? event.recurrence.startsOn : event?.periodAnchorDate ?? initialDate);
  const [periodStartDate, setPeriodStartDate] = useState(event?.periodStartDate ?? initialDate);
  const [periodEndDate, setPeriodEndDate] = useState(event?.periodEndDate ?? initialDate);
  const [place, setPlace] = useState(event?.place ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceRuleInput | null>(event?.recurrence ? { frequency: event.recurrence.frequency, interval: event.recurrence.interval, weekdays: event.recurrence.weekdays, dayOfMonth: event.recurrence.dayOfMonth, startsOn: event.recurrence.startsOn, endsOn: event.recurrence.endsOn } : null);
  const [recentOpen, setRecentOpen] = useRecentEntryOpenGuard(suppressInitialRecentOpen);
  const [optionOpen, setOptionOpen] = useState<"type" | "repeat" | "notification" | "period" | null>(null);
  const [notifications, setNotifications] = useState<number[]>(event?.notifications ?? []);
  const [deadlineTime, setDeadlineTime] = useState(event?.deadlineTime ?? "");
  const [placeOpen, setPlaceOpen] = useState(Boolean(event?.place));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setStartTime = (value: string) => { setRawStartTime(value); if (!event && timingType === "scheduled" && !allDay && !endTimeExplicit) setRawEndTime(defaultEndTimeForStart(value)); };
  const setEndTime = (value: string) => { setRawEndTime(value); setEndTimeExplicit(true); };
  const setType = (value: Event["timingType"]) => { setTimingType(value); if (value === "period") { setPeriodAnchorDate(event?.periodAnchorDate ?? initialDate); setPeriodWindowType(event?.periodWindowType ?? "this_week"); } else setDeadlineTime(""); };
  const setWindow = (value: NonNullable<Event["periodWindowType"]>) => { setPeriodWindowType(value); if (value === "custom_range") { setPeriodAnchorDate(""); setPeriodStartDate(periodStartDate || initialDate); setPeriodEndDate(periodEndDate || periodStartDate || initialDate); setRecurrence(null); } else { setPeriodAnchorDate(periodAnchorDate || initialDate); setPeriodStartDate(""); setPeriodEndDate(""); } };
  const updateStartDate = (value: string) => { setStartDate(value); if (endDate < value) setEndDate(value); };
  const periodRecurrenceAllowed = timingType === "scheduled" || periodWindowType !== "custom_range";
  const savedInput: EventCommandInput = timingType === "period"
    ? { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType, periodAnchorDate: periodWindowType === "custom_range" ? null : periodAnchorDate, periodStartDate: periodWindowType === "custom_range" ? periodStartDate : null, periodEndDate: periodWindowType === "custom_range" ? periodEndDate : null, deadlineTime: deadlineTime || null, notifications, recurrence: scope === "occurrence" ? undefined : periodRecurrenceAllowed ? recurrenceAfterBaseDateChange(recurrence, recurrence?.startsOn ?? periodAnchorDate, periodAnchorDate) : null }
    : { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "scheduled", allDay, startDate, startTime: allDay ? null : startTime, endDate, endTime: allDay ? null : endTime, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, notifications, recurrence: scope === "occurrence" ? undefined : recurrenceAfterBaseDateChange(recurrence, baseStartDate, startDate) };
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => { formEvent.preventDefault(); setError(""); if (timingType === "period" && periodWindowType === "custom_range" && periodStartDate && periodEndDate && periodStartDate >= periodEndDate) { setError("期間は2日以上で指定してください。"); return; } setBusy(true); try { const result = event ? await updateEvent(event.id, { ...savedInput, scope, occurrenceKey: event.occurrenceKey ?? undefined }) : await createEvent(savedInput); onSaved(result.event); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  const applyRecent = (recent: Event) => { setTitle(recent.title); setTimingType(recent.timingType); setAllDay(recent.allDay ?? false); setStartTime(recent.startTime ?? "09:00"); setEndTime(recent.endTime ?? "10:00"); setEndTimeExplicit(recent.timingType === "scheduled" && recent.allDay === false); setPeriodWindowType(recent.timingType === "period" ? recent.periodWindowType ?? "this_week" : "this_week"); setPeriodAnchorDate(recent.timingType === "period" && recent.periodWindowType !== "custom_range" ? initialDate : ""); setPeriodStartDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setPeriodEndDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setDeadlineTime(recent.deadlineTime ?? ""); setNotifications(recent.notifications ?? []); setPlace(recent.place ?? ""); setMemo(recent.memo ?? ""); setRecurrence(recent.recurrence && !(recent.timingType === "period" && recent.periodWindowType === "custom_range") ? { frequency: recent.recurrence.frequency, interval: recent.recurrence.interval, weekdays: recent.recurrence.weekdays, dayOfMonth: recent.recurrence.dayOfMonth, startsOn: initialDate, endsOn: recent.recurrence.endsOn } : null); setPlaceOpen(Boolean(recent.place)); setRecentOpen(false); };
  return <main className="screen-page event-form-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" onClick={onCancel} type="button">‹</button><h1>{event ? "予定を編集" : "予定を追加"}</h1><span className={`event-category-label event-category-label--${category}`}><span className="event-category-label__dot" />{categoryLabel[category]}の予定</span></header><form className="event-form" onSubmit={(formEvent) => { void submit(formEvent); }}><button aria-label="以前の項目から選ぶ" className="recent-entry-button" onClick={() => setRecentOpen(true)} type="button"><span>以前の項目から選ぶ</span><span aria-hidden="true">›</span></button><label className="input-field event-title-field" htmlFor="event-title"><span>タイトル</span><Input id="event-title" onChange={setTitle} required value={title} /></label><section className="event-form-section"><FormRow ariaLabel="予定の種類" label="予定の種類" onClick={() => setOptionOpen("type")} summary={timingType === "period" ? "期間中にやりたい" : "日時が決まっている"} /></section>{timingType === "scheduled" ? <section className="event-form-section"><div className="date-input-group"><DateInput id="event-start-date" label="日付" onChange={updateStartDate} value={startDate} /><DateInput id="event-end-date" label="終了日" min={startDate} onChange={setEndDate} value={endDate} /></div><label className="event-toggle-row"><span>終日</span><input checked={allDay} onChange={(inputEvent) => setAllDay(inputEvent.target.checked)} type="checkbox" /><span className="event-toggle-value">{allDay ? "ON" : "OFF"}</span></label>{!allDay ? <div className="event-time-fields"><label className="input-field" htmlFor="event-start-time"><span>開始時間</span><Input id="event-start-time" onChange={setStartTime} required type="time" value={startTime} /></label><span aria-hidden="true">〜</span><label className="input-field" htmlFor="event-end-time"><span>終了時間</span><Input id="event-end-time" onChange={setEndTime} required type="time" value={endTime} /></label></div> : null}</section> : <section className="event-form-section"><FormRow ariaLabel="実施時期" label="実施時期" onClick={() => setOptionOpen("period")} summary={periodWindowLabel(periodWindowType)} />{periodWindowType === "custom_range" ? <div className="date-input-group"><DateInput id="event-period-start-date" label="開始日" onChange={setPeriodStartDate} value={periodStartDate} /><DateInput id="event-period-end-date" label="終了日" min={periodStartDate} onChange={setPeriodEndDate} value={periodEndDate} /></div> : null}</section>}{periodRecurrenceAllowed ? <section className="event-form-section"><FormRow ariaLabel="繰り返し" label="繰り返し" onClick={() => setOptionOpen("repeat")} summary={recurrenceSummary(recurrence, timingType === "period" ? periodAnchorDate : startDate, timingType === "period")} /></section> : null}<section className="event-form-section"><FormRow ariaLabel="通知" label="通知" onClick={() => setOptionOpen("notification")} summary={notificationSummary(notifications)} /></section><section className="event-form-section">{placeOpen ? <label className="input-field expanded-input" htmlFor="event-place"><span>場所</span><Input id="event-place" onChange={setPlace} value={place} /></label> : <FormRow label="場所を追加" onClick={() => setPlaceOpen(true)} summary="追加" />}</section><label className="input-field expanded-input" htmlFor="event-memo"><span>メモ</span><textarea className="textarea" id="event-memo" onChange={(inputEvent) => setMemo(inputEvent.target.value)} value={memo} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "保存中…" : event ? "変更を保存" : "登録"}</Button>{event && onDelete ? <Button onClick={onDelete} variant="secondary">削除</Button> : null}</form><RecentEventSheet category={category} onClose={() => setRecentOpen(false)} onSelect={applyRecent} open={recentOpen} /><EventOptionSheet deadlineTime={deadlineTime} notifications={notifications} onClose={() => setOptionOpen(null)} onDeadlineTimeChange={setDeadlineTime} onNotificationsChange={setNotifications} onPeriodWindowChange={setWindow} onRecurrenceChange={setRecurrence} onTimingTypeChange={setType} option={optionOpen} periodWindowType={periodWindowType} recurrence={recurrence} startDate={timingType === "period" ? periodAnchorDate : startDate} timingType={timingType} /></main>;
}

function EventDetailPage({ event, onBack, onEdit, onDelete }: { event: Event; onBack: () => void; onEdit: () => void; onDelete: () => void }) { const displayStart = event.timingType === "period" ? event.periodStartDate : event.startDate; const displayEnd = event.timingType === "period" ? event.periodEndDate : event.endDate; return <main className="screen-page event-detail-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>予定の詳細</h1><span className={`event-category-label event-category-label--${event.category}`}><span className="event-category-label__dot" />{categoryLabel[event.category]}</span></header><section className="event-detail"><h2>{event.title}</h2><dl className="event-detail-list"><div><dt>カテゴリ</dt><dd>{categoryLabel[event.category]}</dd></div><div><dt>{event.timingType === "period" ? "対象期間" : "日付"}</dt><dd>{displayStart && displayEnd ? formatDateRange(displayStart, displayEnd) : "—"}</dd></div><div><dt>時間</dt><dd>{eventTimeLabel(event)}</dd></div>{event.place ? <div><dt>場所</dt><dd>{event.place}</dd></div> : null}{event.memo ? <div><dt>メモ</dt><dd className="event-detail-memo">{event.memo}</dd></div> : null}</dl><div className="event-detail-actions"><Button onClick={onEdit}>編集</Button><Button onClick={onDelete} variant="secondary">削除</Button></div></section></main>; }
function DeleteConfirmSheet({ open, title, onClose, onConfirm, busy }: { open: boolean; title: string; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <BottomSheet open={open} title="予定を削除" onClose={onClose}><div className="delete-confirm"><p>「{title}」を削除しますか？</p><p className="delete-confirm__note">削除した予定は一覧から表示されなくなります。</p><Button disabled={busy} onClick={onConfirm} variant="secondary">{busy ? "削除中…" : "削除する"}</Button><Button disabled={busy} onClick={onClose} variant="ghost">キャンセル</Button></div></BottomSheet>; }

function MoneyRecentSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (item: MoneyItem) => void }) {
  const [items, setItems] = useState<MoneyItem[]>([]); const [error, setError] = useState("");
  useEffect(() => { if (!open) return; void getRecentMoneyDefinitions().then(({ definitions }) => setItems(definitions ?? [])).catch(() => setError("候補を読み込めませんでした。")); }, [open]);
  return <BottomSheet open={open} title="以前の項目から選ぶ" onClose={onClose}><div className="recent-list">{items.map((item) => <button className={`recent-event recent-event--money-${item.type}`} key={item.id} onClick={() => onSelect(item)} type="button"><span className="recent-event__marker" /><span><strong>{item.title}</strong><small>{item.category?.name ?? "カテゴリ未設定"} · {item.plannedAmount.toLocaleString("ja-JP")}円</small></span></button>)}{items.length === 0 && !error ? <p className="empty-state">最近の項目はありません</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div></BottomSheet>;
}

function MoneyCategorySheet({ open, categories, value, onChange, onClose }: { open: boolean; categories: MoneyCategory[]; value: string; onChange: (id: string) => void; onClose: () => void }) {
  return <BottomSheet open={open} title="カテゴリ" onClose={onClose}><div className="event-option-sheet">{categories.map((category) => <button aria-pressed={category.id === value} className="event-option-sheet__option" key={category.id} onClick={() => { onChange(category.id); onClose(); }} type="button"><span>{category.name}</span><span aria-hidden="true">{category.id === value ? "✓" : ""}</span></button>)}</div></BottomSheet>;
}

function MoneyRecurrenceSheet({ open, recurrence, startDate, onChange, onClose }: { open: boolean; recurrence: RecurrenceRuleInput | null; startDate: string; onChange: (value: RecurrenceRuleInput | null) => void; onClose: () => void }) {
  return <EventOptionSheet deadlineTime="" notifications={[]} onDeadlineTimeChange={() => undefined} onNotificationsChange={() => undefined} onPeriodWindowChange={() => undefined} onRecurrenceChange={onChange} onTimingTypeChange={() => undefined} option={open ? "repeat" : null} periodWindowType={null} recurrence={recurrence} startDate={startDate} timingType="scheduled" onClose={onClose} />;
}

export function MoneyStatusIcon({ status }: { status?: MoneyItem["settlementStatus"] }) {
  const settled = status === "actual" || status === "estimated_actual";
  return <span aria-label={settled ? "確定" : "予定"} className={`money-status-icon${settled ? " money-status-icon--settled" : ""}`} role="img">{settled ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg> : null}</span>;
}

export function MoneyInlineDetail({ item, onActual, id }: { item: MoneyItem; onActual: () => void; id?: string }) {
  const plannedAmount = item.effectivePlannedAmount ?? item.plannedAmount;
  const actualAmount = item.settlementStatus ? (item.effectiveAmount ?? item.plannedAmount) : null;
  return <div className="event-inline-detail money-inline-detail" id={id}>
    <Button className="money-inline-detail__action" onClick={onActual}>{actualAmount === null ? "金額を確定" : "確定額を変更"}</Button>
    <dl className="money-inline-detail__list">
      <div><dt>予定額</dt><dd>{plannedAmount.toLocaleString("ja-JP")}円</dd></div>
      {actualAmount !== null ? <div><dt>確定額</dt><dd>{actualAmount.toLocaleString("ja-JP")}円</dd></div> : null}
      {item.recurrence ? <div><dt>繰り返し</dt><dd>{recurrenceSummary(item.recurrence, item.definitionDate ?? item.date)}</dd></div> : null}
      {item.memo ? <div><dt>メモ</dt><dd className="money-inline-detail__memo">{item.memo}</dd></div> : null}
    </dl>
  </div>;
}

function MoneyChoiceSheet({ open, title, options, onClose, onSelect }: { open: boolean; title: string; options: Array<{ label: string; value: string }>; onClose: () => void; onSelect: (value: string) => void }) {
  return <BottomSheet open={open} title={title} onClose={onClose}><div className="event-option-sheet">{options.map((option) => <button className="event-option-sheet__option" key={option.value} onClick={() => onSelect(option.value)} type="button"><span>{option.label}</span></button>)}</div></BottomSheet>;
}

const moneyCategoryColors: Record<string, string> = {
  blue: "#527c9c",
  gold: "#b38a3d",
  green: "#5f8b6d",
  orange: "#d47b4f",
  purple: "#806b9b",
  red: "#b65445"
};
const moneyCategoryColor = (key: string | null | undefined) => moneyCategoryColors[key ?? "orange"] ?? moneyCategoryColors.orange;

function MoneyCategoryDonut({ occurrences }: { occurrences: MoneyItem[] }) {
  const groups = Array.from(occurrences.filter((item) => item.type === "expense").reduce((map, item) => {
    const key = item.category?.id ?? item.category?.name ?? "other";
    const current = map.get(key) ?? { amount: 0, color: moneyCategoryColor(item.category?.colorKey), name: item.category?.name ?? "その他" };
    current.amount += Math.abs(item.effectiveAmount ?? item.signedAmount ?? item.plannedAmount);
    map.set(key, current);
    return map;
  }, new Map<string, { amount: number; color: string; name: string }>()).values()).sort((left, right) => right.amount - left.amount);
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  if (total === 0) return <section className="money-chart-section"><h2>カテゴリ別の支出</h2><p className="empty-state">まだ支出はありません</p></section>;
  const gradient = groups.reduce<{ cursor: number; parts: string[] }>((result, group) => { const next = result.cursor + (group.amount / total) * 100; result.parts.push(`${group.color} ${result.cursor}% ${next}%`); result.cursor = next; return result; }, { cursor: 0, parts: [] }).parts.join(", ");
  return <section className="money-chart-section"><h2>カテゴリ別の支出</h2><div className="money-chart"><div aria-label={`今月の支出 ${total.toLocaleString("ja-JP")}円`} className="money-donut" style={{ "--money-donut": `conic-gradient(${gradient})` } as CSSProperties}><div className="money-donut__label"><span>今月の支出</span><strong>{total.toLocaleString("ja-JP")}円</strong></div></div><div className="money-chart__legend">{groups.map((group) => <div key={group.name}><span className="money-chart__legend-dot" style={{ backgroundColor: group.color }} /><span>{group.name}</span><strong>{group.amount.toLocaleString("ja-JP")}円</strong></div>)}</div></div></section>;
}

export function MoneyForm({ initialDate, item, scope = "series", onCancel, onSaved, onDelete, suppressInitialRecentOpen = true }: { initialDate: string; item?: MoneyItem; scope?: EventScope; onCancel: () => void; onSaved: (item: MoneyItem) => void; onDelete?: () => void; suppressInitialRecentOpen?: boolean }) {
  const isSeries = scope === "series"; const [type, setType] = useState<MoneyType>(item?.type ?? "expense"); const [title, setTitle] = useState(item?.title ?? ""); const [amount, setAmount] = useState(item ? String(item.plannedAmount) : ""); const [categoryId, setCategoryId] = useState(item?.categoryId ?? ""); const [date, setDate] = useState(isSeries ? item?.recurrence?.startsOn ?? item?.definitionDate ?? item?.date ?? initialDate : item?.date ?? initialDate); const [memo, setMemo] = useState(item?.memo ?? ""); const [recentOpen, setRecentOpen] = useRecentEntryOpenGuard(suppressInitialRecentOpen); const [categoryOpen, setCategoryOpen] = useState(false); const [recurrenceOpen, setRecurrenceOpen] = useState(false); const [typeOpen, setTypeOpen] = useState(false); const [settlementOpen, setSettlementOpen] = useState(false); const [recurrence, setRecurrence] = useState<RecurrenceRuleInput | null>(item?.recurrence ? { ...item.recurrence, startsOn: isSeries ? item.recurrence.startsOn : item.date } : null); const [settlementMode, setSettlementMode] = useState<"actual" | "planned">(item ? "planned" : "actual"); const [settlementModeTouched, setSettlementModeTouched] = useState(false); const [categories, setCategories] = useState<MoneyCategory[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { let active = true; void getMoneyCategories(type).then(({ categories: next }) => { if (!active) return; const available = next ?? []; setCategories(available); setCategoryId((current) => available.some((category) => category.id === current) ? current : available[0]?.id ?? ""); }).catch(() => { if (active) setError("カテゴリを読み込めませんでした。"); }); return () => { active = false; }; }, [type]);
  const switchType = (next: MoneyType) => { setType(next); setCategoryId(""); setTypeOpen(false); };
  const changeRecurrence = (next: RecurrenceRuleInput | null) => { setRecurrence(next); if (!item && !settlementModeTouched) setSettlementMode(next ? "planned" : "actual"); };
  const applyRecent = (recent: MoneyItem) => { setType(recent.type); setTitle(recent.title); setAmount(String(recent.plannedAmount)); setCategoryId(recent.categoryId); setMemo(recent.memo ?? ""); changeRecurrence(recent.recurrence ? recurrenceAfterBaseDateChange(recent.recurrence, recent.recurrence.startsOn, date) : null); setRecentOpen(false); };
  const changeDate = (nextDate: string) => { setDate(nextDate); setRecurrence((current) => recurrenceAfterBaseDateChange(current, current?.startsOn ?? date, nextDate)); };
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => { formEvent.preventDefault(); setBusy(true); setError(""); try { const plannedAmount = Number(amount.replace(/[^0-9]/g, "")); const input = { type, title, plannedAmount, categoryId, date, memo: memo.trim() || null, recurrence, scope, occurrenceKey: item?.occurrenceKey ?? undefined }; const result = item ? await updateMoney(item.id, input) : await createMoney(input); if (!item && settlementMode === "actual") await putMoneyActual(result.money.id, `money:${result.money.id}:${date}`, plannedAmount); onSaved(result.money); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  return <main className="screen-page event-form-page money-form-page"><header className="screen-header"><button aria-label="お金一覧へ戻る" className="back-button" onClick={onCancel} type="button">‹</button><h1>{item ? "お金を編集" : "お金を登録"}</h1><span className="header-spacer" /></header><form className="event-form" onSubmit={(event) => { void submit(event); }}><button className="recent-entry-button" onClick={() => setRecentOpen(true)} type="button"><span>以前の項目から選ぶ</span><span aria-hidden="true">›</span></button><label className="input-field event-title-field" htmlFor="money-title"><span>項目名</span><Input id="money-title" onChange={setTitle} required value={title} /></label><label className="input-field" htmlFor="money-amount"><span>金額</span><Input id="money-amount" inputMode="numeric" min="1" onChange={(value) => setAmount(value.replace(/[^0-9]/g, ""))} required type="text" value={amount ? Number(amount).toLocaleString("ja-JP") : ""} /></label><section className="event-form-section"><FormRow ariaLabel="お金の種類" label="種類" onClick={() => setTypeOpen(true)} summary={type === "expense" ? "支出" : "収入"} /></section>{!item ? <section className="event-form-section"><FormRow ariaLabel="金額の状態" label="金額の状態" onClick={() => setSettlementOpen(true)} summary={settlementMode === "actual" ? "確定" : "予定"} /></section> : null}<section className="event-form-section"><FormRow ariaLabel="お金カテゴリ" label="カテゴリ" onClick={() => setCategoryOpen(true)} summary={categories.find((category) => category.id === categoryId)?.name ?? "選択"} /></section><DateInput id="money-date" label="日付" onChange={changeDate} value={date} /><section className="event-form-section"><FormRow ariaLabel="お金の繰り返し" label="繰り返し" onClick={() => setRecurrenceOpen(true)} summary={recurrenceSummary(recurrence, date)} /></section><label className="input-field expanded-input" htmlFor="money-memo"><span>メモ</span><textarea className="textarea" id="money-memo" onChange={(event) => setMemo(event.target.value)} value={memo} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "保存中…" : item ? "変更を保存" : "登録"}</Button>{item && onDelete ? <Button onClick={onDelete} variant="secondary">削除</Button> : null}</form><MoneyRecentSheet onClose={() => setRecentOpen(false)} onSelect={applyRecent} open={recentOpen} /><MoneyChoiceSheet onClose={() => setTypeOpen(false)} onSelect={(value) => switchType(value as MoneyType)} open={typeOpen} options={[{ label: "支出", value: "expense" }, { label: "収入", value: "income" }]} title="種類" /><MoneyChoiceSheet onClose={() => setSettlementOpen(false)} onSelect={(value) => { setSettlementMode(value as "actual" | "planned"); setSettlementModeTouched(true); setSettlementOpen(false); }} open={settlementOpen} options={[{ label: "確定", value: "actual" }, { label: "予定", value: "planned" }]} title="金額の状態" /><MoneyCategorySheet categories={categories} onChange={setCategoryId} onClose={() => setCategoryOpen(false)} open={categoryOpen} value={categoryId} /><MoneyRecurrenceSheet onChange={changeRecurrence} onClose={() => setRecurrenceOpen(false)} open={recurrenceOpen} recurrence={recurrence} startDate={date} /></main>;
}

function MoneyActualSheet({ item, open, onClose, onSaved }: { item: MoneyItem | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(item?.settlementStatus ? String(item.effectiveAmount ?? item.plannedAmount) : String(item?.effectivePlannedAmount ?? item?.plannedAmount ?? "")); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!item) return null;
  const save = async () => { setBusy(true); setError(""); try { await putMoneyActual(item.id, item.occurrenceKey ?? "", Number(amount.replace(/[^0-9]/g, ""))); onSaved(); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  const clear = async () => { setBusy(true); setError(""); try { await deleteMoneyActual(item.id, item.occurrenceKey ?? ""); onSaved(); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "取消できませんでした。"); } finally { setBusy(false); } };
  return <BottomSheet open={open} title="確定額" onClose={onClose}><div className="actual-sheet"><label className="input-field" htmlFor="money-actual-amount"><span>確定額</span><Input id="money-actual-amount" inputMode="numeric" min="1" onChange={(value) => setAmount(value.replace(/[^0-9]/g, ""))} type="text" value={amount ? Number(amount).toLocaleString("ja-JP") : ""} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中…" : "保存"}</Button>{item.settlementStatus === "actual" ? <Button disabled={busy} onClick={() => { void clear(); }} variant="secondary">確定を取り消す</Button> : null}</div></BottomSheet>;
}

function MoneyPage({ month, money, onMonthChange, onEdit, onMoneyChanged }: { month: string; money: MoneyProjection | null; onMonthChange: (month: string) => void; onEdit: (item: MoneyItem) => void; onMoneyChanged: () => void }) {
  const occurrences = money?.occurrences ?? [];
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);
  const [actualItem, setActualItem] = useState<MoneyItem | null>(null);
  const { clickCapture, dragging, offset, pointerCancel, pointerDown, pointerMove, pointerUp } = useHorizontalSwipe((direction) => onMonthChange(shiftMonth(month, direction === "next" ? 1 : -1)), (target) => target instanceof Element && Boolean(target.closest(".event-swipe-row")));
  const toggleRow = (key: string) => setOpenRow((current) => current === key ? null : key);
  const handleMainTap = (key: string) => { if (openActionRow === key) { setOpenActionRow(null); return; } toggleRow(key); };
  return <main className="screen-page money-page" onPointerDownCapture={(event) => { if (openRow && !(event.target instanceof Element && event.target.closest(".event-swipe-row"))) setOpenRow(null); }}>
    <header className="screen-header"><h1>お金</h1><span className="daily-date-label">{formatDate(todayDateKey())}</span></header>
    <div className={`money-month-body${dragging ? " is-swipe-dragging" : ""}`} onClickCapture={clickCapture} onPointerCancel={pointerCancel} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} style={{ "--money-swipe-offset": `${offset}px` } as CSSProperties}>
      <div className="money-month-nav"><button aria-label="前の月" onClick={() => onMonthChange(shiftMonth(month, -1))} type="button">‹</button><h2>{formatMonth(month)}</h2><button aria-label="次の月" onClick={() => onMonthChange(shiftMonth(month, 1))} type="button">›</button></div>
      <section className="money-summary" aria-label="今月の見込み"><div><span>支出見込み</span><strong className="money-summary__expense">{(money?.summary.expenseForecast ?? 0).toLocaleString("ja-JP")}円</strong></div><div><span>収入見込み</span><strong className="money-summary__income">{(money?.summary.incomeForecast ?? 0).toLocaleString("ja-JP")}円</strong></div><div><span>残りそう</span><strong className={(money?.summary.remaining ?? 0) >= 0 ? "money-summary__income" : "money-summary__expense"}>{(money?.summary.remaining ?? 0).toLocaleString("ja-JP")}円</strong></div></section>
      <section className="money-list"><h2>今月のお金</h2>{occurrences.map((item) => { const key = item.occurrenceKey ?? item.id; return <SwipeActionRow actions={[{ label: "編集", onClick: () => onEdit(item) }]} ariaLabel={item.title} expandedContent={openRow === key ? <MoneyInlineDetail item={item} onActual={() => setActualItem(item)} /> : null} key={key} onHorizontalSwipeStart={() => setOpenRow(null)} onOpenChange={(open) => setOpenActionRow(open ? key : null)} onOtherRowTouch={() => setOpenActionRow(null)} open={openActionRow === key}><button aria-controls={openRow === key ? `money-detail-${key}` : undefined} aria-expanded={openRow === key} className="money-list-row" onClick={(event) => { event.stopPropagation(); handleMainTap(key); }} type="button"><MoneyStatusIcon status={item.settlementStatus} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "その他"}</small></span><b className={`money-amount--${item.type}`}>{moneyAmountLabel(item.signedAmount ?? (item.type === "income" ? item.plannedAmount : -item.plannedAmount))}円</b></button></SwipeActionRow>; })}{occurrences.length === 0 ? <p className="empty-state">今月の記録はありません</p> : null}</section>
      <MoneyCategoryDonut occurrences={occurrences} />
    </div>
    <MoneyActualSheet key={actualItem?.occurrenceKey ?? "empty"} item={actualItem} onClose={() => setActualItem(null)} onSaved={onMoneyChanged} open={Boolean(actualItem)} />
  </main>;
}

function MoneyDeleteConfirmSheet({ title, onClose, onConfirm, busy }: { title: string; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <BottomSheet open title="お金を削除" onClose={onClose}><div className="delete-confirm"><p>「{title}」を削除しますか？</p><p className="delete-confirm__note">削除した記録は一覧から表示されなくなります。</p><Button disabled={busy} onClick={onConfirm} variant="secondary">{busy ? "削除中…" : "削除する"}</Button><Button disabled={busy} onClick={onClose} variant="ghost">キャンセル</Button></div></BottomSheet>; }

function MoneyCategorySettings() {
  const [categories, setCategories] = useState<MoneyCategory[]>([]); const [type, setType] = useState<MoneyType>("expense"); const [editing, setEditing] = useState<string | null>(null); const [openRow, setOpenRow] = useState<string | null>(null); const [name, setName] = useState(""); const [colorKey, setColorKey] = useState("orange"); const [error, setError] = useState("");
  const load = () => { void getMoneyCategories(undefined, true).then(({ categories: next }) => setCategories(next ?? [])).catch(() => setError("カテゴリを読み込めませんでした。")); }; useEffect(load, []);
  const start = (category?: MoneyCategory) => { setEditing(category?.id ?? "new"); setName(category?.name ?? ""); setColorKey(category?.colorKey ?? "orange"); };
  const save = async () => { try { if (editing === "new") { const result = await createMoneyCategory({ type, name, colorKey }); setCategories((current) => [...current, result.category]); } else if (editing) { const result = await updateMoneyCategory(editing, { name, colorKey }); setCategories((current) => current.map((category) => category.id === editing ? result.category : category)); } setEditing(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } };
  const deactivate = async (id: string) => { try { await deleteMoneyCategory(id); setCategories((current) => current.map((category) => category.id === id ? { ...category, active: false } : category)); } catch (caught) { setError(caught instanceof Error ? caught.message : "変更できませんでした。"); } };
  const filtered = categories.filter((category) => category.type === type);
  return <section className="money-category-settings" onPointerDownCapture={(event) => { if (openRow && !(event.target instanceof Element && event.target.closest(".event-swipe-row"))) setOpenRow(null); }}><div className="money-type-switch" role="group" aria-label="カテゴリ種類"><button aria-pressed={type === "expense"} className={type === "expense" ? "is-selected" : ""} onClick={() => setType("expense")} type="button">支出カテゴリ</button><button aria-pressed={type === "income"} className={type === "income" ? "is-selected" : ""} onClick={() => setType("income")} type="button">収入カテゴリ</button></div>{filtered.map((category) => { const row = <div className={`money-category-row${category.active ? "" : " is-inactive"}`}><span className={`money-category-dot money-category-dot--${category.colorKey ?? "orange"}`} /><span>{category.name}{category.active ? "" : "（無効）"}</span></div>; return editing === category.id ? <div key={category.id} className="money-category-row"><div className="money-category-editor"><Input aria-label="カテゴリ名" onChange={setName} value={name} /><select aria-label="カテゴリ色" onChange={(event) => setColorKey(event.target.value)} value={colorKey}>{["orange", "blue", "green", "red", "purple", "gold"].map((key) => <option key={key} value={key}>{key}</option>)}</select><Button onClick={() => { void save(); }}>保存</Button></div></div> : <SwipeActionRow actions={[{ label: "編集", onClick: () => { setOpenRow(null); start(category); } }, ...(category.active ? [{ label: "無効化", onClick: () => { void deactivate(category.id); }, variant: "danger" as const }] : [])]} ariaLabel={category.name} key={category.id} onOpenChange={(open) => setOpenRow(open ? category.id : null)} onOtherRowTouch={() => setOpenRow(category.id)} open={openRow === category.id}>{row}</SwipeActionRow>; })}{editing === "new" ? <div className="money-category-editor"><Input aria-label="新しいカテゴリ名" onChange={setName} placeholder="カテゴリ名" value={name} /><select aria-label="新しいカテゴリ色" onChange={(event) => setColorKey(event.target.value)} value={colorKey}>{["orange", "blue", "green", "red", "purple", "gold"].map((key) => <option key={key} value={key}>{key}</option>)}</select><Button onClick={() => { void save(); }}>保存</Button></div> : <Button onClick={() => start()} variant="secondary">カテゴリを追加</Button>}{error ? <p className="form-error" role="alert">{error}</p> : null}</section>;
}

const weekDayLabel = (value: number) => ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][value] ?? "月曜日";
function SettingsDetailPage({ detail, user, settings, onBack, onLogout, onSettingsChange }: { detail: SettingsDetail; user: AuthUser; settings: UserSettings | null; onBack: () => void; onLogout: () => void; onSettingsChange: (settings: UserSettings) => void }) {
  const titles: Record<SettingsDetail, string> = { account: "アカウント", notifications: "通知", calendar: "カレンダー", money: "お金", data: "データ / バックアップ" };
  const body = detail === "account" ? <><FormRow label="メール" summary={user.email} /><Button onClick={onLogout} variant="secondary">ログアウト</Button></> : detail === "notifications" ? <NotificationSettingsSection onSettingsChange={onSettingsChange} settings={settings} /> : detail === "calendar" ? <><FormRow label="タイムゾーン" summary={settings?.timezone ?? "Asia/Tokyo"} /><FormRow label="週の開始" summary={settings ? weekDayLabel(settings.weekStartsOn) : "月曜日"} /></> : detail === "money" ? <MoneyCategorySettings /> : <><FormRow label="バックアップ" summary="JSON" /><FormRow label="ローカルアーカイブ" summary="確認" /></>;
  return <main className="screen-page settings-page"><header className="screen-header"><button aria-label="設定へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>{titles[detail]}</h1><span className="header-spacer" /></header><section className="settings-detail-list">{body}</section></main>;
}
function SettingsShell({ user, settings, detail, onOpenDetail, onBack, onLogout, onSettingsChange }: { user: AuthUser; settings: UserSettings | null; detail: SettingsDetail | null; onOpenDetail: (detail: SettingsDetail) => void; onBack: () => void; onLogout: () => void; onSettingsChange: (settings: UserSettings) => void }) { if (detail) return <SettingsDetailPage detail={detail} onBack={onBack} onLogout={onLogout} onSettingsChange={onSettingsChange} settings={settings} user={user} />; return <main className="screen-page settings-page"><header className="screen-header"><h1>設定</h1></header><section className="settings-root-list"><FormRow ariaLabel="アカウントを開く" label="アカウント" onClick={() => onOpenDetail("account")} /><FormRow ariaLabel="通知を開く" label="通知" onClick={() => onOpenDetail("notifications")} /><FormRow ariaLabel="カレンダーを開く" label="カレンダー" onClick={() => onOpenDetail("calendar")} /><FormRow ariaLabel="お金を開く" label="お金" onClick={() => onOpenDetail("money")} /><FormRow ariaLabel="データとバックアップを開く" label="データ / バックアップ" onClick={() => onOpenDetail("data")} /></section></main>; }
function AddChoiceSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (choice: AddChoice) => void }) { return <BottomSheet open={open} onClose={onClose} title="追加"><div className="choice-list"><FormRow ariaLabel="家を追加" chevron={false} label="家" onClick={() => onSelect("家")} /><FormRow ariaLabel="仕事を追加" chevron={false} label="仕事" onClick={() => onSelect("仕事")} /><FormRow ariaLabel="お金を追加" chevron={false} label="お金" onClick={() => onSelect("お金")} /></div></BottomSheet>; }

export function App() {
  const linkedDate = notificationDateFromPath(); const [user, setUser] = useState<AuthUser | null>(null); const [settings, setSettings] = useState<UserSettings | null>(null); const [authChecked, setAuthChecked] = useState(false); const [authError, setAuthError] = useState(""); const [screen, setScreen] = useState<Screen>(screenFromPath); const [settingsDetail, setSettingsDetail] = useState<SettingsDetail | null>(null); const [events, setEvents] = useState<Event[]>([]); const [moneyProjection, setMoneyProjection] = useState<MoneyProjection | null>(null); const [dailyNote, setDailyNote] = useState<DailyNote | null>(null); const [month, setMonth] = useState(monthStart(linkedDate ?? todayDateKey())); const [moneyMonth, setMoneyMonth] = useState(monthStart(linkedDate ?? todayDateKey())); const [dailyDate, setDailyDate] = useState(linkedDate ?? todayDateKey()); const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>("all"); const [dailyFilter, setDailyFilter] = useState<CalendarFilter>("all"); const [selectedDate, setSelectedDate] = useState<string | null>(linkedDate); const [dateSheetOpen, setDateSheetOpen] = useState(Boolean(linkedDate)); const [addOpen, setAddOpen] = useState(false); const [pendingAddContext, setPendingAddContext] = useState<MoneyReturnContext | null>(null); const [formState, setFormState] = useState<{ category: Event["category"]; initialDate: string; event?: Event; returnTo: ReturnContext; scope?: EventScope } | null>(null); const [moneyFormState, setMoneyFormState] = useState<{ initialDate: string; item?: MoneyItem; returnTo: MoneyReturnContext; scope?: EventScope } | null>(null); const [detailState, setDetailState] = useState<{ event: Event; returnTo: ReturnContext } | null>(null); const [scopeState, setScopeState] = useState<{ event: Event; returnTo: ReturnContext; action: "edit" | "delete" } | null>(null); const [moneyScopeState, setMoneyScopeState] = useState<{ item: MoneyItem; returnTo: MoneyReturnContext; action: "edit" | "delete" } | null>(null); const [deleteTarget, setDeleteTarget] = useState<{ event: Event; returnTo: ReturnContext; scope: EventScope } | null>(null); const [moneyDeleteTarget, setMoneyDeleteTarget] = useState<{ item: MoneyItem; scope: EventScope; returnTo: MoneyReturnContext } | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [moneyDeleteOpen, setMoneyDeleteOpen] = useState(false); const [deleteBusy, setDeleteBusy] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [selectionNote, setSelectionNote] = useState("");
  useEffect(() => { let active = true; void authMe().then(async ({ user: authenticatedUser }) => { if (!active) return; setUser(authenticatedUser); const result = await getSettings().catch(() => null); if (active && result) setSettings(result.settings); }).catch((error: unknown) => { if (active && apiErrorStatus(error) !== 401) setAuthError("ログイン状態を確認できませんでした。"); }).finally(() => { if (active) setAuthChecked(true); }); const onPopState = () => setScreen(screenFromPath()); window.addEventListener("popstate", onPopState); return () => { active = false; window.removeEventListener("popstate", onPopState); }; }, []);
  useEffect(() => { if (!user || screen !== "calendar") return; void getCalendar(month).then(({ events: nextEvents, money }) => { setEvents(nextEvents ?? []); setMoneyProjection(money ?? null); }).catch(() => { setEvents([]); setMoneyProjection(null); }); }, [month, screen, user]);
  useEffect(() => { if (!user || screen !== "daily") return; void getDaily(dailyDate).then(({ events: nextEvents, dailyNote: nextNote, money }) => { setEvents(nextEvents ?? []); setMoneyProjection(money ?? null); setDailyNote(nextNote ?? null); }).catch(() => { setEvents([]); setMoneyProjection(null); setDailyNote(null); }); }, [dailyDate, screen, user]);
  useEffect(() => { if (!user || screen !== "money") return; void getMoneyMonth(moneyMonth).then((nextMoney) => setMoneyProjection(nextMoney)).catch(() => setMoneyProjection(null)); }, [moneyMonth, screen, user]);
  const navigate = (nextScreen: Screen) => { window.history.pushState({}, "", screenPath[nextScreen]); setScreen(nextScreen); setSettingsDetail(null); setSelectedDate(null); setDateSheetOpen(false); setFormState(null); setDetailState(null); };
  const handleAuthenticated = (authenticatedUser: AuthUser) => { setUser(authenticatedUser); setAuthError(""); void getSettings().then(({ settings: nextSettings }) => setSettings(nextSettings)).catch(() => undefined); };
  const handleLogout = () => { void logout().finally(() => { setUser(null); setSettings(null); setEvents([]); setSettingsDetail(null); setScreen("calendar"); window.history.pushState({}, "", "/calendar"); }); };
  const returnContext = (): ReturnContext => screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter };
  const openAdd = (category: Event["category"], context?: ReturnContext) => { const nextContext = context ?? (pendingAddContext && pendingAddContext.screen !== "money" ? pendingAddContext : returnContext()); setPendingAddContext(null); setSelectedDate(nextContext.screen === "calendar" ? nextContext.date : null); setAddOpen(false); setSelectionNote(""); setFormState({ category, initialDate: nextContext.date, returnTo: nextContext }); };
  const openMoney = (context: MoneyReturnContext, item?: MoneyItem, scope: EventScope = "series") => { setPendingAddContext(null); setAddOpen(false); setDateSheetOpen(false); setFormState(null); setDetailState(null); setSelectedDate(context.screen === "calendar" ? context.date : null); setMoneyFormState({ initialDate: context.screen === "money" ? todayDateKey() : context.date, item, returnTo: context, scope }); };
  const handleAddSelect = (choice: AddChoice) => { const context = pendingAddContext ?? returnContext(); if (choice === "お金") { openMoney(context); return; } const eventContext: ReturnContext = context.screen === "money" ? { screen: "calendar", date: todayDateKey(), filter: "all" } : context; openAdd(choice === "家" ? "home" : "work", eventContext); };
  const restore = (context: ReturnContext) => { setScreen(context.screen); setDateSheetOpen(false); if (context.screen === "calendar") { setCalendarFilter(context.filter); setSelectedDate(context.date); setMonth(monthStart(context.date)); } else { setDailyFilter(context.filter); setDailyDate(context.date); } };
  const openDaily = (date: string, filter: CalendarFilter) => { setSelectedDate(null); setDateSheetOpen(false); setDailyFilter(filter); setDailyDate(date); setScreen("daily"); window.history.pushState({}, "", screenPath.daily); };
  const closeForm = () => { const context = formState?.returnTo; setFormState(null); if (context) restore(context); };
  const closeMoneyForm = () => { const context = moneyFormState?.returnTo; setMoneyFormState(null); if (context?.screen === "calendar" || context?.screen === "daily") { restore(context); } };
  const handleMoneySaved = () => { const context = moneyFormState?.returnTo; setMoneyFormState(null); if (!context) return; if (context.screen === "money") { setMoneyMonth(context.month); void getMoneyMonth(context.month).then((nextMoney) => setMoneyProjection(nextMoney)).catch(() => undefined); } else { restore(context); void refreshProjection(context); } };
  const handleNoteSaved = async (content: string) => { const result = await upsertDailyNote(dailyDate, content); setDailyNote(result.dailyNote); return result.dailyNote; };
  const closeDetail = () => { const context = detailState?.returnTo; setDetailState(null); if (context) restore(context); };
  const openEventEdit = (event: Event, returnTo: ReturnContext) => { if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "edit" }); return; } setDetailState(null); setFormState({ category: event.category, event, initialDate: event.startDate ?? event.periodAnchorDate ?? event.periodStartDate ?? returnTo.date, returnTo, scope: "series" }); };
  const editEvent = () => { if (!detailState) return; openEventEdit(detailState.event, detailState.returnTo); };
  const requestDelete = (event: Event, returnTo: ReturnContext) => { if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "delete" }); return; } setDeleteTarget({ event, returnTo, scope: "series" }); setFormState(null); setDeleteOpen(true); };
  const refreshProjection = async (context: ReturnContext) => { if (context.screen === "calendar") { const result = await getCalendar(monthStart(context.date)).catch(() => null); if (result) { setEvents(result.events ?? []); setMoneyProjection(result.money ?? null); } } else { const result = await getDaily(context.date).catch(() => null); if (result) { setEvents(result.events ?? []); setMoneyProjection(result.money ?? null); setDailyNote(result.dailyNote ?? null); } } };
  const requestMoneyDelete = (item: MoneyItem, scope: EventScope = moneyFormState?.scope ?? "series") => { setMoneyDeleteTarget({ item, scope, returnTo: moneyFormState?.returnTo ?? { screen: "money", month: moneyMonth } }); setMoneyDeleteOpen(true); };
  const confirmMoneyDelete = async () => { const target = moneyDeleteTarget; if (!target) return; setDeleteBusy(true); try { await deleteMoney(target.item.id, target.scope, target.item.occurrenceKey ?? undefined); setMoneyDeleteOpen(false); setMoneyDeleteTarget(null); setMoneyFormState(null); if (target.returnTo.screen === "calendar" || target.returnTo.screen === "daily") { restore(target.returnTo); void refreshProjection(target.returnTo); } else { const nextMoney = await getMoneyMonth(target.returnTo.screen === "money" ? target.returnTo.month : moneyMonth).catch(() => null); if (nextMoney) setMoneyProjection(nextMoney); } } catch (caught) { setSelectionNote(caught instanceof Error ? caught.message : "削除できませんでした。"); } finally { setDeleteBusy(false); } };
  const openMoneyEdit = (item: MoneyItem, context: MoneyReturnContext = { screen: "money", month: moneyMonth }) => { if (item.recurrenceRuleId && item.occurrenceKey) { setMoneyScopeState({ item, returnTo: context, action: "edit" }); return; } openMoney(context, item, "series"); };
  const handleMoneyScopeSelect = (scope: EventScope) => { const target = moneyScopeState; if (!target) return; setMoneyScopeState(null); if (target.action === "edit") openMoney(target.returnTo, target.item, scope); else { setMoneyDeleteTarget({ item: target.item, scope, returnTo: target.returnTo }); setMoneyDeleteOpen(true); } };
  const handleScopeSelect = (scope: EventScope) => { const target = scopeState; if (!target) return; setScopeState(null); if (target.action === "edit") { setDetailState(null); setFormState({ category: target.event.category, event: target.event, initialDate: target.event.startDate ?? target.event.periodAnchorDate ?? target.event.periodStartDate ?? target.returnTo.date, returnTo: target.returnTo, scope }); } else { setDeleteTarget({ event: target.event, returnTo: target.returnTo, scope }); setDeleteOpen(true); } };
  const handleSaved = (event: Event) => { setEvents((current) => [...current.filter((item) => event.occurrenceKey ? eventIdentity(item) !== event.occurrenceKey : item.id !== event.id), event]); const context = formState?.returnTo; setFormState(null); if (context) { restore(context); void refreshProjection(context); } };
  const confirmDelete = async () => { const target = deleteTarget; if (!target) return; setDeleteBusy(true); try { await deleteEvent(target.event.id, target.scope, target.event.occurrenceKey ?? undefined); setEvents((current) => target.scope === "occurrence" ? current.filter((event) => eventIdentity(event) !== target.event.occurrenceKey) : current.filter((event) => event.id !== target.event.id)); setDeleteOpen(false); setDeleteTarget(null); setDetailState(null); restore(target.returnTo); void refreshProjection(target.returnTo); } catch (caught) { setSelectionNote(caught instanceof Error ? caught.message : "削除できませんでした。"); } finally { setDeleteBusy(false); } };
  if (!authChecked) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><p className="empty-state">読み込み中</p></main></div>;
  if (!user) return <><LoginPage onAuthenticated={handleAuthenticated} />{authError ? <p className="auth-global-error" role="alert">{authError}</p> : null}</>;
  const content = moneyFormState ? <MoneyForm initialDate={moneyFormState.initialDate} item={moneyFormState.item} onCancel={closeMoneyForm} onDelete={moneyFormState.item ? () => requestMoneyDelete(moneyFormState.item as MoneyItem, moneyFormState.scope) : undefined} onSaved={handleMoneySaved} scope={moneyFormState.scope} suppressInitialRecentOpen /> : formState ? <EventForm category={formState.category} event={formState.event} initialDate={formState.initialDate} onCancel={closeForm} onDelete={formState.event ? () => requestDelete(formState.event as Event, formState.returnTo) : undefined} onSaved={handleSaved} scope={formState.scope} suppressInitialRecentOpen /> : detailState ? <EventDetailPage event={detailState.event} onBack={closeDetail} onDelete={() => requestDelete(detailState.event, detailState.returnTo)} onEdit={editEvent} /> : screen === "calendar" ? <CalendarShell events={events} money={moneyProjection} filter={calendarFilter} month={month} onDateSelect={(date, filter) => { setCalendarFilter(filter); setSelectedDate(date); setDateSheetOpen(true); }} onFilterChange={setCalendarFilter} onMonthChange={setMonth} onSearch={() => setSearchOpen(true)} /> : screen === "daily" ? <DailyShell key={dailyDate} date={dailyDate} dailyNote={dailyNote} events={events} money={moneyProjection} filter={dailyFilter} onDateChange={(nextDate) => { setMonth(monthStart(nextDate)); setDailyDate(nextDate); }} onFilterChange={setDailyFilter} onEditEvent={(event) => openEventEdit(event, { screen: "daily", date: dailyDate, filter: dailyFilter })} onEditMoney={(item) => openMoneyEdit(item, { screen: "daily", date: dailyDate, filter: dailyFilter })} onEditPeriod={(label) => setSelectionNote(`${label}の編集はM4の期間予定表示に対応しています。`)} onMoneyChanged={() => { void refreshProjection({ screen: "daily", date: dailyDate, filter: dailyFilter }); }} onSaveNote={handleNoteSaved} settings={settings} /> : screen === "money" ? <MoneyPage month={moneyMonth} money={moneyProjection} onEdit={(item) => openMoneyEdit(item)} onMoneyChanged={() => { void getMoneyMonth(moneyMonth).then((nextMoney) => setMoneyProjection(nextMoney)).catch(() => undefined); }} onMonthChange={setMoneyMonth} /> : <SettingsShell detail={settingsDetail} onBack={() => setDetailState(null)} onLogout={handleLogout} onOpenDetail={setSettingsDetail} onSettingsChange={setSettings} settings={settings} user={user} />;
  return <MobileShell activeNavigation={formState || moneyFormState || detailState || deleteOpen || moneyDeleteOpen || moneyScopeState ? undefined : screen} onAdd={() => { const context: MoneyReturnContext = screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : screen === "money" ? { screen: "money", month: moneyMonth } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter }; setPendingAddContext(context); setSelectedDate(null); setDateSheetOpen(false); setAddOpen(true); }} onNavigate={navigate} showBottomNavigation={!formState && !moneyFormState && !detailState && !deleteOpen && !moneyDeleteOpen && !moneyScopeState}>{content}{selectionNote ? <p className="selection-note" role="status">{selectionNote}</p> : null}{selectedDate && dateSheetOpen && !formState && !moneyFormState && !detailState ? <CalendarDateSheet date={selectedDate} events={events} money={moneyProjection} filter={calendarFilter} onAddCategory={(category) => { setDateSheetOpen(false); openAdd(category, { screen: "calendar", date: selectedDate, filter: calendarFilter }); }} onAddMoney={() => openMoney({ screen: "calendar", date: selectedDate, filter: calendarFilter })} onClose={() => setDateSheetOpen(false)} onDateChange={(nextDate) => { setSelectedDate(nextDate); setMonth(monthStart(nextDate)); }} onEditEvent={(event) => openEventEdit(event, { screen: "calendar", date: selectedDate, filter: calendarFilter })} onEditMoney={(item) => openMoneyEdit(item, { screen: "calendar", date: selectedDate, filter: calendarFilter })} onMoneyChanged={() => { void refreshProjection({ screen: "calendar", date: selectedDate, filter: calendarFilter }); }} onOpenDaily={() => openDaily(selectedDate, calendarFilter)} settings={settings} /> : null}<AddChoiceSheet onClose={() => { setPendingAddContext(null); setAddOpen(false); }} onSelect={handleAddSelect} open={addOpen} /><ScopeSheet action={scopeState?.action ?? "edit"} onClose={() => setScopeState(null)} onSelect={handleScopeSelect} open={Boolean(scopeState)} /><ScopeSheet action={moneyScopeState?.action ?? "edit"} onClose={() => setMoneyScopeState(null)} onSelect={handleMoneyScopeSelect} open={Boolean(moneyScopeState)} subject="項目" /><DeleteConfirmSheet busy={deleteBusy} onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }} onConfirm={() => { void confirmDelete(); }} open={deleteOpen} title={deleteTarget?.event.title ?? "予定"} />{moneyDeleteOpen && moneyDeleteTarget ? <MoneyDeleteConfirmSheet busy={deleteBusy} onClose={() => { setMoneyDeleteOpen(false); setMoneyDeleteTarget(null); }} onConfirm={() => { void confirmMoneyDelete(); }} title={moneyDeleteTarget.item.title} /> : null}{searchOpen ? <BottomSheet open title="検索" onClose={() => setSearchOpen(false)}><p className="empty-state">検索は後のMilestoneで追加します。</p></BottomSheet> : null}</MobileShell>;
}
