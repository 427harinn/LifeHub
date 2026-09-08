import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  apiErrorStatus, authMe, createEvent, deleteEvent, getCalendar, getDaily, getRecentEventDefinitions, getSettings, login, logout, register, updateEvent, upsertDailyNote,
  type AuthUser, type DailyNote, type Event, type EventCommandInput, type EventScope, type RecurrenceRuleInput, type UserSettings
} from "./api/client";
import { BottomSheet, Button, FormRow, Input, MobileShell, NavIcon } from "./components/ui";
import { dailyFixture } from "./fixtures/m2ShellFixtures";

type Screen = "calendar" | "daily" | "money" | "settings";
type AddChoice = "家" | "仕事" | "お金";
type CalendarFilter = "all" | "home" | "work" | "money";
type SettingsDetail = "account" | "notifications" | "calendar" | "money" | "data";
type ReturnContext = { screen: "calendar" | "daily"; date: string; filter: CalendarFilter };
type CalendarProjectedEvent = { band?: "start" | "middle" | "end"; category: Event["category"]; day: number; date: string; eventId: string; isMultiDay?: boolean; kind: "single"; label: string };
type CalendarBandSegment = { category: Event["category"]; endColumn: number; isEnd: boolean; isStart: boolean; label: string; lane: number; row: number; startColumn: number };
type CalendarMoneyItem = { amount: number; category: "expense" | "income"; isSummary?: boolean; label: string };
type CalendarMoneySummary = { amount: number; category: "expense" | "income" };

const screenFromPath = (): Screen => { const path = window.location.pathname; if (path === "/daily") return "daily"; if (path === "/money") return "money"; if (path === "/settings") return "settings"; return "calendar"; };
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
export const recurrenceSummary = (recurrence: RecurrenceRuleInput | null | undefined, startDate = "2026-01-01") => {
  if (!recurrence) return "なし";
  const interval = recurrence.interval || 1;
  const prefix = interval === 1
    ? recurrence.frequency === "daily" ? "毎日" : recurrence.frequency === "weekly" ? "毎週" : "毎月"
    : `${interval}${recurrenceFrequencyLabel(recurrence.frequency)}`;
  if (recurrence.frequency === "daily") return `${prefix}${recurrenceEndText(recurrence.endsOn)}`;
  if (recurrence.frequency === "weekly") {
    const weekdays = recurrenceWeekdayText(recurrence.weekdays ?? [], startDate);
    const weekdaySuffix = (recurrence.weekdays ?? [recurrenceWeekday(startDate)]).length === 1 ? `${weekdays}曜` : ` ${weekdays}`;
    return `${prefix}${weekdaySuffix}${recurrenceEndText(recurrence.endsOn)}`;
  }
  return `${prefix}${recurrence.dayOfMonth ?? Number(startDate.slice(-2))}日${recurrenceEndText(recurrence.endsOn)}`;
};
export const formatDate = (value: string, includeYear = false) => { const date = dateFromKey(value); return `${includeYear ? `${date.getFullYear()}年` : ""}${date.getMonth() + 1}月${date.getDate()}日(${weekdayLabels[date.getDay()]})`; };
export const formatDateRange = (startDate: string, endDate: string, includeYear = false) => startDate === endDate ? formatDate(startDate, includeYear) : `${formatDate(startDate, includeYear)}〜${formatDate(endDate, includeYear)}`;
const formatMonth = (value: string) => { const date = dateFromKey(value); return `${date.getFullYear()}年${date.getMonth() + 1}月`; };
const shiftMonth = (value: string, amount: number) => { const date = dateFromKey(value); date.setMonth(date.getMonth() + amount, 1); return dateKey(date); };
const shiftDate = (value: string, amount: number) => { const date = dateFromKey(value); date.setDate(date.getDate() + amount); return dateKey(date); };
const dateDifference = (from: string, to: string) => Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86400000);
export const weekEnd = (value: string, weekStartsOn: number) => { const day = dateFromKey(value).getDay(); const normalizedStart = ((weekStartsOn % 7) + 7) % 7; return shiftDate(value, (normalizedStart + 6 - day + 7) % 7); };
const eventMatchesFilter = (event: Event, filter: CalendarFilter) => filter === "all" || filter === event.category;
const fixtureEventMatchesFilter = (event: CalendarProjectedEvent, filter: CalendarFilter) => filter !== "money" && (filter === "all" || filter === event.category);
const eventOverlapsDate = (event: Event, date: string) => event.timingType === "period"
  ? Boolean(event.periodStartDate && event.periodEndDate && event.periodStartDate <= date && event.periodEndDate >= date)
  : Boolean(event.startDate && event.endDate && event.startDate <= date && event.endDate >= date);
const eventTimeLabel = (event: Event) => event.timingType === "period" ? "期間" : event.allDay ? "終日" : `${event.startTime}〜${event.endTime}`;
const moneyAmountLabel = (amount: number) => `${amount >= 0 ? "+" : "-"}${Math.abs(amount).toLocaleString("ja-JP")}`;
export const calendarMoneyEntriesForDate = (date: string, today: string): CalendarMoneyItem[] => date === today ? [{ amount: -1500, category: "expense", label: "食費" }, { amount: 2999, category: "income", label: "副収入" }, { amount: -800, category: "expense", label: "交通費" }] : date === shiftDate(today, 6) ? [{ amount: 2999, category: "income", label: "副収入" }] : [];
export const calendarMoneySummaryForDate = (date: string, today: string): CalendarMoneySummary | null => { const entries = calendarMoneyEntriesForDate(date, today); if (entries.length === 0) return null; const amount = entries.reduce((total, entry) => total + entry.amount, 0); return { amount, category: amount >= 0 ? "income" : "expense" }; };
const calendarMoneyForCell = (date: string | null, filter: CalendarFilter, today: string): CalendarMoneyItem[] => {
  if (!date || filter === "home" || filter === "work") return [];
  const entries = calendarMoneyEntriesForDate(date, today);
  const summary = calendarMoneySummaryForDate(date, today);
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

function CalendarShell({ events, filter, month, onDateSelect, onFilterChange, onMonthChange, onSearch }: { events: Event[]; filter: CalendarFilter; month: string; onDateSelect: (date: string, filter: CalendarFilter) => void; onFilterChange: (filter: CalendarFilter) => void; onMonthChange: (month: string) => void; onSearch: () => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthDragging, setMonthDragging] = useState(false);
  const monthGesture = useRef<{ axis: "pending" | "horizontal" | "vertical"; x: number; y: number } | null>(null);
  const suppressMonthClick = useRef(false);
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
        if (calendarMoneyForCell(cellDate, filter, today).some((item) => item.isSummary)) return false;
      }
    }
    return segment.lane < rowCapacity;
  };
  const pointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return; monthGesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressMonthClick.current = false; };
  const pointerMove = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const gesture = monthGesture.current; if (!gesture) return; const dx = pointerEvent.clientX - gesture.x; const dy = pointerEvent.clientY - gesture.y; if (gesture.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { gesture.axis = "vertical"; setMonthDragging(false); return; } gesture.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); setMonthDragging(true); } if (gesture.axis === "horizontal") { pointerEvent.preventDefault(); setMonthOffset(Math.max(-96, Math.min(96, dx))); } };
  const pointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const gesture = monthGesture.current; if (!gesture) return; const dx = pointerEvent.clientX - gesture.x; const dy = pointerEvent.clientY - gesture.y; if (gesture.axis === "horizontal") { pointerEvent.preventDefault(); suppressMonthClick.current = true; if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) onMonthChange(shiftMonth(month, dx < 0 ? 1 : -1)); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } monthGesture.current = null; setMonthDragging(false); setMonthOffset(0); };
  return <main className="screen-page calendar-page">
    <header className="screen-header"><h1>カレンダー</h1><button aria-label="検索" className="icon-button" onClick={onSearch} type="button"><NavIcon name="search" /></button></header>
    <FixtureTabs active={filter} onChange={onFilterChange} />
    <section aria-label={`${year}年${monthIndex + 1}月`} className="calendar-section">
      <div className="calendar-month"><button aria-label="前の月" className="month-button" onClick={() => onMonthChange(shiftMonth(month, -1))} type="button">‹</button><h2>{formatMonth(month)}</h2><button aria-label="次の月" className="month-button" onClick={() => onMonthChange(shiftMonth(month, 1))} type="button">›</button></div>
      <button className="calendar-today" onClick={() => onMonthChange(monthStart(today))} type="button">今日</button>
      <div className="calendar-weekdays">{weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className={`calendar-grid${monthDragging ? " is-swipe-dragging" : ""}`} ref={calendarGridRef} onClickCapture={(clickEvent) => { if (!suppressMonthClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressMonthClick.current = false; }} onPointerCancel={() => { monthGesture.current = null; setMonthDragging(false); setMonthOffset(0); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} style={{ "--calendar-swipe-offset": `${monthOffset}px` } as CSSProperties}>
        {cells.map((day, index) => {
          const cellDate = day ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : null;
          const dayEvents = day ? filteredEvents.filter((event) => event.day === day) : [];
          const cellEvents = dayEvents.filter((event) => !event.isMultiDay);
          const bandLaneCount = bandLaneCountByCell[`${Math.floor(index / 7)}:${(index % 7) + 1}`] ?? 0;
          const money = calendarMoneyForCell(cellDate, filter, today);
          const allocation = allocateCalendarCellRows(cellEvents, bandLaneCount, money, rowCapacity, rowCapacity);
          const hasBand = bandLaneCount > 0;
          return <button aria-label={day ? `${day}日` : "空の日付"} className={`calendar-cell${cellDate === today ? " calendar-cell--today" : ""}${hasBand ? " calendar-cell--has-band" : ""}`} disabled={!day} key={`${day ?? "empty"}-${index}`} onClick={() => { if (cellDate) onDateSelect(cellDate, filter); }} style={{ "--calendar-band-lanes": Math.min(rowCapacity, bandLaneCount) } as CSSProperties} type="button">
            {day ? <><span className="calendar-cell__date">{day}</span>{allocation.hiddenCount > 0 ? <span aria-label={`${allocation.hiddenCount}件の予定を省略`} className="calendar-cell__count">{allocation.hiddenCount}</span> : null}<span className="calendar-cell__single-events">
              {allocation.visibleEvents.map((event) => <span className={`calendar-event calendar-event--${event.category} calendar-event--${event.kind}`} key={`${event.eventId}-${event.date}`}>{event.label}</span>)}
              {Array.from({ length: allocation.emptyRows }, (_, emptyIndex) => <span aria-hidden="true" className="calendar-event" key={`empty-${emptyIndex}`} />)}
              {allocation.visibleMoney.map((entry, moneyIndex) => <span className={`calendar-cell__money calendar-cell__money--${entry.category}${entry.isSummary ? " calendar-cell__money--summary" : " calendar-cell__money--detail"}`} key={`${entry.label}-${entry.amount}-${moneyIndex}`}>{entry.isSummary ? moneyAmountLabel(entry.amount) : entry.label}</span>)}
            </span></> : null}
          </button>;
        })}
        <div aria-hidden="true" className="calendar-band-layer">{bands.filter(bandFitsRowAllocation).map((segment, index) => <span className={`calendar-band calendar-band--multi calendar-band--${segment.category}${segment.isStart ? " calendar-band--start" : ""}${segment.isEnd ? " calendar-band--end" : ""}`} key={`${segment.category}-${segment.row}-${segment.startColumn}-${index}`} style={{ "--band-lane": segment.lane, gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`, gridRow: segment.row + 1 } as CSSProperties}>{segment.label}</span>)}</div>
      </div>
    </section>
  </main>;
}

function CalendarDateSheet({ date, events, filter, settings, onClose, onAddCategory, onAddMoney, onOpenDaily, onEditEvent, onEditPeriod, onDateChange }: { date: string; events: Event[]; filter: CalendarFilter; settings: UserSettings | null; onClose: () => void; onAddCategory: (category: Event["category"]) => void; onAddMoney: () => void; onOpenDaily: () => void; onEditEvent: (event: Event) => void; onEditPeriod?: (label: string) => void; onDateChange: (date: string) => void }) {
  void onEditPeriod;
  const scheduledEvents = filter === "money" ? [] : [...new Map(events.filter((event) => eventOverlapsDate(event, date) && (filter === "all" || event.category === filter)).map((event) => [eventIdentity(event), event])).values()];
  const periodEvents = filter === "money" ? [] : dailyFixture.period.filter((item) => filter === "all" || item.category === filter).map((item, index) => periodFixtureEvent(item, date, settings?.weekStartsOn ?? 1, index));
  const dayEvents = [...periodEvents, ...scheduledEvents].sort((left, right) => (left.allDay ? "00:00" : left.startTime ?? "00:00").localeCompare(right.allDay ? "00:00" : right.startTime ?? "00:00"));
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
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
  const openRowAction = (rowId: string | null) => { setOpenRowId(rowId); if (rowId) setExpandedEventId(null); };
  const moneyEntries = calendarMoneyEntriesForDate(date, todayDateKey());
  const moneySummary = filter === "all" || filter === "money" ? calendarMoneySummaryForDate(date, todayDateKey()) : null;
  const isPeriod = (event: Event) => event.timingType === "period" || event.id.startsWith("period-fixture-");
 return <BottomSheet className="calendar-date-sheet" headerActions={<div aria-label="日付を移動" className="calendar-date-sheet__header-nav"><button aria-label="前の日" onClick={() => moveDate(-1)} type="button">‹</button><button aria-label="次の日" onClick={() => moveDate(1)} type="button">›</button></div>} open title={formatDate(date, true)} onClose={onClose}><div className="sheet-detail calendar-date-sheet__gesture" onClickCapture={(clickEvent) => { if (quickAddOpen && (!(clickEvent.target instanceof Element) || !clickEvent.target.closest(".calendar-date-sheet__quick-add"))) setQuickAddOpen(false); if (!suppressClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressClick.current = false; }} onPointerCancel={() => { gesture.current = null; }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}><div className="sheet-list">{filter === "money" ? moneyEntries.map((entry, index) => <div className="sheet-money-entry" key={`${entry.label}-${entry.amount}-${index}`}><span>{entry.label}</span><strong className={`sheet-money-summary--${entry.category}`}>{moneyAmountLabel(entry.amount)}</strong></div>) : null}{dayEvents.map((event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onActionsClose={() => openRowAction(null)} onActionsOpen={() => openRowAction(identity)} onEdit={() => isPeriod(event) ? onEditEvent(event) : onEditEvent(event)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} showTimeInDetail={false} />; })}{dayEvents.length === 0 && filter !== "money" ? <p className="empty-state">予定はありません</p> : null}</div>{moneySummary ? <div className="sheet-money-summary"><span>収支</span><strong className={`sheet-money-summary--${moneySummary.category}`}>{moneyAmountLabel(moneySummary.amount)}円</strong></div> : null}<div className="sheet-footer"><Button onClick={onOpenDaily} variant="secondary">1日の詳細を見る</Button><div className="calendar-date-sheet__quick-add">{quickAddOpen ? <div aria-label="この日に追加" className="calendar-date-sheet__quick-add-menu" role="menu"><button onClick={() => chooseAdd("home")} role="menuitem" type="button">家</button><button onClick={() => chooseAdd("work")} role="menuitem" type="button">仕事</button><button onClick={() => chooseAdd("money")} role="menuitem" type="button">お金</button></div> : null}<button aria-expanded={quickAddOpen} aria-label="当日に追加" className="sheet-add-button calendar-date-sheet__quick-add-toggle" onClick={() => setQuickAddOpen((open) => !open)} type="button"><NavIcon name="add" /></button></div></div></div></BottomSheet>;
}

function DailyEventDetail({ event, showTime = true }: { event: Event; showTime?: boolean }) {
  const dateRange = event.timingType === "period" && event.periodStartDate && event.periodEndDate ? formatDateRange(event.periodStartDate, event.periodEndDate) : event.startDate && event.endDate ? formatDateRange(event.startDate, event.endDate) : "期間";
  const dateTime = `${dateRange} ${eventTimeLabel(event)}`;
  const dateOnly = dateRange;
  return <div className="event-inline-detail" id={`daily-event-detail-${eventIdentity(event)}`}><p>{showTime ? dateTime : dateOnly}</p>{event.place ? <p>{event.place}</p> : null}{event.memo ? <p>{event.memo}</p> : null}</div>;
}

function DailyEventRow({ event, expanded, onToggle, actionsOpen, onActionsOpen, onActionsClose, onEdit, onOtherRowTouch, showTimeInDetail = true }: { event: Event; expanded: boolean; onToggle: () => void; actionsOpen: boolean; onActionsOpen: () => void; onActionsClose: () => void; onEdit: () => void; onOtherRowTouch: () => void; showTimeInDetail?: boolean }) {
  const actionWidth = 80; const [offset, setOffset] = useState(actionsOpen ? -actionWidth : 0); const [dragging, setDragging] = useState(false); const start = useRef<{ x: number; y: number } | null>(null); const vertical = useRef(false); const horizontal = useRef(false); const suppressClick = useRef(false);
  const move = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (!start.current || vertical.current) return; const dx = pointerEvent.clientX - start.current.x; const dy = pointerEvent.clientY - start.current.y; if (!horizontal.current && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { vertical.current = true; setDragging(false); setOffset(actionsOpen ? -actionWidth : 0); return; } if (Math.abs(dx) > 8) horizontal.current = true; if (horizontal.current) { pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); setDragging(true); setOffset(Math.max(-actionWidth, Math.min(0, (actionsOpen ? -actionWidth : 0) + dx))); } };
  const end = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (!start.current) return; const dx = pointerEvent.clientX - start.current.x; const dy = pointerEvent.clientY - start.current.y; const wasVertical = vertical.current || Math.abs(dy) > Math.abs(dx); start.current = null; vertical.current = false; horizontal.current = false; setDragging(false); if (wasVertical) { suppressClick.current = true; setOffset(actionsOpen ? -actionWidth : 0); return; } if (-dx > 48) { suppressClick.current = true; onActionsOpen(); setOffset(-actionWidth); } else if (dx > 24 && actionsOpen) { suppressClick.current = true; onActionsClose(); setOffset(0); } else setOffset(actionsOpen ? -actionWidth : 0); };
  const clickCapture = (mouseEvent: ReactMouseEvent<HTMLElement>) => { if (!suppressClick.current) return; if (mouseEvent.target instanceof Element && mouseEvent.target.closest(".event-swipe-row__actions")) { suppressClick.current = false; return; } mouseEvent.preventDefault(); mouseEvent.stopPropagation(); suppressClick.current = false; };
  const displayOffset = dragging ? offset : actionsOpen ? -actionWidth : 0;
  return <article className={`event-swipe-row${expanded ? " is-expanded" : ""}${actionsOpen ? " is-actions-open" : ""}${dragging ? " is-dragging" : ""}`} onClickCapture={clickCapture} onPointerCancel={() => { start.current = null; vertical.current = false; horizontal.current = false; setDragging(false); setOffset(actionsOpen ? -actionWidth : 0); }} onPointerDown={(pointerEvent) => { onOtherRowTouch(); start.current = { x: pointerEvent.clientX, y: pointerEvent.clientY }; setDragging(false); }} onPointerMove={(pointerEvent) => { move(pointerEvent); }} onPointerUp={(pointerEvent) => { end(pointerEvent); }}>
    <div className="event-swipe-row__content" style={{ "--event-swipe-offset": `${displayOffset}px` } as CSSProperties}><button aria-controls={`daily-event-detail-${eventIdentity(event)}`} aria-expanded={expanded} className={`fixture-row fixture-row--${event.category} event-swipe-row__main${event.allDay ? " event-swipe-row__main--all-day" : ""}`} onClick={onToggle} type="button">{event.allDay ? null : <time>{event.startTime}〜{event.endTime}</time>}<span className="fixture-row__title">{event.title}</span></button></div>
    {actionsOpen ? <div aria-label={`${event.title}の操作メニュー`} className="event-swipe-row__actions"><button onClick={onEdit} onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()} type="button">編集</button></div> : null}
    {expanded ? <DailyEventDetail event={event} showTime={showTimeInDetail} /> : null}
  </article>;
}

function periodFixtureEvent(item: typeof dailyFixture.period[number], date: string, weekStartsOn: number, index: number): Event {
  const endDate = item.periodType === "week" ? weekEnd(date, weekStartsOn) : monthEnd(date);
  return { active: true, allDay: true, category: item.category as Event["category"], createdAt: "", deletedAt: null, endDate, endTime: null, id: `period-fixture-${item.periodType}-${date}-${index}`, memo: null, place: null, startDate: date, startTime: null, timingType: "scheduled", title: item.label, updatedAt: "", userId: "fixture", periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null };
}

function DailyShell({ date, events, filter, dailyNote, settings, onDateChange, onFilterChange, onEditEvent, onEditPeriod, onSaveNote }: { date: string; events: Event[]; filter: CalendarFilter; dailyNote: DailyNote | null; settings: UserSettings | null; onDateChange: (date: string) => void; onFilterChange: (filter: CalendarFilter) => void; onEditEvent: (event: Event) => void; onEditPeriod?: (label: string) => void; onSaveNote: (content: string) => Promise<DailyNote | null> }) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(dailyNote?.content ?? "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const showTimeline = filter !== "money";
  const showOverview = filter === "all";
  const dayEvents = events.filter((event) => eventOverlapsDate(event, date) && eventMatchesFilter(event, filter)).sort((left, right) => (left.allDay ? "00:00" : left.startTime ?? "00:00").localeCompare(right.allDay ? "00:00" : right.startTime ?? "00:00"));
  const periodEvents = dayEvents.filter((event) => event.timingType === "period");
  const allDay = dayEvents.filter((event) => event.timingType !== "period" && event.allDay);
  const timed = dayEvents.filter((event) => !event.allDay);
  const openRowAction = (rowId: string | null) => { setOpenRowId(rowId); if (rowId) setExpandedEventId(null); };
  const toggleEvent = (eventId: string) => { setOpenRowId(null); setExpandedEventId((current) => current === eventId ? null : eventId); };
  const eventRow = (event: Event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} onActionsOpen={() => openRowAction(identity)} onActionsClose={() => openRowAction(null)} onEdit={() => onEditEvent(event)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} />; };
  const saveNote = async () => { setNoteBusy(true); setNoteError(""); try { await onSaveNote(noteDraft); setNoteEditing(false); } catch (caught) { setNoteError(caught instanceof Error ? caught.message : "メモを保存できませんでした。"); } finally { setNoteBusy(false); } };
  const dailyGesture = useRef<{ axis: "pending" | "horizontal"; x: number; y: number } | null>(null);
  const suppressDailyClick = useRef(false);
  const dailyPointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return; if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".event-swipe-row")) return; dailyGesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressDailyClick.current = false; };
  const dailyPointerMove = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { dailyGesture.current = null; return; } current.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); } if (current.axis === "horizontal") pointerEvent.preventDefault(); };
  const dailyPointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "horizontal" && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) { suppressDailyClick.current = true; onDateChange(shiftDate(date, dx < 0 ? 1 : -1)); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } dailyGesture.current = null; };
    const periodRow = (item: typeof dailyFixture.period[number], index: number) => { const event = periodFixtureEvent(item, date, settings?.weekStartsOn ?? 1, index); const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onActionsClose={() => openRowAction(null)} onActionsOpen={() => openRowAction(identity)} onEdit={() => onEditPeriod?.(item.label)} onOtherRowTouch={() => { if (openRowId !== identity) openRowAction(null); }} onToggle={() => toggleEvent(identity)} actionsOpen={openRowId === identity} showTimeInDetail={false} />; };
  return <main className="screen-page daily-page" onClickCapture={(clickEvent) => { if (!suppressDailyClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressDailyClick.current = false; }} onPointerCancel={() => { dailyGesture.current = null; }} onPointerDown={dailyPointerDown} onPointerDownCapture={(pointerEvent) => { if (!openRowId) return; if (!(pointerEvent.target instanceof Element) || !pointerEvent.target.closest(".event-swipe-row")) openRowAction(null); }} onPointerMove={dailyPointerMove} onPointerUp={dailyPointerUp}><header className="screen-header"><h1>デイリー</h1><span className="daily-date-label">{formatDate(date)}</span><div className="daily-date-actions"><button aria-label="前の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, -1))} type="button">‹</button><button className="today-button" onClick={() => onDateChange(todayDateKey())} type="button">今日</button><button aria-label="次の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, 1))} type="button">›</button></div></header><FixtureTabs active={filter} onChange={onFilterChange} />{showTimeline ? <section className="timeline-section"><h2>予定</h2><div className="fixture-group"><h3>終日</h3>{allDay.map(eventRow)}</div><div className="fixture-group"><h3>期間</h3>{periodEvents.map(eventRow)}{dailyFixture.period.filter((item) => filter === "all" || item.category === filter).map(periodRow)}</div><div className="fixture-group"><h3>時間あり</h3>{timed.map(eventRow)}</div>{dayEvents.length === 0 ? <p className="empty-state">予定はありません</p> : null}</section> : null}{filter === "money" || showOverview ? <section className="daily-section"><h2>今日のお金</h2>{dailyFixture.money.map((item) => <div className="fixture-row" key={item.label}><span>{item.label}</span><strong>{item.amount}</strong></div>)}</section> : null}{showOverview ? <section className="daily-section daily-note-section"><h2>今日のメモ</h2>{noteEditing ? <div className="daily-note-editor"><textarea aria-label="今日のメモ" className="textarea" onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} /><div className="daily-note-actions"><Button disabled={noteBusy} onClick={() => { void saveNote(); }}>{noteBusy ? "保存中…" : "保存"}</Button><Button disabled={noteBusy} onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(false); }} variant="ghost">キャンセル</Button></div>{noteError ? <p className="form-error" role="alert">{noteError}</p> : null}</div> : <button aria-label="今日のメモを編集" className="daily-note-body" onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(true); }} type="button">{dailyNote?.content || "メモはありません"}</button>}</section> : null}</main>;
}

function EventDateSheet({ open, startDate, endDate, onClose, onChange }: { open: boolean; startDate: string; endDate: string; onClose: () => void; onChange: (start: string, end: string) => void }) { const [range, setRange] = useState(endDate !== startDate); const updateStart = (value: string) => onChange(value, range ? (endDate < value ? value : endDate) : value); return <BottomSheet open={open} title="日付" onClose={onClose}><div className="date-sheet-fields"><label className="input-field" htmlFor="event-start-date"><span>開始日</span><Input id="event-start-date" onChange={updateStart} type="date" value={startDate} /></label>{range ? <label className="input-field" htmlFor="event-end-date"><span>終了日</span><Input id="event-end-date" min={startDate} onChange={(value) => onChange(startDate, value)} type="date" value={endDate} /></label> : <Button onClick={() => { setRange(true); onChange(startDate, startDate); }} variant="secondary">終了日を追加</Button>}<Button onClick={onClose}>この日付にする</Button></div></BottomSheet>; }

function RecentEventSheet({ open, category, onClose, onSelect }: { open: boolean; category: Event["category"]; onClose: () => void; onSelect: (event: Event) => void }) { const [events, setEvents] = useState<Event[]>([]); const [error, setError] = useState(""); useEffect(() => { if (!open) return; void getRecentEventDefinitions().then(({ events: nextEvents }) => setEvents((nextEvents ?? []).filter((event) => event.category === category))).catch(() => setError("候補を読み込めませんでした。")); }, [category, open]); return <BottomSheet open={open} title="以前の項目から選ぶ" onClose={onClose}><div className="recent-list">{events.map((event) => <button className={`recent-event recent-event--${event.category}`} key={event.id} onClick={() => onSelect(event)} type="button"><span className="recent-event__marker" /><span><strong>{event.title}</strong><small>{event.allDay ? "終日" : eventTimeLabel(event)}{event.place ? ` · ${event.place}` : ""}</small></span><span className="form-row__chevron">›</span></button>)}{events.length === 0 && !error ? <p className="empty-state">最近の項目はありません</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div></BottomSheet>; }

function EventOptionSheet({ option, onClose, recurrence, startDate, timingType, periodWindowType, onTimingTypeChange, onPeriodWindowChange, onRecurrenceChange }: { option: "type" | "repeat" | "notification" | "period" | null; onClose: () => void; recurrence: RecurrenceRuleInput | null; startDate: string; timingType: Event["timingType"]; periodWindowType: Event["periodWindowType"]; onTimingTypeChange: (value: Event["timingType"]) => void; onPeriodWindowChange: (value: NonNullable<Event["periodWindowType"]>) => void; onRecurrenceChange: (value: RecurrenceRuleInput | null) => void }) {
  const titles = { type: "予定の種類", period: "実施時期", repeat: "繰り返し", notification: "通知" };
  const [customOpen, setCustomOpen] = useState(false);
  const [endOptionOpen, setEndOptionOpen] = useState(false);
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
  </> : <button aria-label={`${option ? titles[option] : ""}を閉じる`} className="event-option-sheet__option" onClick={onClose} type="button"><span>通知はM6では設定しません。</span><span aria-hidden="true">✓</span></button>}</div></BottomSheet>;
}

function ScopeSheet({ open, action, onClose, onSelect }: { open: boolean; action: "edit" | "delete"; onClose: () => void; onSelect: (scope: EventScope) => void }) { const title = action === "edit" ? "編集する範囲" : "削除する範囲"; const options: Array<{ scope: EventScope; label: string }> = [{ scope: "occurrence", label: "この予定のみ" }, { scope: "following", label: "この予定以降" }, { scope: "series", label: "すべての予定" }]; return <BottomSheet open={open} title={title} onClose={onClose}><div className="event-option-sheet">{options.map((option) => <button className="event-option-sheet__option" key={option.scope} onClick={() => onSelect(option.scope)} type="button"><span>{option.label}</span><span aria-hidden="true">›</span></button>)}</div></BottomSheet>; }

const periodWindowLabel = (value: Event["periodWindowType"]) => value === "this_week" ? "今週中" : value === "this_month" ? "今月中" : "日付範囲を指定";
function EventForm({ category, initialDate, event, scope = "series", onCancel, onSaved, onDelete }: { category: Event["category"]; initialDate: string; event?: Event; scope?: EventScope; onCancel: () => void; onSaved: (event: Event) => void; onDelete?: () => void }) {
  const baseStartDate = scope === "series" && event?.recurrence ? event.recurrence.startsOn : event?.startDate ?? event?.periodAnchorDate ?? event?.periodStartDate ?? initialDate;
  const baseEndDate = scope === "series" && event?.recurrence && event?.startDate && event?.endDate ? shiftDate(baseStartDate, dateDifference(event.startDate, event.endDate)) : event?.endDate ?? initialDate;
  const [title, setTitle] = useState(event?.title ?? "");
  const [timingType, setTimingType] = useState<Event["timingType"]>(event?.timingType ?? "scheduled");
  const [startDate, setStartDate] = useState(baseStartDate);
  const [endDate, setEndDate] = useState(baseEndDate);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startTime, setStartTime] = useState(event?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "10:00");
  const [periodWindowType, setPeriodWindowType] = useState<Event["periodWindowType"]>(event?.periodWindowType ?? "this_week");
  const [periodAnchorDate, setPeriodAnchorDate] = useState(scope === "series" && event?.recurrence ? event.recurrence.startsOn : event?.periodAnchorDate ?? initialDate);
  const [periodStartDate, setPeriodStartDate] = useState(event?.periodStartDate ?? initialDate);
  const [periodEndDate, setPeriodEndDate] = useState(event?.periodEndDate ?? initialDate);
  const [place, setPlace] = useState(event?.place ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceRuleInput | null>(event?.recurrence ? { frequency: event.recurrence.frequency, interval: event.recurrence.interval, weekdays: event.recurrence.weekdays, dayOfMonth: event.recurrence.dayOfMonth, startsOn: event.recurrence.startsOn, endsOn: event.recurrence.endsOn } : null);
  const [dateOpen, setDateOpen] = useState(false);
  const [periodDateOpen, setPeriodDateOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [optionOpen, setOptionOpen] = useState<"type" | "repeat" | "notification" | "period" | null>(null);
  const [placeOpen, setPlaceOpen] = useState(Boolean(event?.place));
  const [memoOpen, setMemoOpen] = useState(Boolean(event?.memo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setType = (value: Event["timingType"]) => { setTimingType(value); if (value === "period") { setPeriodAnchorDate(event?.periodAnchorDate ?? initialDate); setPeriodWindowType(event?.periodWindowType ?? "this_week"); } };
  const setWindow = (value: NonNullable<Event["periodWindowType"]>) => { setPeriodWindowType(value); if (value === "custom_range") { setPeriodAnchorDate(""); setPeriodStartDate(periodStartDate || initialDate); setPeriodEndDate(periodEndDate || periodStartDate || initialDate); setRecurrence(null); } else { setPeriodAnchorDate(periodAnchorDate || initialDate); setPeriodStartDate(""); setPeriodEndDate(""); } };
  const periodRecurrenceAllowed = timingType === "scheduled" || periodWindowType !== "custom_range";
  const savedInput: EventCommandInput = timingType === "period"
    ? { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType, periodAnchorDate: periodWindowType === "custom_range" ? null : periodAnchorDate, periodStartDate: periodWindowType === "custom_range" ? periodStartDate : null, periodEndDate: periodWindowType === "custom_range" ? periodEndDate : null, deadlineTime: null, recurrence: scope === "occurrence" ? undefined : periodRecurrenceAllowed ? recurrence ? { ...recurrence, startsOn: periodAnchorDate } : null : null }
    : { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "scheduled", allDay, startDate, startTime: allDay ? null : startTime, endDate, endTime: allDay ? null : endTime, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, recurrence: scope === "occurrence" ? undefined : recurrence ? { ...recurrence, startsOn: startDate } : null };
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => { formEvent.preventDefault(); setError(""); setBusy(true); try { const result = event ? await updateEvent(event.id, { ...savedInput, scope, occurrenceKey: event.occurrenceKey ?? undefined }) : await createEvent(savedInput); onSaved(result.event); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  const applyRecent = (recent: Event) => { setTitle(recent.title); setTimingType(recent.timingType); setAllDay(recent.allDay ?? false); setStartTime(recent.startTime ?? "09:00"); setEndTime(recent.endTime ?? "10:00"); setPeriodWindowType(recent.timingType === "period" ? recent.periodWindowType ?? "this_week" : "this_week"); setPeriodAnchorDate(recent.timingType === "period" && recent.periodWindowType !== "custom_range" ? initialDate : ""); setPeriodStartDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setPeriodEndDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setPlace(recent.place ?? ""); setMemo(recent.memo ?? ""); setRecurrence(recent.recurrence && !(recent.timingType === "period" && recent.periodWindowType === "custom_range") ? { frequency: recent.recurrence.frequency, interval: recent.recurrence.interval, weekdays: recent.recurrence.weekdays, dayOfMonth: recent.recurrence.dayOfMonth, startsOn: initialDate, endsOn: recent.recurrence.endsOn } : null); setPlaceOpen(Boolean(recent.place)); setMemoOpen(Boolean(recent.memo)); setRecentOpen(false); };
  return <main className="screen-page event-form-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" onClick={onCancel} type="button">‹</button><h1>{event ? "予定を編集" : "予定を追加"}</h1><span className={`event-category-label event-category-label--${category}`}><span className="event-category-label__dot" />{categoryLabel[category]}の予定</span></header><form className="event-form" onSubmit={(formEvent) => { void submit(formEvent); }}><button aria-label="以前の項目から選ぶ" className="recent-entry-button" onClick={() => setRecentOpen(true)} type="button">以前の項目から選ぶ <span aria-hidden="true">›</span></button><label className="input-field event-title-field" htmlFor="event-title"><span>タイトル</span><Input id="event-title" onChange={setTitle} required value={title} /></label><section className="event-form-section"><h2>予定の種類</h2><FormRow ariaLabel="予定の種類" label="予定の種類" onClick={() => setOptionOpen("type")} summary={timingType === "period" ? "期間中にやりたい" : "日時が決まっている"} /></section>{timingType === "scheduled" ? <><section className="event-form-section"><h2>日時</h2><FormRow label="日付" onClick={() => setDateOpen(true)} summary={formatDateRange(startDate, endDate)} /><label className="event-toggle-row"><span>終日</span><input checked={allDay} onChange={(inputEvent) => setAllDay(inputEvent.target.checked)} type="checkbox" /><span className="event-toggle-value">{allDay ? "ON" : "OFF"}</span></label>{!allDay ? <div className="event-time-fields"><label className="input-field" htmlFor="event-start-time"><span>開始時間</span><Input id="event-start-time" onChange={setStartTime} required type="time" value={startTime} /></label><span aria-hidden="true">〜</span><label className="input-field" htmlFor="event-end-time"><span>終了時間</span><Input id="event-end-time" onChange={setEndTime} required type="time" value={endTime} /></label></div> : null}</section></> : <section className="event-form-section"><h2>実施時期</h2><FormRow ariaLabel="実施時期" label="実施時期" onClick={() => setOptionOpen("period")} summary={periodWindowLabel(periodWindowType)} />{periodWindowType === "custom_range" ? <><FormRow label="開始日" onClick={() => setPeriodDateOpen(true)} summary={formatDate(periodStartDate)} /><FormRow label="終了日" onClick={() => setPeriodDateOpen(true)} summary={formatDate(periodEndDate)} /></> : null}</section>}{periodRecurrenceAllowed ? <section className="event-form-section"><h2>繰り返し</h2><FormRow ariaLabel="繰り返し" label="繰り返し" onClick={() => setOptionOpen("repeat")} summary={recurrenceSummary(recurrence, timingType === "period" ? periodAnchorDate : startDate)} /></section> : null}<section className="event-form-section"><h2>通知</h2><FormRow ariaLabel="通知" label="通知" onClick={() => setOptionOpen("notification")} summary="なし" /></section><section className="event-form-section"><h2>場所</h2>{placeOpen ? <label className="input-field expanded-input" htmlFor="event-place"><span>場所</span><Input id="event-place" onChange={setPlace} value={place} /></label> : <FormRow label="場所を追加" onClick={() => setPlaceOpen(true)} summary="追加" />}</section><section className="event-form-section"><h2>メモ</h2>{memoOpen ? <label className="input-field expanded-input" htmlFor="event-memo"><span>メモ</span><textarea className="textarea" id="event-memo" onChange={(inputEvent) => setMemo(inputEvent.target.value)} value={memo} /></label> : <FormRow label="メモを追加" onClick={() => setMemoOpen(true)} summary="追加" />}</section>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "保存中…" : event ? "変更を保存" : "登録"}</Button>{event && onDelete ? <Button onClick={onDelete} variant="secondary">削除</Button> : null}</form><EventDateSheet endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} onClose={() => setDateOpen(false)} open={dateOpen} startDate={startDate} /><EventDateSheet endDate={periodEndDate} onChange={(start, end) => { setPeriodStartDate(start); setPeriodEndDate(end); }} onClose={() => setPeriodDateOpen(false)} open={periodDateOpen} startDate={periodStartDate} /><RecentEventSheet category={category} onClose={() => setRecentOpen(false)} onSelect={applyRecent} open={recentOpen} /><EventOptionSheet onClose={() => setOptionOpen(null)} onPeriodWindowChange={setWindow} onRecurrenceChange={setRecurrence} onTimingTypeChange={setType} option={optionOpen} periodWindowType={periodWindowType} recurrence={recurrence} startDate={timingType === "period" ? periodAnchorDate : startDate} timingType={timingType} /></main>;
}

function EventDetailPage({ event, onBack, onEdit, onDelete }: { event: Event; onBack: () => void; onEdit: () => void; onDelete: () => void }) { const displayStart = event.timingType === "period" ? event.periodStartDate : event.startDate; const displayEnd = event.timingType === "period" ? event.periodEndDate : event.endDate; return <main className="screen-page event-detail-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>予定の詳細</h1><span className={`event-category-label event-category-label--${event.category}`}><span className="event-category-label__dot" />{categoryLabel[event.category]}</span></header><section className="event-detail"><h2>{event.title}</h2><dl className="event-detail-list"><div><dt>カテゴリ</dt><dd>{categoryLabel[event.category]}</dd></div><div><dt>{event.timingType === "period" ? "対象期間" : "日付"}</dt><dd>{displayStart && displayEnd ? formatDateRange(displayStart, displayEnd) : "—"}</dd></div><div><dt>時間</dt><dd>{eventTimeLabel(event)}</dd></div>{event.place ? <div><dt>場所</dt><dd>{event.place}</dd></div> : null}{event.memo ? <div><dt>メモ</dt><dd className="event-detail-memo">{event.memo}</dd></div> : null}</dl><div className="event-detail-actions"><Button onClick={onEdit}>編集</Button><Button onClick={onDelete} variant="secondary">削除</Button></div></section></main>; }
function DeleteConfirmSheet({ open, title, onClose, onConfirm, busy }: { open: boolean; title: string; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <BottomSheet open={open} title="予定を削除" onClose={onClose}><div className="delete-confirm"><p>「{title}」を削除しますか？</p><p className="delete-confirm__note">削除した予定は一覧から表示されなくなります。</p><Button disabled={busy} onClick={onConfirm} variant="secondary">{busy ? "削除中…" : "削除する"}</Button><Button disabled={busy} onClick={onClose} variant="ghost">キャンセル</Button></div></BottomSheet>; }

const weekDayLabel = (value: number) => ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][value] ?? "月曜日";
function SettingsDetailPage({ detail, user, settings, onBack, onLogout }: { detail: SettingsDetail; user: AuthUser; settings: UserSettings | null; onBack: () => void; onLogout: () => void }) { const titles: Record<SettingsDetail, string> = { account: "アカウント", notifications: "通知", calendar: "カレンダー", money: "お金", data: "データ / バックアップ" }; const body = detail === "account" ? <><FormRow label="メール" summary={user.email} /><Button onClick={onLogout} variant="secondary">ログアウト</Button></> : detail === "notifications" ? <><FormRow label="朝のまとめ通知" summary="ON · 09:00" /><FormRow label="夜のまとめ通知" summary="ON · 21:00" /><FormRow label="通知テンプレート" summary="標準" /></> : detail === "calendar" ? <><FormRow label="タイムゾーン" summary={settings?.timezone ?? "Asia/Tokyo"} /><FormRow label="週の開始" summary={settings ? weekDayLabel(settings.weekStartsOn) : "月曜日"} /></> : detail === "money" ? <><FormRow label="支出カテゴリ" summary="食費・日用品・固定費" /><FormRow label="収入カテゴリ" summary="給料・臨時収入" /></> : <><FormRow label="バックアップ" summary="JSON" /><FormRow label="ローカルアーカイブ" summary="確認" /></>; return <main className="screen-page settings-page"><header className="screen-header"><button aria-label="設定へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>{titles[detail]}</h1><span className="header-spacer" /></header><section className="settings-detail-list">{body}</section></main>; }
function SettingsShell({ user, settings, detail, onOpenDetail, onBack, onLogout }: { user: AuthUser; settings: UserSettings | null; detail: SettingsDetail | null; onOpenDetail: (detail: SettingsDetail) => void; onBack: () => void; onLogout: () => void }) { if (detail) return <SettingsDetailPage detail={detail} onBack={onBack} onLogout={onLogout} settings={settings} user={user} />; return <main className="screen-page settings-page"><header className="screen-header"><h1>設定</h1></header><section className="settings-root-list"><FormRow ariaLabel="アカウントを開く" label="アカウント" onClick={() => onOpenDetail("account")} /><FormRow ariaLabel="通知を開く" label="通知" onClick={() => onOpenDetail("notifications")} /><FormRow ariaLabel="カレンダーを開く" label="カレンダー" onClick={() => onOpenDetail("calendar")} /><FormRow ariaLabel="お金を開く" label="お金" onClick={() => onOpenDetail("money")} /><FormRow ariaLabel="データとバックアップを開く" label="データ / バックアップ" onClick={() => onOpenDetail("data")} /></section></main>; }
function AddChoiceSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (choice: AddChoice) => void }) { return <BottomSheet open={open} onClose={onClose} title="追加"><div className="choice-list"><FormRow ariaLabel="家を追加" label="家" onClick={() => onSelect("家")} /><FormRow ariaLabel="仕事を追加" label="仕事" onClick={() => onSelect("仕事")} /><FormRow ariaLabel="お金を追加" label="お金" onClick={() => onSelect("お金")} /></div></BottomSheet>; }

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null); const [settings, setSettings] = useState<UserSettings | null>(null); const [authChecked, setAuthChecked] = useState(false); const [authError, setAuthError] = useState(""); const [screen, setScreen] = useState<Screen>(screenFromPath); const [settingsDetail, setSettingsDetail] = useState<SettingsDetail | null>(null); const [events, setEvents] = useState<Event[]>([]); const [dailyNote, setDailyNote] = useState<DailyNote | null>(null); const [month, setMonth] = useState(monthStart(todayDateKey())); const [dailyDate, setDailyDate] = useState(todayDateKey()); const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>("all"); const [dailyFilter, setDailyFilter] = useState<CalendarFilter>("all"); const [selectedDate, setSelectedDate] = useState<string | null>(null); const [dateSheetOpen, setDateSheetOpen] = useState(false); const [addOpen, setAddOpen] = useState(false); const [pendingAddContext, setPendingAddContext] = useState<ReturnContext | null>(null); const [formState, setFormState] = useState<{ category: Event["category"]; initialDate: string; event?: Event; returnTo: ReturnContext; scope?: EventScope } | null>(null); const [detailState, setDetailState] = useState<{ event: Event; returnTo: ReturnContext } | null>(null); const [scopeState, setScopeState] = useState<{ event: Event; returnTo: ReturnContext; action: "edit" | "delete" } | null>(null); const [deleteTarget, setDeleteTarget] = useState<{ event: Event; returnTo: ReturnContext; scope: EventScope } | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [deleteBusy, setDeleteBusy] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [selectionNote, setSelectionNote] = useState("");
  useEffect(() => { let active = true; void authMe().then(async ({ user: authenticatedUser }) => { if (!active) return; setUser(authenticatedUser); const result = await getSettings().catch(() => null); if (active && result) setSettings(result.settings); }).catch((error: unknown) => { if (active && apiErrorStatus(error) !== 401) setAuthError("ログイン状態を確認できませんでした。"); }).finally(() => { if (active) setAuthChecked(true); }); const onPopState = () => setScreen(screenFromPath()); window.addEventListener("popstate", onPopState); return () => { active = false; window.removeEventListener("popstate", onPopState); }; }, []);
  useEffect(() => { if (!user || screen !== "calendar") return; void getCalendar(month).then(({ events: nextEvents }) => setEvents(nextEvents ?? [])).catch(() => setEvents([])); }, [month, screen, user]);
  useEffect(() => { if (!user || screen !== "daily") return; void getDaily(dailyDate).then(({ events: nextEvents, dailyNote: nextNote }) => { setEvents(nextEvents ?? []); setDailyNote(nextNote ?? null); }).catch(() => { setEvents([]); setDailyNote(null); }); }, [dailyDate, screen, user]);
  const navigate = (nextScreen: Screen) => { window.history.pushState({}, "", screenPath[nextScreen]); setScreen(nextScreen); setSettingsDetail(null); setSelectedDate(null); setDateSheetOpen(false); setFormState(null); setDetailState(null); };
  const handleAuthenticated = (authenticatedUser: AuthUser) => { setUser(authenticatedUser); setAuthError(""); void getSettings().then(({ settings: nextSettings }) => setSettings(nextSettings)).catch(() => undefined); };
  const handleLogout = () => { void logout().finally(() => { setUser(null); setSettings(null); setEvents([]); setSettingsDetail(null); setScreen("calendar"); window.history.pushState({}, "", "/calendar"); }); };
  const returnContext = (): ReturnContext => screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter };
  const openAdd = (category: Event["category"], context = pendingAddContext ?? returnContext()) => { setPendingAddContext(null); setSelectedDate(context.screen === "calendar" ? context.date : null); setAddOpen(false); setSelectionNote(""); window.setTimeout(() => setFormState({ category, initialDate: context.date, returnTo: context }), 0); };
  const handleAddSelect = (choice: AddChoice) => { const context = pendingAddContext ?? returnContext(); if (choice === "お金") { setPendingAddContext(null); setAddOpen(false); setSelectionNote("お金の登録は後のMilestoneで追加します。"); return; } openAdd(choice === "家" ? "home" : "work", context); };
  const restore = (context: ReturnContext) => { setScreen(context.screen); setDateSheetOpen(false); if (context.screen === "calendar") { setCalendarFilter(context.filter); setSelectedDate(context.date); setMonth(monthStart(context.date)); } else { setDailyFilter(context.filter); setDailyDate(context.date); } };
  const openDaily = (date: string, filter: CalendarFilter) => { setSelectedDate(null); setDateSheetOpen(false); setDailyFilter(filter); setDailyDate(date); setScreen("daily"); window.history.pushState({}, "", screenPath.daily); };
  const closeForm = () => { const context = formState?.returnTo; setFormState(null); if (context) restore(context); };
  const handleNoteSaved = async (content: string) => { const result = await upsertDailyNote(dailyDate, content); setDailyNote(result.dailyNote); return result.dailyNote; };
  const closeDetail = () => { const context = detailState?.returnTo; setDetailState(null); if (context) restore(context); };
  const openEventEdit = (event: Event, returnTo: ReturnContext) => { if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "edit" }); return; } setDetailState(null); setFormState({ category: event.category, event, initialDate: event.startDate ?? event.periodAnchorDate ?? event.periodStartDate ?? returnTo.date, returnTo, scope: "series" }); };
  const editEvent = () => { if (!detailState) return; openEventEdit(detailState.event, detailState.returnTo); };
  const requestDelete = (event: Event, returnTo: ReturnContext) => { if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "delete" }); return; } setDeleteTarget({ event, returnTo, scope: "series" }); setFormState(null); setDeleteOpen(true); };
  const refreshProjection = async (context: ReturnContext) => { if (context.screen === "calendar") { const result = await getCalendar(monthStart(context.date)).catch(() => null); if (result) setEvents(result.events ?? []); } else { const result = await getDaily(context.date).catch(() => null); if (result) { setEvents(result.events ?? []); setDailyNote(result.dailyNote ?? null); } } };
  const handleScopeSelect = (scope: EventScope) => { const target = scopeState; if (!target) return; setScopeState(null); if (target.action === "edit") { setDetailState(null); setFormState({ category: target.event.category, event: target.event, initialDate: target.event.startDate ?? target.event.periodAnchorDate ?? target.event.periodStartDate ?? target.returnTo.date, returnTo: target.returnTo, scope }); } else { setDeleteTarget({ event: target.event, returnTo: target.returnTo, scope }); setDeleteOpen(true); } };
  const handleSaved = (event: Event) => { setEvents((current) => [...current.filter((item) => event.occurrenceKey ? eventIdentity(item) !== event.occurrenceKey : item.id !== event.id), event]); const context = formState?.returnTo; setFormState(null); if (context) { restore(context); void refreshProjection(context); } };
  const confirmDelete = async () => { const target = deleteTarget; if (!target) return; setDeleteBusy(true); try { await deleteEvent(target.event.id, target.scope, target.event.occurrenceKey ?? undefined); setEvents((current) => target.scope === "occurrence" ? current.filter((event) => eventIdentity(event) !== target.event.occurrenceKey) : current.filter((event) => event.id !== target.event.id)); setDeleteOpen(false); setDeleteTarget(null); setDetailState(null); restore(target.returnTo); void refreshProjection(target.returnTo); } catch (caught) { setSelectionNote(caught instanceof Error ? caught.message : "削除できませんでした。"); } finally { setDeleteBusy(false); } };
  if (!authChecked) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><p className="empty-state">読み込み中</p></main></div>;
  if (!user) return <><LoginPage onAuthenticated={handleAuthenticated} />{authError ? <p className="auth-global-error" role="alert">{authError}</p> : null}</>;
  const content = formState ? <EventForm category={formState.category} event={formState.event} initialDate={formState.initialDate} onCancel={closeForm} onDelete={formState.event ? () => requestDelete(formState.event as Event, formState.returnTo) : undefined} onSaved={handleSaved} scope={formState.scope} /> : detailState ? <EventDetailPage event={detailState.event} onBack={closeDetail} onDelete={() => requestDelete(detailState.event, detailState.returnTo)} onEdit={editEvent} /> : screen === "calendar" ? <CalendarShell events={events} filter={calendarFilter} month={month} onDateSelect={(date, filter) => { setCalendarFilter(filter); setSelectedDate(date); setDateSheetOpen(true); }} onFilterChange={setCalendarFilter} onMonthChange={setMonth} onSearch={() => setSearchOpen(true)} /> : screen === "daily" ? <DailyShell key={dailyDate} date={dailyDate} dailyNote={dailyNote} events={events} filter={dailyFilter} onDateChange={(nextDate) => { setMonth(monthStart(nextDate)); setDailyDate(nextDate); }} onFilterChange={setDailyFilter} onEditEvent={(event) => openEventEdit(event, { screen: "daily", date: dailyDate, filter: dailyFilter })} onEditPeriod={(label) => setSelectionNote(`${label}の編集はM4の期間予定表示に対応しています。`)} onSaveNote={handleNoteSaved} settings={settings} /> : screen === "money" ? <main className="screen-page money-page"><header className="screen-header"><h1>お金</h1></header><p className="empty-state">お金の登録は後のMilestoneで追加します。</p></main> : <SettingsShell detail={settingsDetail} onBack={() => setSettingsDetail(null)} onLogout={handleLogout} onOpenDetail={setSettingsDetail} settings={settings} user={user} />;
  return <MobileShell activeNavigation={formState || detailState || deleteOpen ? undefined : screen} onAdd={() => { const context: ReturnContext = screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter }; setPendingAddContext(context); setSelectedDate(null); setDateSheetOpen(false); setAddOpen(true); }} onNavigate={navigate} showBottomNavigation={!formState && !detailState && !deleteOpen}>{content}{selectionNote ? <p className="selection-note" role="status">{selectionNote}</p> : null}{selectedDate && dateSheetOpen && !formState && !detailState ? <CalendarDateSheet date={selectedDate} events={events} filter={calendarFilter} onAddCategory={(category) => { setDateSheetOpen(false); openAdd(category, { screen: "calendar", date: selectedDate, filter: calendarFilter }); }} onAddMoney={() => setSelectionNote("お金の登録は後のMilestoneで追加します。")} onClose={() => setDateSheetOpen(false)} onDateChange={(nextDate) => { setSelectedDate(nextDate); setMonth(monthStart(nextDate)); }} onEditEvent={(event) => openEventEdit(event, { screen: "calendar", date: selectedDate, filter: calendarFilter })} onOpenDaily={() => openDaily(selectedDate, calendarFilter)} settings={settings} /> : null}<AddChoiceSheet onClose={() => { setPendingAddContext(null); setAddOpen(false); }} onSelect={handleAddSelect} open={addOpen} /><ScopeSheet action={scopeState?.action ?? "edit"} onClose={() => setScopeState(null)} onSelect={handleScopeSelect} open={Boolean(scopeState)} /><DeleteConfirmSheet busy={deleteBusy} onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }} onConfirm={() => { void confirmDelete(); }} open={deleteOpen} title={deleteTarget?.event.title ?? "予定"} />{searchOpen ? <BottomSheet open title="検索" onClose={() => setSearchOpen(false)}><p className="empty-state">検索は後のMilestoneで追加します。</p></BottomSheet> : null}</MobileShell>;
}
