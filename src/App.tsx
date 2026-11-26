import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  apiErrorStatus, authMe, confirmArchive, confirmPasswordReset, createEvent, createMoney, createMoneyCategory, deleteEvent, deleteMoney, deleteMoneyActual, deleteMoneyCategory, getArchiveCandidates, getCalendar, getDaily, getEventReuseCandidates, getMoneyCategories, getMoneyMonth, getMoneyReuseCandidates, getMoneyYear, getSettings, login, logout, putMoneyActual, register, requestPasswordReset, searchCalendarEvents, updateEvent, updateMoney, updateMoneyCategory, updateSettings, upsertDailyNote,
  type AuthUser, type CalendarSearchResult, type DailyNote, type Event, type EventCommandInput, type EventScope, type LastUsedNotificationPreference, type MoneyCategory, type MoneyItem, type MoneyProjection, type MoneyType, type MoneyYearProjection, type RecurrenceRuleInput, type UserSettings
} from "./api/client";
import { BottomSheet, Button, DateInput, FormRow, Input, MobileShell, NavIcon, TimeInput } from "./components/ui";
import { SwipeActionRow } from "./components/SwipeActionRow";
import { GuidePage } from "./pages/GuidePage";
import { AccountSettings, PasswordChangeSettings } from "./components/AccountSettings";
import { NotificationOffsetPicker, NotificationSettingsSection } from "./components/NotificationSettings";
import { getNotificationTemplates } from "./api/notifications";
import type { NotificationTemplate } from "./worker/types";
import { defaultEndTimeForStart } from "./lib/event-time";
import { MONEY_CATEGORY_COLOR_KEYS, moneyCategoryColor, moneyCategoryColorKey, nextMoneyCategoryColorKey } from "./lib/money-category-colors";
import { ARCHIVE_SCHEMA_VERSION, archiveRecordCount, type ArchiveCandidateResponse, type ArchiveMetadata, type ArchiveRecord } from "./lib/archive";
import { archiveDailyNoteForDate, archiveEventsForRange, archiveMoneyForRange, archiveSearchEvents, mergeMoneyProjections, mergeProjectedEvents } from "./lib/archive-projection";
import { ArchiveStorageError, getArchiveMetadata, getArchiveRows, saveArchiveBundle, updateArchiveStatus } from "./lib/archive-storage";
import { runArchiveBatch } from "./lib/archive-runner";
import { BackupSettings, MigrationScreen } from "./components/BackupSettings";
import { getUserState } from "./api/client";
import { allocateCalendarCellRows, calendarMoneyEntriesForDate, calendarMoneySummaryForDate, formatDate, formatDateRange, moneyAverageDivisorFor, moneyCategoryGroupsFor, recurrenceAfterBaseDateChange, recurrenceSummary, type CalendarBandSegment, type CalendarMoneyItem, type CalendarProjectedEvent, type MoneyChartMode, type MoneyCategoryGroup } from "./lib/app-view-helpers";
import { notificationSummary } from "./lib/notification-labels";
import { clearLastAuthUser, readLastAuthSnapshotContext, readLastAuthUser, saveLastAuthSnapshotContext, saveLastAuthUser } from "./lib/offline-session";
import { emptyNotificationPreference } from "./lib/notification-preferences";
import {
  calendarSnapshotKey,
  clearActiveSnapshotsForUser,
  clearMemoryActiveSnapshots,
  dailySnapshotKey,
  getActiveSnapshotSavedAt,
  getActiveSnapshotEpoch,
  invalidateActiveSnapshotEpoch,
  isCalendarSnapshotData,
  isDailySnapshotData,
  isMoneySnapshotData,
  moneySnapshotKey,
  readActiveSnapshotMetadata,
  readMemoryActiveSnapshot,
  readPersistentActiveSnapshot,
  writeActiveSnapshotMetadata,
  writeServerConfirmedActiveSnapshot,
  type CalendarSnapshotData,
  type DailySnapshotData,
  type MoneySnapshotIdentity
} from "./cache/active-snapshot";

type Screen = "calendar" | "calendar-search" | "daily" | "money" | "money-analysis" | "settings";
type AddChoice = "家" | "仕事" | "お金";
type CalendarFilter = "all" | "home" | "work" | "money";
type SettingsDetail = "account" | "password" | "notifications" | "calendar" | "money" | "data" | "guide";
type ReturnContext = { screen: "calendar" | "daily"; date: string; filter: CalendarFilter };
type MoneyReturnContext = ReturnContext | { screen: "money"; month: string };
type DataLoadState = "loading" | "success" | "refreshing" | "error";
function DataStateMessage({ state, onRetry }: { state: DataLoadState; onRetry: () => void }) {
  if (state === "loading") return <p className="empty-state" role="status">読み込み中…</p>;
  if (state === "error") return <div className="data-error"><p className="form-error" role="alert">読み込めませんでした。</p><Button onClick={onRetry} variant="secondary">再試行</Button></div>;
  return null;
}
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const SNAPSHOT_PREFETCH_TTL_MS = 5 * 60 * 1000;
const CALENDAR_PREFETCH_TTL_MS = SNAPSHOT_PREFETCH_TTL_MS;
const MONEY_PREFETCH_TTL_MS = SNAPSHOT_PREFETCH_TTL_MS;
type CalendarPrefetchEntry = { phase: "scheduled" | "in-flight"; completedAt?: number; controller?: AbortController };
type MoneyPrefetchEntry = { phase: "scheduled" | "in-flight"; completedAt?: number; controller?: AbortController };
const scheduleBackgroundWork = (work: () => void) => {
  const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(work, { timeout: 500 });
    return;
  }
  window.setTimeout(work, 0);
};

const settingsDetailFromPath = (): SettingsDetail | null => {
  const detail = window.location.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  if (detail === "account" || detail === "password" || detail === "notifications" || detail === "notification" || detail === "calendar" || detail === "money" || detail === "data" || detail === "guide") return detail === "notification" ? "notifications" : detail;
  return null;
};
const screenFromPath = (): Screen => { const path = window.location.pathname; if (path === "/calendar/search") return "calendar-search"; if (path === "/daily") return "daily"; if (path === "/money/analysis") return "money-analysis"; if (path === "/money") return "money"; if (path === "/settings" || settingsDetailFromPath()) return "settings"; return "calendar"; };
const notificationDateFromPath = () => { const value = new URLSearchParams(window.location.search).get("date") ?? ""; return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; };
const screenPath: Record<Screen, string> = { calendar: "/calendar", "calendar-search": "/calendar/search", daily: "/daily", money: "/money", "money-analysis": "/money/analysis", settings: "/settings" };
const filterLabels: Record<CalendarFilter, string> = { all: "すべて", home: "家", work: "仕事", money: "お金" };
const categoryLabel: Record<Event["category"], string> = { home: "家", work: "仕事" };
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayDateKey = () => dateKey(new Date());
const dateFromKey = (value: string) => new Date(`${value}T00:00:00`);
const monthStart = (value: string) => { const date = dateFromKey(value); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`; };
const monthEnd = (value: string) => { const date = dateFromKey(value); return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)); };
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;
const eventUiIdentity = (event: Event) => event.timingType === "period" && event.occurrenceKey && event.startDate
  ? `${event.occurrenceKey}:${event.startDate}`
  : event.occurrenceKey ?? event.id;
const eventIdentity = eventUiIdentity;
const recurrenceWeekday = (date: string) => dateFromKey(date).getDay();
const formatMonth = (value: string) => { const date = dateFromKey(value); return `${date.getFullYear()}年${date.getMonth() + 1}月`; };
const shiftMonth = (value: string, amount: number) => { const date = dateFromKey(value); date.setMonth(date.getMonth() + amount, 1); return dateKey(date); };
const shiftDate = (value: string, amount: number) => { const date = dateFromKey(value); date.setDate(date.getDate() + amount); return dateKey(date); };
const dateDifference = (from: string, to: string) => Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86400000);
function useHorizontalSwipe(onSwipe: (direction: "previous" | "next") => void, shouldIgnore?: (target: EventTarget | null) => boolean) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ axis: "pending" | "horizontal" | "vertical"; x: number; y: number } | null>(null);
  const ignoredRowGesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    if (shouldIgnore?.(pointerEvent.target)) { ignoredRowGesture.current = pointerEvent.target instanceof Element && pointerEvent.target.closest(".tap-expand-row") ? { x: pointerEvent.clientX, y: pointerEvent.clientY } : null; return; }
    ignoredRowGesture.current = null;
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
      if (Math.abs(dx) <= Math.abs(dy) + 4) { current.axis = "vertical"; setDragging(false); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); return; }
      current.axis = "horizontal";
      setDragging(true);
    }
    if (current.axis === "horizontal") { pointerEvent.preventDefault(); setOffset(Math.max(-96, Math.min(96, dx))); }
  };
  const pointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    const ignored = ignoredRowGesture.current;
    if (ignored) { const dx = pointerEvent.clientX - ignored.x; const dy = pointerEvent.clientY - ignored.y; if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy)) suppressClick.current = true; ignoredRowGesture.current = null; return; }
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
  const pointerCancel = () => { gesture.current = null; ignoredRowGesture.current = null; setDragging(false); setOffset(0); };
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
const eventMatchesFilter = (event: Event, filter: CalendarFilter) => filter === "all" || filter === event.category;
const fixtureEventMatchesFilter = (event: CalendarProjectedEvent, filter: CalendarFilter) => filter !== "money" && (filter === "all" || filter === event.category);
const eventOverlapsDate = (event: Event, date: string) => event.timingType === "period"
  ? event.startDate === date
  : Boolean(event.startDate && event.endDate && event.startDate <= date && event.endDate >= date);
const eventTimeLabel = (event: Event) => event.timingType === "period" ? "期間" : event.allDay ? "終日" : `${event.startTime}〜${event.endTime}`;
const searchDateLabel = (value: string) => formatDate(value, dateFromKey(value).getFullYear() !== new Date().getFullYear());
const moneyAmountLabel = (amount: number) => `${amount >= 0 ? "+" : "-"}${Math.abs(amount).toLocaleString("ja-JP")}`;
const calendarMoneyForCell = (date: string | null, filter: CalendarFilter, today: string, projection?: MoneyProjection): CalendarMoneyItem[] => {
  if (!date || filter === "home" || filter === "work") return [];
  const entries = calendarMoneyEntriesForDate(date, today, projection);
  const summary = calendarMoneySummaryForDate(date, today, projection);
  if (filter === "money") return [...entries.map((entry) => ({ ...entry, isSummary: false })), ...(summary ? [{ ...summary, isSummary: true, label: "収支" }] : [])];
  return summary ? [{ ...summary, isSummary: true, label: "収支" }] : [];
};

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
  const [isRegistering, setIsRegistering] = useState(false); const [forgotMode, setForgotMode] = useState(false); const [resetRequested, setResetRequested] = useState(false); const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); setBusy(true); try { const result = isRegistering ? await register(displayName, email, password) : await login(email, password); onAuthenticated(result.user); } catch (caught) { setError(caught instanceof Error ? caught.message : "ログインできませんでした。"); } finally { setBusy(false); } };
  const submitResetRequest = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); setBusy(true); try { await requestPasswordReset(email); setResetRequested(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "送信できませんでした。"); } finally { setBusy(false); } };
  if (forgotMode) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><h2>パスワードの再設定</h2>{resetRequested ? <><p>登録されているメールアドレスの場合、再設定用のリンクを送信しました。メール内のリンクから30分以内に新しいパスワードを設定してください。</p><button className="text-button" onClick={() => { setForgotMode(false); setResetRequested(false); setError(""); }} type="button">ログインに戻る</button></> : <><p>登録したメールアドレスを入力してください。再設定用のリンクをメールで送ります。</p><form className="auth-form" onSubmit={(event) => { void submitResetRequest(event); }}><label className="input-field" htmlFor="reset-email"><span>メールアドレス</span><Input id="reset-email" autoComplete="email" onChange={setEmail} required type="email" value={email} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "送信中…" : "再設定リンクを送る"}</Button></form><button className="text-button" onClick={() => { setForgotMode(false); setError(""); }} type="button">ログインに戻る</button></>}</main></div>;
  return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><h2>{isRegistering ? "アカウントを作成" : "ログイン"}</h2><form className="auth-form" onSubmit={(event) => { void submit(event); }}>{isRegistering ? <label className="input-field" htmlFor="display-name"><span>表示名</span><Input id="display-name" autoComplete="name" onChange={setDisplayName} required value={displayName} /></label> : null}<label className="input-field" htmlFor="email"><span>メールアドレス</span><Input id="email" autoComplete="email" onChange={setEmail} required type="email" value={email} /></label><label className="input-field" htmlFor="password"><span>パスワード</span><Input id="password" autoComplete={isRegistering ? "new-password" : "current-password"} minLength={12} onChange={setPassword} required type="password" value={password} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "確認中…" : isRegistering ? "アカウントを作成" : "ログイン"}</Button></form><button className="text-button" onClick={() => { setIsRegistering((current) => !current); setError(""); }} type="button">{isRegistering ? "ログインに戻る" : "アカウントを作成する"}</button>{isRegistering ? null : <button className="text-button" onClick={() => { setForgotMode(true); setError(""); }} type="button">パスワードを忘れた場合</button>}</main></div>;
}

export function PasswordResetPage({ token, onAuthenticated }: { token: string; onAuthenticated: (user: AuthUser) => void }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); if (password !== confirmation) { setError("確認用パスワードが一致しません。"); return; } setBusy(true); try { const result = await confirmPasswordReset(token, password); onAuthenticated(result.user); } catch (caught) { setError(caught instanceof Error ? caught.message : "再設定できませんでした。"); } finally { setBusy(false); } };
  return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><h2>新しいパスワードを設定</h2>{token ? <form className="auth-form" onSubmit={(event) => { void submit(event); }}><label className="input-field" htmlFor="new-password"><span>新しいパスワード</span><Input id="new-password" autoComplete="new-password" minLength={12} onChange={setPassword} required type="password" value={password} /></label><label className="input-field" htmlFor="new-password-confirmation"><span>新しいパスワード（確認）</span><Input id="new-password-confirmation" autoComplete="new-password" minLength={12} onChange={setConfirmation} required type="password" value={confirmation} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "設定中…" : "パスワードを設定する"}</Button></form> : <p>再設定リンクが無効です。ログイン画面の「パスワードを忘れた場合」から、もう一度リンクを発行してください。</p>}</main></div>;
}

function FixtureTabs({ active, onChange }: { active: CalendarFilter; onChange: (filter: CalendarFilter) => void }) { return <div aria-label="表示切替" className="shell-tabs" role="tablist">{(Object.keys(filterLabels) as CalendarFilter[]).map((filter) => <button aria-selected={active === filter} className="shell-tab" key={filter} onClick={() => onChange(filter)} role="tab" type="button">{filterLabels[filter]}</button>)}</div>; }

export function CalendarShell({ events, money, filter, month, loadState, hasData, onRetry, onDateSelect, onFilterChange, onMonthChange, onSearch }: { events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; month: string; loadState: DataLoadState; hasData?: boolean; onRetry: () => void; onDateSelect: (date: string, filter: CalendarFilter) => void; onFilterChange: (filter: CalendarFilter) => void; onMonthChange: (month: string) => void; onSearch: () => void }) {
  const canRender = hasData ?? loadState === "success";
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
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const [calendarCellHeight, setCalendarCellHeight] = useState(0);
  useLayoutEffect(() => {
    const grid = calendarGridRef.current;
    if (!grid) return undefined;
    const measure = () => { const height = grid.getBoundingClientRect().height / 6; if (height > 0) setCalendarCellHeight(height); };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [loadState, month]);
  const candidateValue = Number(new URLSearchParams(window.location.search).get("calendarMax"));
  const autoRowCapacity = calendarCellHeight > 0 ? Math.max(1, Math.min(4, Math.floor((calendarCellHeight - 33) / 14))) : 4;
  const rowCapacity = candidateValue === 2 || candidateValue === 3 || candidateValue === 4 ? Math.min(autoRowCapacity, candidateValue) : autoRowCapacity;
  const renderedBands = useMemo(() => bands.filter((segment) => {
    if (filter !== "all") return segment.lane < rowCapacity;
    for (let column = segment.startColumn; column <= segment.endColumn; column += 1) {
      const cellIndex = segment.row * 7 + column - 1;
      const day = cells[cellIndex];
      const cellDate = day ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : null;
      const cellMoney = calendarMoneyForCell(cellDate, filter, today, money ?? undefined);
      const reservedRows = cellMoney.some((item) => item.isSummary) ? 1 : 0;
      if (segment.lane >= rowCapacity - reservedRows) return false;
    }
    return true;
  }), [bands, filter, rowCapacity, cells, monthIndex, year, today, money]);
  const bandLaneCountByCell = useMemo(() => renderedBands.reduce<Record<string, number>>((counts, segment) => { for (let column = segment.startColumn; column <= segment.endColumn; column += 1) { const key = `${segment.row}:${column}`; counts[key] = Math.max(counts[key] ?? 0, segment.lane + 1); } return counts; }, {}), [renderedBands]);
  return <main className="screen-page calendar-page">
    <header className="screen-header"><h1>カレンダー</h1><button aria-label="検索" className="icon-button" onClick={onSearch} type="button"><NavIcon name="search" /></button></header>
    <FixtureTabs active={filter} onChange={onFilterChange} />
    {!canRender && loadState !== "success" ? <DataStateMessage onRetry={onRetry} state={loadState} /> : <section aria-label={`${year}年${monthIndex + 1}月`} className="calendar-section">
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
          const hasBand = allocation.visibleBandCount > 0;
          return <button aria-label={day ? `${day}日` : "空の日付"} className={`calendar-cell${cellDate === today ? " calendar-cell--today" : ""}${hasBand ? " calendar-cell--has-band" : ""}`} disabled={!day} key={`${day ?? "empty"}-${index}`} onClick={() => { if (cellDate) onDateSelect(cellDate, filter); }} style={{ "--calendar-band-lanes": Math.min(rowCapacity, bandLaneCount) } as CSSProperties} type="button">
            {day ? <><span className="calendar-cell__date">{day}</span>{allocation.hiddenCount > 0 ? <span aria-label={`${allocation.hiddenCount}件の予定を省略`} className="calendar-cell__count">{allocation.hiddenCount}</span> : null}<span className="calendar-cell__single-events" style={{ "--calendar-band-lanes": allocation.visibleBandCount, "--calendar-content-rows": allocation.contentRows } as CSSProperties}>
              {allocation.visibleEvents.map((event) => <span className={`calendar-event calendar-event--${event.category} calendar-event--${event.kind}`} key={`${event.eventId}-${event.date}`}>{event.label}</span>)}
              {allocation.visibleMoney.map((entry, moneyIndex) => <span className={`calendar-cell__money calendar-cell__money--${entry.category}${entry.isSummary ? " calendar-cell__money--summary" : " calendar-cell__money--detail"}`} key={`${entry.label}-${entry.amount}-${moneyIndex}`} style={entry.isSummary && allocation.summaryRowIndex ? { gridRow: allocation.summaryRowIndex } : undefined}>{entry.isSummary ? moneyAmountLabel(entry.amount) : entry.label}</span>)}
            </span></> : null}
          </button>;
        })}
        <div aria-hidden="true" className="calendar-band-layer">{renderedBands.map((segment, index) => <span className={`calendar-band calendar-band--multi calendar-band--${segment.category}${segment.isStart ? " calendar-band--start" : ""}${segment.isEnd ? " calendar-band--end" : ""}`} key={`${segment.category}-${segment.row}-${segment.startColumn}-${index}`} style={{ "--band-lane": segment.lane, gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`, gridRow: segment.row + 1 } as CSSProperties}>{segment.label}</span>)}</div>
      </div>
    </section>}
  </main>;
}

function CalendarSearchPage({ onBack, onSelect, searchResults = searchCalendarEvents }: { onBack: () => void; onSelect: (result: CalendarSearchResult) => void; searchResults?: (query: string, limit?: number, signal?: AbortSignal) => Promise<{ events: CalendarSearchResult[] }> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CalendarSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const normalized = query.trim();
  useEffect(() => {
    if (normalized.length < 2) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void searchResults(normalized, 50, controller.signal).then(({ events }) => setResults(events ?? [])).catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) { setResults([]); setError("検索できませんでした。"); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalized, searchResults]);
  const changeQuery = (value: string) => { setQuery(value); if (value.trim().length < 2) { setLoading(false); setError(""); } };
  return <main className="screen-page calendar-search-page">
    <header className="screen-header"><button aria-label="カレンダーへ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>検索</h1><span className="header-spacer" /></header>
    <label className="calendar-search-field"><span className="sr-only">予定を検索</span><input aria-label="予定を検索" autoComplete="off" autoFocus className="input calendar-search-input" inputMode="search" placeholder="予定を検索" value={query} onChange={(event) => changeQuery(event.target.value)} />{query ? <button aria-label="検索を消去" className="calendar-search-field__clear" onClick={() => changeQuery("")} type="button">×</button> : null}</label>
    <section className="calendar-search-section"><h2>検索結果</h2>{normalized.length === 1 ? <p className="search-hint">2文字以上で検索</p> : loading ? <p className="search-hint" role="status">検索中…</p> : error ? <p className="form-error" role="alert">{error}</p> : normalized.length >= 2 && results.length === 0 ? <p className="empty-state">見つかりませんでした</p> : normalized.length >= 2 ? <div className="calendar-search-results">{results.map((result) => { const contextField = result.matchContext.fields.includes("title") ? null : result.matchContext.fields.find((field) => field !== "title"); const contextText = result.matchContext.text ?? (contextField ? result[contextField] : null); const contextLabel = contextField === "place" ? "場所" : contextField === "memo" ? "メモ" : null; const timing = reuseEventPeriodLabel(result); const dateTime = result.timingType === "period" ? <span>{timing}</span> : <><time>{searchDateLabel(result.occurrenceDate)}</time><span>{timing}</span></>; return <button className="calendar-search-result" key={result.id + ":" + (result.occurrenceKey ?? result.occurrenceDate)} onClick={() => onSelect(result)} type="button"><span className={`calendar-search-result__title calendar-search-result__title--${result.category}`}>{result.title}</span><span className="calendar-search-result__datetime">{dateTime}</span>{contextLabel && contextText ? <small className="calendar-search-result__context">{contextLabel} {contextText}</small> : null}</button>; })}</div> : null}</section>
  </main>;
}

export function CalendarDateSheet({ date, events, money, filter, onClose, onAddCategory, onAddMoney, onOpenDaily, onEditEvent, onEditMoney, onMoneyChanged, onDateChange, offlineMode = false }: { date: string; events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; onClose: () => void; onAddCategory: (category: Event["category"]) => void; onAddMoney: () => void; onOpenDaily: () => void; onEditEvent: (event: Event) => void; onEditMoney: (item: MoneyItem) => void; onMoneyChanged?: () => void; onDateChange: (date: string) => void; offlineMode?: boolean }) {
  const scheduledEvents = filter === "money" ? [] : [...new Map(events.filter((event) => event.timingType !== "period" && eventOverlapsDate(event, date) && (filter === "all" || event.category === filter)).map((event) => [eventIdentity(event), event])).values()];
  const periodEvents = filter === "money" ? [] : events.filter((event) => event.timingType === "period" && eventOverlapsDate(event, date) && (filter === "all" || event.category === filter));
  const dayEvents = [...periodEvents, ...scheduledEvents].sort((left, right) => (left.allDay ? "00:00" : left.startTime ?? "00:00").localeCompare(right.allDay ? "00:00" : right.startTime ?? "00:00"));
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedMoneyId, setExpandedMoneyId] = useState<string | null>(null);
  const [actualMoney, setActualMoney] = useState<MoneyItem | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const gesture = useRef<{ axis: "pending" | "horizontal"; x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const moveDate = (amount: number) => { setExpandedEventId(null); onDateChange(shiftDate(date, amount)); };
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
  const rowDrag = useRef<{ x: number; y: number } | null>(null);
  const pointerDown = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".tap-expand-row")) { rowDrag.current = { x: pointerEvent.clientX, y: pointerEvent.clientY }; gesture.current = null; suppressClick.current = false; return; } rowDrag.current = null; gesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressClick.current = false; };
  const pointerMove = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { const current = gesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { gesture.current = null; return; } current.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); } if (current.axis === "horizontal") pointerEvent.preventDefault(); };
  const pointerUp = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => { const rowStart = rowDrag.current; if (rowStart) { const dx = pointerEvent.clientX - rowStart.x; const dy = pointerEvent.clientY - rowStart.y; if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy)) suppressClick.current = true; rowDrag.current = null; return; } const current = gesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "horizontal" && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) { suppressClick.current = true; moveDate(dx < 0 ? 1 : -1); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } gesture.current = null; };
  const toggleEvent = (eventId: string) => setExpandedEventId((current) => current === eventId ? null : eventId);
  const toggleMoney = (moneyId: string) => setExpandedMoneyId((current) => current === moneyId ? null : moneyId);
  const moneyItems = money?.occurrences.filter((item) => item.date === date) ?? [];
  const moneySummary = filter === "all" || filter === "money" ? calendarMoneySummaryForDate(date, todayDateKey(), money ?? undefined) : null;
  return <><BottomSheet className="calendar-date-sheet" headerActions={<div aria-label="日付を移動" className="calendar-date-sheet__header-nav"><button aria-label="前の日" onClick={() => moveDate(-1)} type="button">‹</button><button aria-label="次の日" onClick={() => moveDate(1)} type="button">›</button></div>} open title={formatDate(date, true)} onClose={onClose}><div className="sheet-detail calendar-date-sheet__gesture" onClickCapture={(clickEvent) => { if (quickAddOpen && (!(clickEvent.target instanceof Element) || !clickEvent.target.closest(".calendar-date-sheet__quick-add"))) setQuickAddOpen(false); if (!suppressClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressClick.current = false; }} onPointerCancel={() => { gesture.current = null; }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}><div className="sheet-list">{filter === "money" ? moneyItems.map((item) => { const key = item.occurrenceKey ?? item.id; return <article aria-label={item.title} className="tap-expand-row" key={key}><button aria-controls={expandedMoneyId === key ? `date-money-detail-${key}` : undefined} aria-expanded={expandedMoneyId === key} className="sheet-money-entry sheet-money-entry--button money-sheet-row" onClick={() => toggleMoney(key)} type="button"><MoneyStatusIcon status={item.settlementStatus} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "その他"}</small></span><strong className={`sheet-money-summary--${item.type}`}>{moneyAmountLabel(item.signedAmount ?? 0)}</strong></button>{expandedMoneyId === key ? <MoneyInlineDetail id={`date-money-detail-${key}`} item={item} onActual={() => setActualMoney(item)} onEdit={() => onEditMoney(item)} readOnly={offlineMode} /> : null}</article>; }) : null}{dayEvents.map((event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onEdit={() => onEditEvent(event)} onToggle={() => toggleEvent(identity)} showTimeInDetail={false} />; })}{dayEvents.length === 0 && filter !== "money" ? <p className="empty-state">予定はありません</p> : null}</div>{moneySummary ? <div className="sheet-money-summary"><span>収支</span><strong className={`sheet-money-summary--${moneySummary.category}`}>{moneyAmountLabel(moneySummary.amount)}円</strong></div> : null}<div className="sheet-footer"><Button onClick={onOpenDaily} variant="secondary">1日の詳細を見る</Button>{offlineMode ? null : <div className="calendar-date-sheet__quick-add">{quickAddOpen ? <div aria-label="この日に追加" className="calendar-date-sheet__quick-add-menu" role="menu"><button onClick={() => chooseAdd("home")} role="menuitem" type="button">家</button><button onClick={() => chooseAdd("work")} role="menuitem" type="button">仕事</button><button onClick={() => chooseAdd("money")} role="menuitem" type="button">お金</button></div> : null}<button aria-expanded={quickAddOpen} aria-label="当日に追加" className="sheet-add-button calendar-date-sheet__quick-add-toggle" onClick={() => setQuickAddOpen((open) => !open)} type="button"><NavIcon name="add" /></button></div>}</div></div></BottomSheet><MoneyActualSheet item={actualMoney} onClose={() => setActualMoney(null)} onSaved={onMoneyChanged ?? (() => undefined)} open={Boolean(actualMoney)} /></>;
}

function DailyEventDetail({ event, onEdit, showTime = true }: { event: Event; onEdit?: () => void; showTime?: boolean }) {
  const dateRange = event.timingType === "period" && event.periodStartDate && event.periodEndDate ? formatDateRange(event.periodStartDate, event.periodEndDate) : event.startDate && event.endDate ? formatDateRange(event.startDate, event.endDate) : "期間";
  const dateTime = `${dateRange} ${eventTimeLabel(event)}`;
  const dateOnly = dateRange;
  return <div className="event-inline-detail" id={`daily-event-detail-${eventIdentity(event)}`}><p>{showTime ? dateTime : dateOnly}</p>{event.place ? <p>{event.place}</p> : null}{event.memo ? <p>{event.memo}</p> : null}{onEdit ? <Button className="inline-detail__edit" onClick={onEdit} variant="secondary">編集</Button> : null}</div>;
}

function DailyEventRow({ event, expanded, onToggle, onEdit, showTimeInDetail = true }: { event: Event; expanded: boolean; onToggle: () => void; onEdit: () => void; showTimeInDetail?: boolean }) {
  return <article aria-label={event.title} className="tap-expand-row"><button aria-controls={expanded ? `daily-event-detail-${eventIdentity(event)}` : undefined} aria-expanded={expanded} className={`fixture-row fixture-row--${event.category} tap-expand-row__trigger${event.allDay ? " tap-expand-row__trigger--all-day" : ""}`} onClick={onToggle} type="button">{event.allDay ? null : <time>{event.startTime}〜{event.endTime}</time>}<span className="fixture-row__title">{event.title}</span></button>{expanded ? <DailyEventDetail event={event} onEdit={onEdit} showTime={showTimeInDetail} /> : null}</article>;
}

export function DailyShell({ date, events, money, filter, dailyNote, onDateChange, onFilterChange, onEditEvent, onEditMoney, onMoneyChanged, onSaveNote, offlineMode = false }: { date: string; events: Event[]; money: MoneyProjection | null; filter: CalendarFilter; dailyNote: DailyNote | null; onDateChange: (date: string) => void; onFilterChange: (filter: CalendarFilter) => void; onEditEvent: (event: Event) => void; onEditMoney: (item: MoneyItem) => void; onMoneyChanged?: () => void; onSaveNote: (content: string) => Promise<DailyNote | null>; offlineMode?: boolean }) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedMoneyId, setExpandedMoneyId] = useState<string | null>(null);
  const [actualMoney, setActualMoney] = useState<MoneyItem | null>(null);
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
  const toggleEvent = (eventId: string) => setExpandedEventId((current) => current === eventId ? null : eventId);
  const toggleMoney = (moneyId: string) => setExpandedMoneyId((current) => current === moneyId ? null : moneyId);
  const eventRow = (event: Event) => { const identity = eventIdentity(event); return <DailyEventRow event={event} expanded={expandedEventId === identity} key={identity} onToggle={() => toggleEvent(identity)} onEdit={() => onEditEvent(event)} />; };
  const saveNote = async () => { setNoteBusy(true); setNoteError(""); try { await onSaveNote(noteDraft); setNoteEditing(false); } catch (caught) { setNoteError(caught instanceof Error ? caught.message : "メモを保存できませんでした。"); } finally { setNoteBusy(false); } };
  const dailyGesture = useRef<{ axis: "pending" | "horizontal"; x: number; y: number } | null>(null);
  const suppressDailyClick = useRef(false);
  const dailyRowDrag = useRef<{ x: number; y: number } | null>(null);
  const dailyPointerDown = (pointerEvent: ReactPointerEvent<HTMLElement>) => { if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return; if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".tap-expand-row")) { dailyRowDrag.current = { x: pointerEvent.clientX, y: pointerEvent.clientY }; dailyGesture.current = null; suppressDailyClick.current = false; return; } dailyRowDrag.current = null; dailyGesture.current = { axis: "pending", x: pointerEvent.clientX, y: pointerEvent.clientY }; suppressDailyClick.current = false; };
  const dailyPointerMove = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "pending") { if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; if (Math.abs(dx) <= Math.abs(dy) + 4) { dailyGesture.current = null; return; } current.axis = "horizontal"; pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId); } if (current.axis === "horizontal") pointerEvent.preventDefault(); };
  const dailyPointerUp = (pointerEvent: ReactPointerEvent<HTMLElement>) => { const rowStart = dailyRowDrag.current; if (rowStart) { const dx = pointerEvent.clientX - rowStart.x; const dy = pointerEvent.clientY - rowStart.y; if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy)) suppressDailyClick.current = true; dailyRowDrag.current = null; return; } const current = dailyGesture.current; if (!current) return; const dx = pointerEvent.clientX - current.x; const dy = pointerEvent.clientY - current.y; if (current.axis === "horizontal" && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) { suppressDailyClick.current = true; onDateChange(shiftDate(date, dx < 0 ? 1 : -1)); pointerEvent.currentTarget.releasePointerCapture?.(pointerEvent.pointerId); } dailyGesture.current = null; };
  return <main className="screen-page daily-page" onClickCapture={(clickEvent) => { if (!suppressDailyClick.current) return; clickEvent.preventDefault(); clickEvent.stopPropagation(); suppressDailyClick.current = false; }} onPointerCancel={() => { dailyGesture.current = null; }} onPointerDown={dailyPointerDown} onPointerMove={dailyPointerMove} onPointerUp={dailyPointerUp}><header className="screen-header"><h1>デイリー</h1><span className="daily-date-label">{formatDate(date)}</span><div className="daily-date-actions"><button aria-label="前の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, -1))} type="button">‹</button><button className="today-button" onClick={() => onDateChange(todayDateKey())} type="button">今日</button><button aria-label="次の日" className="daily-date-button" onClick={() => onDateChange(shiftDate(date, 1))} type="button">›</button></div></header><FixtureTabs active={filter} onChange={onFilterChange} />{showTimeline ? <section className="timeline-section"><h2>予定</h2>{allDay.length > 0 ? <div className="fixture-group"><h3>終日</h3>{allDay.map(eventRow)}</div> : null}{periodEvents.length > 0 ? <div className="fixture-group"><h3>期間</h3>{periodEvents.map(eventRow)}</div> : null}{timed.length > 0 ? <div className="fixture-group"><h3>時間あり</h3>{timed.map(eventRow)}</div> : null}{dayEvents.length === 0 ? <p className="empty-state">予定はありません</p> : null}</section> : null}{filter === "money" || showOverview ? <section className="daily-section"><h2>今日のお金</h2>{filter === "money" ? moneyItems.map((item) => { const key = item.occurrenceKey ?? item.id; return <article aria-label={item.title} className="tap-expand-row" key={key}><button aria-controls={expandedMoneyId === key ? `daily-money-detail-${key}` : undefined} aria-expanded={expandedMoneyId === key} className="fixture-row daily-money-row" onClick={() => toggleMoney(key)} type="button"><MoneyStatusIcon status={item.settlementStatus} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "その他"}</small></span><strong className={`daily-money--${item.type}`}>{moneyAmountLabel(item.signedAmount ?? 0)}円</strong></button>{expandedMoneyId === key ? <MoneyInlineDetail id={`daily-money-detail-${key}`} item={item} onActual={() => setActualMoney(item)} onEdit={() => onEditMoney(item)} readOnly={offlineMode} /> : null}</article>; }) : moneySummary ? <div className="fixture-row"><span>収支</span><strong className={`daily-money--${moneySummary.category}`}>{moneyAmountLabel(moneySummary.amount)}円</strong></div> : <p className="empty-state">記録はありません</p>}</section> : null}{showOverview ? <section className="daily-section daily-note-section"><h2>今日のメモ</h2>{noteEditing ? <div className="daily-note-editor"><textarea aria-label="今日のメモ" className="textarea" onChange={(event) => setNoteDraft(event.target.value)} value={noteDraft} /><div className="daily-note-actions"><Button disabled={noteBusy} onClick={() => { void saveNote(); }}>{noteBusy ? "保存中…" : "保存"}</Button><Button disabled={noteBusy} onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(false); }} variant="ghost">キャンセル</Button></div>{noteError ? <p className="form-error" role="alert">{noteError}</p> : null}</div> : offlineMode ? <p className="daily-note-body">{dailyNote?.content || "メモはありません"}</p> : <button aria-label="今日のメモを編集" className="daily-note-body" onClick={() => { setNoteDraft(dailyNote?.content ?? ""); setNoteEditing(true); }} type="button">{dailyNote?.content || "メモはありません"}</button>}</section> : null}<MoneyActualSheet item={actualMoney} onClose={() => setActualMoney(null)} onSaved={onMoneyChanged ?? (() => undefined)} open={Boolean(actualMoney)} /></main>;
}

function ReuseSearchSheet<T extends { id: string }>({ open, title, inputLabel, onClose, onSelect, loadCandidates, renderCandidate }: { open: boolean; title: string; inputLabel: string; onClose: () => void; onSelect: (candidate: T) => void; loadCandidates: (query: string, signal: AbortSignal) => Promise<T[]>; renderCandidate: (candidate: T) => ReactNode }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loaderRef = useRef(loadCandidates);
  useEffect(() => { loaderRef.current = loadCandidates; }, [loadCandidates]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => setQuery(""), 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const normalized = query.trim();
    if (normalized.length === 1) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void loaderRef.current(normalized, controller.signal).then(setCandidates).catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("候補を読み込めませんでした。");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, normalized.length >= 2 ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);
  const changeQuery = (value: string) => { setQuery(value); if (value.trim().length < 2) { setLoading(false); setError(""); } };
  return <BottomSheet className="reuse-search-sheet" open={open} title={title} onClose={onClose}><div className="reuse-search"><label className="reuse-search__field"><span className="sr-only">{inputLabel}</span><input aria-label={inputLabel} autoComplete="off" inputMode="search" placeholder="検索" value={query} onChange={(event) => changeQuery(event.target.value)} />{query ? <button aria-label="検索を消去" className="reuse-search__clear" onClick={() => changeQuery("")} type="button">×</button> : null}</label>{query.trim().length === 1 ? <p className="reuse-search__hint">2文字以上で検索</p> : loading ? <p className="reuse-search__hint" role="status">検索中…</p> : error ? <p className="form-error" role="alert">{error}</p> : candidates.length > 0 ? <div className="reuse-search__list">{candidates.map((candidate) => <button className="reuse-search__row" key={candidate.id} onClick={() => { onSelect(candidate); onClose(); }} type="button">{renderCandidate(candidate)}</button>)}</div> : <p className="empty-state">{query.trim() ? "見つかりませんでした" : "最近の項目はありません"}</p>}</div></BottomSheet>;
}

const reuseEventPeriodLabel = (event: Event) => event.timingType === "period" ? event.periodWindowType === "custom_range" && event.periodStartDate && event.periodEndDate ? formatDateRange(event.periodStartDate, event.periodEndDate) : event.periodWindowType === "this_month" ? "今月中" : "今週中" : event.allDay ? "終日" : eventTimeLabel(event);

function RecentEventSheet({ open, category, onClose, onSelect }: { open: boolean; category: Event["category"]; onClose: () => void; onSelect: (event: Event) => void }) {
  return <ReuseSearchSheet
    inputLabel="以前の予定を検索"
    loadCandidates={(query, signal) => getEventReuseCandidates(query, category, query ? 50 : 8, signal).then(({ events }) => events ?? [])}
    onClose={onClose}
    onSelect={onSelect}
    open={open}
    renderCandidate={(event) => <><span className={`reuse-search__marker reuse-search__marker--${event.category}`} /><span><strong>{event.title}</strong><small>{reuseEventPeriodLabel(event)}{event.place ? ` · ${event.place}` : ""}</small></span></>}
    title="以前の項目から選ぶ"
  />;
}

function EventOptionSheet({ option, onClose, recurrence, startDate, timingType, periodWindowType, onTimingTypeChange, onPeriodWindowChange, onRecurrenceChange, notifications, onNotificationsChange, notificationTemplateId, onNotificationTemplateChange, deadlineTime, onDeadlineTimeChange }: { option: "type" | "repeat" | "notification" | "period" | null; onClose: () => void; recurrence: RecurrenceRuleInput | null; startDate: string; timingType: Event["timingType"]; periodWindowType: Event["periodWindowType"]; onTimingTypeChange: (value: Event["timingType"]) => void; onPeriodWindowChange: (value: NonNullable<Event["periodWindowType"]>) => void; onRecurrenceChange: (value: RecurrenceRuleInput | null) => void; notifications: number[]; onNotificationsChange: (value: number[]) => void; notificationTemplateId: string | null; onNotificationTemplateChange: (value: string | null) => void; deadlineTime: string; onDeadlineTimeChange: (value: string) => void }) {
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
      {current.endsOn ? <DateInput compact id="recurrence-ends-on" label="終了日" min={startDate} onChange={(value) => update({ endsOn: value })} value={current.endsOn} /> : null}<Button onClick={onClose}>この設定にする</Button>
    </div> : null}<button aria-label="繰り返しを閉じる" className="event-option-sheet__close" onClick={onClose} type="button">閉じる</button>
  </> : <><div className="notification-template-options"><p>保存済みテンプレート</p><button aria-pressed={notifications.length === 0} className="event-option-sheet__option" onClick={() => { onNotificationsChange([]); onNotificationTemplateChange(null); onClose(); }} type="button"><span>なし</span><span aria-hidden="true">{notifications.length === 0 ? "✓" : ""}</span></button>{templates.map((template) => <button aria-pressed={notificationTemplateId === template.id || (notificationTemplateId === null && notifications.length > 0 && template.offsets.map((offset) => offset.offsetMinutes).every((offset) => notifications.includes(offset)) && notifications.length === template.offsets.length)} className="event-option-sheet__option" key={template.id} onClick={() => { onNotificationsChange(template.offsets.map((offset) => offset.offsetMinutes)); onNotificationTemplateChange(template.id); onClose(); }} type="button"><span>{template.name}</span><span>{notificationSummary(template.offsets.map((offset) => offset.offsetMinutes))}</span></button>)}</div><div className="notification-template-options"><p>カスタム通知</p><NotificationOffsetPicker offsets={notifications} onChange={(next) => { onNotificationsChange(next); onNotificationTemplateChange(null); }} /></div><p className="notification-summary-preview">{notificationSummary(notifications)}</p>{timingType === "period" && notifications.length > 0 ? <label className="input-field" htmlFor="event-deadline-time"><span>期限時刻</span><Input id="event-deadline-time" onChange={onDeadlineTimeChange} type="time" value={deadlineTime || "21:00"} /></label> : null}<Button onClick={onClose}>この設定にする</Button></>}</div></BottomSheet>;
}

function ScopeSheet({ open, action, subject = "予定", onClose, onSelect }: { open: boolean; action: "edit" | "delete"; subject?: "予定" | "項目"; onClose: () => void; onSelect: (scope: EventScope) => void }) { const title = action === "edit" ? "編集する範囲" : "削除する範囲"; const options: Array<{ scope: EventScope; label: string }> = [{ scope: "occurrence", label: `この${subject}のみ` }, { scope: "following", label: `この${subject}以降` }, { scope: "series", label: `すべての${subject}` }]; return <BottomSheet open={open} title={title} onClose={onClose}><div className="event-option-sheet">{options.map((option) => <button className="event-option-sheet__option" key={option.scope} onClick={() => onSelect(option.scope)} type="button"><span>{option.label}</span></button>)}</div></BottomSheet>; }

const periodWindowLabel = (value: Event["periodWindowType"]) => value === "this_week" ? "今週中" : value === "this_month" ? "今月中" : "日付範囲を指定";
export function EventForm({ category, initialDate, event, scope = "series", onCancel, onSaved, onDelete, suppressInitialRecentOpen = true, lastUsedNotification, onNotificationPreferenceSaved }: { category: Event["category"]; initialDate: string; event?: Event; scope?: EventScope; onCancel: () => void; onSaved: (event: Event) => void; onDelete?: () => void; suppressInitialRecentOpen?: boolean; lastUsedNotification?: LastUsedNotificationPreference | null; onNotificationPreferenceSaved?: (category: Event["category"], preference: LastUsedNotificationPreference) => Promise<void> | void }) {
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
  const initialNotificationOffsets = useMemo(() => event?.notifications ?? lastUsedNotification?.offsets ?? [], [event?.notifications, lastUsedNotification?.offsets]);
  const initialNotificationMode = event ? "none" : lastUsedNotification?.mode ?? "none";
  const [notifications, setNotifications] = useState<number[]>(initialNotificationOffsets);
  const [notificationTemplateId, setNotificationTemplateId] = useState<string | null>(event || initialNotificationMode !== "template" ? null : lastUsedNotification?.templateId ?? null);
  const [deadlineTime, setDeadlineTime] = useState(event?.deadlineTime ?? "");
  const [placeOpen, setPlaceOpen] = useState(Boolean(event?.place));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notificationTouched = useRef(Boolean(event));
  useEffect(() => {
    if (event || lastUsedNotification === undefined || lastUsedNotification === null) return undefined;
    let active = true;
    void (async () => {
      if (notificationTouched.current) return;
      const preference = lastUsedNotification;
      if (!preference || preference.mode === "none") {
        setNotifications([]);
        setNotificationTemplateId(null);
        return;
      }
      if (preference.mode === "template" && preference.templateId) {
        try {
          const { templates } = await getNotificationTemplates();
          const template = (templates ?? []).find((candidate) => candidate.id === preference.templateId);
          if (!active || notificationTouched.current) return;
          if (template) {
            setNotificationTemplateId(template.id);
            setNotifications(template.offsets.map((offset) => offset.offsetMinutes));
            return;
          }
        } catch { /* use the stored snapshot below */ }
      }
      if (!active || notificationTouched.current) return;
      setNotificationTemplateId(null);
      setNotifications(preference.offsets);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [event, lastUsedNotification]);
  const setStartTime = (value: string) => { setRawStartTime(value); if (!event && timingType === "scheduled" && !allDay && !endTimeExplicit) setRawEndTime(defaultEndTimeForStart(value)); };
  const setEndTime = (value: string) => { setRawEndTime(value); setEndTimeExplicit(true); };
  const setType = (value: Event["timingType"]) => { setTimingType(value); if (value === "period") { setPeriodAnchorDate(event?.periodAnchorDate ?? initialDate); setPeriodWindowType(event?.periodWindowType ?? "this_week"); } else setDeadlineTime(""); };
  const setWindow = (value: NonNullable<Event["periodWindowType"]>) => { setPeriodWindowType(value); if (value === "custom_range") { setPeriodAnchorDate(""); setPeriodStartDate(periodStartDate || initialDate); setPeriodEndDate(periodEndDate || periodStartDate || initialDate); setRecurrence(null); } else { setPeriodAnchorDate(periodAnchorDate || initialDate); setPeriodStartDate(""); setPeriodEndDate(""); } };
  const updateStartDate = (value: string) => { setStartDate(value); if (endDate < value) setEndDate(value); };
  const periodRecurrenceAllowed = timingType === "scheduled" || periodWindowType !== "custom_range";
  const savedInput: EventCommandInput = timingType === "period"
    ? { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "period", allDay: null, startDate: null, startTime: null, endDate: null, endTime: null, periodWindowType, periodAnchorDate: periodWindowType === "custom_range" ? null : periodAnchorDate, periodStartDate: periodWindowType === "custom_range" ? periodStartDate : null, periodEndDate: periodWindowType === "custom_range" ? periodEndDate : null, deadlineTime: deadlineTime || null, notifications, recurrence: scope === "occurrence" ? undefined : periodRecurrenceAllowed ? recurrenceAfterBaseDateChange(recurrence, recurrence?.startsOn ?? periodAnchorDate, periodAnchorDate) : null }
    : { category, title, place: place.trim() || null, memo: memo.trim() || null, timingType: "scheduled", allDay, startDate, startTime: allDay ? null : startTime, endDate, endTime: allDay ? null : endTime, periodWindowType: null, periodAnchorDate: null, periodStartDate: null, periodEndDate: null, deadlineTime: null, notifications, recurrence: scope === "occurrence" ? undefined : recurrenceAfterBaseDateChange(recurrence, baseStartDate, startDate) };
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => { formEvent.preventDefault(); setError(""); if (timingType === "period" && periodWindowType === "custom_range" && periodStartDate && periodEndDate && periodStartDate >= periodEndDate) { setError("期間は2日以上で指定してください。"); return; } setBusy(true); try { const result = event ? await updateEvent(event.id, { ...savedInput, scope, occurrenceKey: event.occurrenceKey ?? undefined }) : await createEvent(savedInput); if (!event) { const preference = notifications.length === 0 ? emptyNotificationPreference() : { mode: notificationTemplateId ? "template" : "custom", templateId: notificationTemplateId, offsets: [...notifications] } satisfies LastUsedNotificationPreference; const persist = onNotificationPreferenceSaved ?? (async (savedCategory: Event["category"], savedPreference: LastUsedNotificationPreference) => { await updateSettings(savedCategory === "home" ? { lastUsedNotificationHome: savedPreference } : { lastUsedNotificationWork: savedPreference }); }); try { await Promise.resolve(persist(category, preference)); } catch { /* Event save remains successful. */ } } onSaved(result.event); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  const applyRecent = (recent: Event) => { notificationTouched.current = true; setTitle(recent.title); setTimingType(recent.timingType); setAllDay(recent.allDay ?? false); setStartTime(recent.startTime ?? "09:00"); setEndTime(recent.endTime ?? "10:00"); setEndTimeExplicit(recent.timingType === "scheduled" && recent.allDay === false); setPeriodWindowType(recent.timingType === "period" ? recent.periodWindowType ?? "this_week" : "this_week"); setPeriodAnchorDate(recent.timingType === "period" && recent.periodWindowType !== "custom_range" ? initialDate : ""); setPeriodStartDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setPeriodEndDate(recent.timingType === "period" && recent.periodWindowType === "custom_range" ? initialDate : ""); setDeadlineTime(recent.deadlineTime ?? ""); setNotificationTemplateId(null); setNotifications(recent.notifications ?? []); setPlace(recent.place ?? ""); setMemo(recent.memo ?? ""); setRecurrence(recent.recurrence && !(recent.timingType === "period" && recent.periodWindowType === "custom_range") ? { frequency: recent.recurrence.frequency, interval: recent.recurrence.interval, weekdays: recent.recurrence.weekdays, dayOfMonth: recent.recurrence.dayOfMonth, startsOn: initialDate, endsOn: recent.recurrence.endsOn } : null); setPlaceOpen(Boolean(recent.place)); setRecentOpen(false); };
  const setFormNotifications = (next: number[]) => { notificationTouched.current = true; setNotifications(next); };
  const setFormNotificationTemplate = (next: string | null) => { notificationTouched.current = true; setNotificationTemplateId(next); };
  return <main className="screen-page event-form-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" disabled={busy} onClick={onCancel} type="button">‹</button><h1>{event ? "予定を編集" : "予定を追加"}</h1><span className={`event-category-label event-category-label--${category}`}><span className="event-category-label__dot" />{categoryLabel[category]}の予定</span></header><form className="event-form" onSubmit={(formEvent) => { void submit(formEvent); }}><button aria-label="以前の項目から選ぶ" className="recent-entry-button" onClick={() => setRecentOpen(true)} type="button"><span>以前の項目から選ぶ</span><span aria-hidden="true">›</span></button><label className="input-field event-title-field" htmlFor="event-title"><span>タイトル</span><Input id="event-title" onChange={setTitle} required value={title} /></label><section className="event-form-section"><FormRow ariaLabel="予定の種類" label="予定の種類" onClick={() => setOptionOpen("type")} summary={timingType === "period" ? "期間中にやりたい" : "日時が決まっている"} /></section>{timingType === "scheduled" ? <section className="event-form-section"><div className="date-input-group"><DateInput compact id="event-start-date" label="日付" onChange={updateStartDate} value={startDate} /><DateInput compact id="event-end-date" label="終了日" min={startDate} onChange={setEndDate} value={endDate} /></div><label className="event-toggle-row"><span>終日</span><input checked={allDay} onChange={(inputEvent) => setAllDay(inputEvent.target.checked)} type="checkbox" /><span className="event-toggle-value">{allDay ? "ON" : "OFF"}</span></label>{!allDay ? <div className="event-time-fields"><TimeInput id="event-start-time" label="開始時間" onChange={setStartTime} required value={startTime} /><TimeInput id="event-end-time" label="終了時間" onChange={setEndTime} required value={endTime} /></div> : null}</section> : <section className="event-form-section"><FormRow ariaLabel="実施時期" label="実施時期" onClick={() => setOptionOpen("period")} summary={periodWindowLabel(periodWindowType)} />{periodWindowType === "custom_range" ? <div className="date-input-group"><DateInput compact id="event-period-start-date" label="開始日" onChange={setPeriodStartDate} value={periodStartDate} /><DateInput compact id="event-period-end-date" label="終了日" min={periodStartDate} onChange={setPeriodEndDate} value={periodEndDate} /></div> : null}</section>}{periodRecurrenceAllowed ? <section className="event-form-section"><FormRow ariaLabel="繰り返し" label="繰り返し" onClick={() => setOptionOpen("repeat")} summary={recurrenceSummary(recurrence, timingType === "period" ? periodAnchorDate : startDate, timingType === "period")} /></section> : null}<section className="event-form-section"><FormRow ariaLabel="通知" label="通知" onClick={() => setOptionOpen("notification")} summary={notificationSummary(notifications)} /></section><section className="event-form-section">{placeOpen ? <label className="input-field expanded-input" htmlFor="event-place"><span>場所</span><Input id="event-place" onChange={setPlace} value={place} /></label> : <FormRow label="場所を追加" onClick={() => setPlaceOpen(true)} summary="追加" />}</section><label className="input-field expanded-input" htmlFor="event-memo"><span>メモ</span><textarea className="textarea" id="event-memo" onChange={(inputEvent) => setMemo(inputEvent.target.value)} value={memo} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={busy} type="submit">{busy ? "保存中…" : event ? "変更を保存" : "登録"}</Button>{event && onDelete ? <Button onClick={onDelete} variant="secondary">削除</Button> : null}</form><RecentEventSheet category={category} onClose={() => setRecentOpen(false)} onSelect={applyRecent} open={recentOpen} /><EventOptionSheet deadlineTime={deadlineTime} notificationTemplateId={notificationTemplateId} notifications={notifications} onClose={() => setOptionOpen(null)} onDeadlineTimeChange={setDeadlineTime} onNotificationTemplateChange={setFormNotificationTemplate} onNotificationsChange={setFormNotifications} onPeriodWindowChange={setWindow} onRecurrenceChange={setRecurrence} onTimingTypeChange={setType} option={optionOpen} periodWindowType={periodWindowType} recurrence={recurrence} startDate={timingType === "period" ? periodAnchorDate : startDate} timingType={timingType} /></main>;
}

function EventDetailPage({ event, onBack, onEdit, onDelete }: { event: Event; onBack: () => void; onEdit: () => void; onDelete: () => void }) { const displayStart = event.timingType === "period" ? event.periodStartDate : event.startDate; const displayEnd = event.timingType === "period" ? event.periodEndDate : event.endDate; return <main className="screen-page event-detail-page"><header className="screen-header"><button aria-label="予定一覧へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>予定の詳細</h1><span className={`event-category-label event-category-label--${event.category}`}><span className="event-category-label__dot" />{categoryLabel[event.category]}</span></header><section className="event-detail"><h2>{event.title}</h2><dl className="event-detail-list"><div><dt>カテゴリ</dt><dd>{categoryLabel[event.category]}</dd></div><div><dt>{event.timingType === "period" ? "対象期間" : "日付"}</dt><dd>{displayStart && displayEnd ? formatDateRange(displayStart, displayEnd) : "—"}</dd></div><div><dt>時間</dt><dd>{eventTimeLabel(event)}</dd></div>{event.place ? <div><dt>場所</dt><dd>{event.place}</dd></div> : null}{event.memo ? <div><dt>メモ</dt><dd className="event-detail-memo">{event.memo}</dd></div> : null}</dl><div className="event-detail-actions"><Button onClick={onEdit}>編集</Button><Button onClick={onDelete} variant="secondary">削除</Button></div></section></main>; }
function DeleteConfirmSheet({ open, title, onClose, onConfirm, busy }: { open: boolean; title: string; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <BottomSheet open={open} title="予定を削除" onClose={onClose}><div className="delete-confirm"><p>「{title}」を削除しますか？</p><p className="delete-confirm__note">削除した予定は一覧から表示されなくなります。</p><Button disabled={busy} onClick={onConfirm} variant="secondary">{busy ? "削除中…" : "削除する"}</Button><Button disabled={busy} onClick={onClose} variant="ghost">キャンセル</Button></div></BottomSheet>; }

function MoneyRecentSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (item: MoneyItem) => void }) {
  return <ReuseSearchSheet
    inputLabel="以前のお金を検索"
    loadCandidates={(query, signal) => getMoneyReuseCandidates(query, query ? 50 : 8, signal).then(({ definitions }) => definitions ?? [])}
    onClose={onClose}
    onSelect={onSelect}
    open={open}
    renderCandidate={(item) => <><span className={`reuse-search__marker reuse-search__marker--money-${item.type}`} /><span><strong>{item.title}</strong><small>{item.category?.name ?? "カテゴリ未設定"}{item.recurrence ? ` · ${recurrenceSummary(item.recurrence, item.recurrence.startsOn)}` : ""}</small></span></>}
    title="以前の項目から選ぶ"
  />;
}

function MoneyCategorySheet({ open, categories, value, onChange, onClose }: { open: boolean; categories: MoneyCategory[]; value: string; onChange: (id: string) => void; onClose: () => void }) {
  return <BottomSheet open={open} title="カテゴリ" onClose={onClose}><div className="event-option-sheet">{categories.map((category) => <button aria-pressed={category.id === value} className="event-option-sheet__option" key={category.id} onClick={() => { onChange(category.id); onClose(); }} type="button"><span>{category.name}</span><span aria-hidden="true">{category.id === value ? "✓" : ""}</span></button>)}</div></BottomSheet>;
}

function MoneyRecurrenceSheet({ open, recurrence, startDate, onChange, onClose }: { open: boolean; recurrence: RecurrenceRuleInput | null; startDate: string; onChange: (value: RecurrenceRuleInput | null) => void; onClose: () => void }) {
  return <EventOptionSheet deadlineTime="" notificationTemplateId={null} notifications={[]} onDeadlineTimeChange={() => undefined} onNotificationTemplateChange={() => undefined} onNotificationsChange={() => undefined} onPeriodWindowChange={() => undefined} onRecurrenceChange={onChange} onTimingTypeChange={() => undefined} option={open ? "repeat" : null} periodWindowType={null} recurrence={recurrence} startDate={startDate} timingType="scheduled" onClose={onClose} />;
}

export function MoneyStatusIcon({ status }: { status?: MoneyItem["settlementStatus"] }) {
  const settled = status === "actual" || status === "estimated_actual";
  return <span aria-label={settled ? "確定" : "予定"} className={`money-status-icon${settled ? " money-status-icon--settled" : ""}`} role="img">{settled ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg> : null}</span>;
}

function MoneyRowContent({ item, showCategory = true }: { item: MoneyItem; showCategory?: boolean }) {
  const amount = item.signedAmount ?? (item.type === "income" ? item.plannedAmount : -item.plannedAmount);
  return <><MoneyStatusIcon status={item.settlementStatus} /><span className="money-row__label"><strong>{item.title}</strong>{showCategory ? <small>{item.category?.name ?? "その他"}</small> : null}</span><b className={`money-amount--${item.type}`}>{moneyAmountLabel(amount)}円</b></>;
}

export function MoneyInlineDetail({ item, onActual, onEdit, id, readOnly = false }: { item: MoneyItem; onActual: () => void; onEdit?: () => void; id?: string; readOnly?: boolean }) {
  const plannedAmount = item.effectivePlannedAmount ?? item.plannedAmount;
  const actualAmount = item.settlementStatus ? (item.effectiveAmount ?? item.plannedAmount) : null;
  return <div className="event-inline-detail money-inline-detail" id={id}>
    {onEdit && !readOnly ? <Button className="money-inline-detail__action" onClick={onEdit} variant="secondary">編集</Button> : null}
    {readOnly ? null : <Button className="money-inline-detail__action" onClick={onActual}>{actualAmount === null ? "金額を確定" : "確定額を変更"}</Button>}
    <dl className="money-inline-detail__list">
      <div><dt>予定額</dt><dd>{plannedAmount.toLocaleString("ja-JP")}円</dd></div>
      {actualAmount !== null ? <div><dt>確定額</dt><dd>{actualAmount.toLocaleString("ja-JP")}円</dd></div> : null}
      {item.category?.name ? <div><dt>カテゴリ</dt><dd>{item.category.name}</dd></div> : null}
      {item.recurrence ? <div><dt>繰り返し</dt><dd>{recurrenceSummary(item.recurrence, item.definitionDate ?? item.date)}</dd></div> : null}
      {item.memo ? <div><dt>メモ</dt><dd className="money-inline-detail__memo">{item.memo}</dd></div> : null}
    </dl>
  </div>;
}

function MoneyChoiceSheet({ open, title, options, onClose, onSelect }: { open: boolean; title: string; options: Array<{ label: string; value: string }>; onClose: () => void; onSelect: (value: string) => void }) {
  return <BottomSheet open={open} title={title} onClose={onClose}><div className="event-option-sheet">{options.map((option) => <button className="event-option-sheet__option" key={option.value} onClick={() => onSelect(option.value)} type="button"><span>{option.label}</span></button>)}</div></BottomSheet>;
}

function MoneyModeToggle({ mode, onChange, label = "支出表示" }: { mode: MoneyChartMode; onChange: (mode: MoneyChartMode) => void; label?: string }) {
  return <div aria-label={label} className="money-chart-mode-switch" role="group"><button aria-pressed={mode === "forecast"} onClick={() => onChange("forecast")} type="button">見込み</button><button aria-pressed={mode === "actual"} onClick={() => onChange("actual")} type="button">実績</button></div>;
}

function MoneyCategoryDonutVisual({ groups, centerLabel, heading = "カテゴリ別の支出", mode, onModeChange, emptyMessage }: { groups: MoneyCategoryGroup[]; centerLabel: string; heading?: string; mode?: MoneyChartMode; onModeChange?: (mode: MoneyChartMode) => void; emptyMessage: string }) {
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  const toggle = mode && onModeChange ? <MoneyModeToggle label={`${heading}表示`} mode={mode} onChange={onModeChange} /> : null;
  if (total === 0) return <section className="money-chart-section"><div className="money-chart-section__heading"><h2>{heading}</h2>{toggle}</div><p className="empty-state">{emptyMessage}</p></section>;
  const gradient = groups.reduce<{ cursor: number; parts: string[] }>((result, group) => { const next = result.cursor + (group.amount / total) * 100; result.parts.push(`${group.color} ${result.cursor}% ${next}%`); result.cursor = next; return result; }, { cursor: 0, parts: [] }).parts.join(", ");
  return <section className="money-chart-section"><div className="money-chart-section__heading"><h2>{heading}</h2>{toggle}</div><div className="money-chart"><div aria-label={`${centerLabel} ${total.toLocaleString("ja-JP")}円`} className="money-donut" data-mode={mode} style={{ "--money-donut": `conic-gradient(${gradient})` } as CSSProperties}><div className="money-donut__label"><span>{centerLabel}</span><strong>{total.toLocaleString("ja-JP")}円</strong></div></div><div className="money-chart__legend">{groups.map((group) => <div key={`${group.colorKey}-${group.name}`}><span className="money-chart__legend-dot" data-color-key={group.colorKey} data-testid="money-chart-legend-dot" style={{ backgroundColor: group.color }} /><span>{group.name}</span><strong>{group.amount.toLocaleString("ja-JP")}円</strong></div>)}</div></div></section>;
}

export function MoneyCategoryDonut({ occurrences }: { occurrences: MoneyItem[] }) {
  const [mode, setMode] = useState<MoneyChartMode>("forecast");
  const groups = moneyCategoryGroupsFor(occurrences, mode);
  const centerLabel = mode === "forecast" ? "今月の支出" : "確定した支出";
  return <MoneyCategoryDonutVisual centerLabel={centerLabel} emptyMessage={mode === "actual" ? "まだ確定した支出はありません" : "まだ支出はありません"} groups={groups} mode={mode} onModeChange={setMode} />;
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

function MoneyPage({ month, money, onMonthChange, onEdit, onMoneyChanged, onOpenAnalysis, offlineMode = false }: { month: string; money: MoneyProjection | null; onMonthChange: (month: string) => void; onEdit: (item: MoneyItem) => void; onMoneyChanged: () => void; onOpenAnalysis: () => void; offlineMode?: boolean }) {
  const occurrences = money?.occurrences ?? [];
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [actualItem, setActualItem] = useState<MoneyItem | null>(null);
  const { clickCapture, dragging, offset, pointerCancel, pointerDown, pointerMove, pointerUp } = useHorizontalSwipe((direction) => onMonthChange(shiftMonth(month, direction === "next" ? 1 : -1)), (target) => target instanceof Element && Boolean(target.closest(".tap-expand-row, .bottom-sheet-layer, .mobile-nav")));
  const toggleRow = (key: string) => setOpenRow((current) => current === key ? null : key);
  return <main className="screen-page money-page" onClickCapture={clickCapture} onPointerCancel={pointerCancel} onPointerDownCapture={(event) => { pointerDown(event); if (openRow && !(event.target instanceof Element && event.target.closest(".tap-expand-row, .bottom-sheet-layer"))) setOpenRow(null); }} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp}>
    <header className="screen-header"><h1>お金</h1><div className="money-header-actions"><button aria-label="お金の分析を見る" className="icon-button" onClick={onOpenAnalysis} type="button"><NavIcon name="trend" /></button><span className="daily-date-label">{formatDate(todayDateKey())}</span></div></header>
    <div className={`money-month-body${dragging ? " is-swipe-dragging" : ""}`} style={{ "--money-swipe-offset": `${offset}px` } as CSSProperties}>
      <div className="money-month-nav"><button aria-label="前の月" onClick={() => onMonthChange(shiftMonth(month, -1))} type="button">‹</button><h2>{formatMonth(month)}</h2><button aria-label="次の月" onClick={() => onMonthChange(shiftMonth(month, 1))} type="button">›</button></div>
      <section className="money-summary" aria-label="今月の見込み"><div><span>支出見込み</span><strong className="money-summary__expense">{(money?.summary.expenseForecast ?? 0).toLocaleString("ja-JP")}円</strong></div><div><span>収入見込み</span><strong className="money-summary__income">{(money?.summary.incomeForecast ?? 0).toLocaleString("ja-JP")}円</strong></div><div><span>残りそう</span><strong className={(money?.summary.remaining ?? 0) >= 0 ? "money-summary__income" : "money-summary__expense"}>{(money?.summary.remaining ?? 0).toLocaleString("ja-JP")}円</strong></div></section>
      <section className="money-list"><h2>今月のお金</h2>{occurrences.map((item) => { const key = item.occurrenceKey ?? item.id; return <article aria-label={item.title} className="tap-expand-row" key={key}><button aria-controls={openRow === key ? `money-detail-${key}` : undefined} aria-expanded={openRow === key} className="money-list-row" onClick={() => toggleRow(key)} type="button"><MoneyRowContent item={item} /></button>{openRow === key ? <MoneyInlineDetail id={`money-detail-${key}`} item={item} onActual={() => setActualItem(item)} onEdit={() => onEdit(item)} readOnly={offlineMode} /> : null}</article>; })}{occurrences.length === 0 ? <p className="empty-state">今月の記録はありません</p> : null}</section>
      <MoneyCategoryDonut occurrences={occurrences} />
    </div>
    <MoneyActualSheet key={actualItem?.occurrenceKey ?? "empty"} item={actualItem} onClose={() => setActualItem(null)} onSaved={onMoneyChanged} open={Boolean(actualItem)} />
  </main>;
}

const amountLabel = (amount: number | null | undefined) => amount === null || amount === undefined ? "—" : `${amount.toLocaleString("ja-JP")}円`;
const signedAmountLabel = (amount: number | null | undefined) => amount === null || amount === undefined ? "—" : `${amount >= 0 ? "+" : "−"}${Math.abs(amount).toLocaleString("ja-JP")}円`;

function MoneyYearChart({ data, mode, selectedMonth, onSelect }: { data: MoneyYearProjection; mode: MoneyChartMode; selectedMonth: string; onSelect: (month: string) => void }) {
  const width = 358;
  const height = 190;
  const left = 10;
  const right = 10;
  const top = 16;
  const bottom = 34;
  const values = data.months.map((month) => mode === "forecast" ? month.expenseForecast : month.expenseActual);
  const numericValues = values.filter((value): value is number => value !== null);
  const max = Math.max(1, ...numericValues);
  const xFor = (index: number) => left + index * ((width - left - right) / 11);
  const yFor = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) { if (current.length > 1) segments.push(current.join(" ")); current = []; return; }
    current.push(`${xFor(index)},${yFor(value)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  const selectedIndex = Math.max(0, data.months.findIndex((month) => month.month === selectedMonth));
  return <div aria-label="12か月の支出推移" className="money-year-chart" data-testid="money-year-chart">
    <svg aria-hidden="true" className="money-year-chart__svg" role="presentation" viewBox={`0 0 ${width} ${height}`}>
      {[0, .5, 1].map((ratio) => <line className="money-year-chart__grid" key={ratio} x1={left} x2={width - right} y1={yFor(max * ratio)} y2={yFor(max * ratio)} />)}
      {segments.map((segment, index) => <polyline className="money-year-chart__line" key={index} points={segment} />)}
      {values.map((value, index) => value === null ? null : <circle className={`money-year-chart__point${index === selectedIndex ? " is-selected" : ""}`} cx={xFor(index)} cy={yFor(value)} key={data.months[index].month} r={index === selectedIndex ? 4.5 : 3} />)}
    </svg>
    <div className="money-year-chart__hit-areas">{data.months.map((month, index) => <button aria-label={`${month.month.slice(5)}月の支出を表示`} aria-pressed={month.month === selectedMonth} className={`money-year-chart__hit-area${index === selectedIndex ? " is-selected" : ""}`} data-testid={`money-analysis-month-${month.month.slice(5)}`} key={month.month} onClick={() => onSelect(month.month)} type="button"><span>{Number(month.month.slice(5))}月</span></button>)}</div>
  </div>;
}

function MoneyAnalysisPage({ year, data, onYearChange, onBack }: { year: number; data: MoneyYearProjection | null; onYearChange: (year: number) => void; onBack: () => void }) {
  const [mode, setMode] = useState<MoneyChartMode>("forecast");
  const initialMonth = `${year}-${year === new Date().getFullYear() ? pad(new Date().getMonth() + 1) : "01"}`;
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const { clickCapture, dragging, offset, pointerCancel, pointerDown, pointerMove, pointerUp } = useHorizontalSwipe((direction) => onYearChange(year + (direction === "next" ? 1 : -1)));
  const selected = data?.months.find((month) => month.month === selectedMonth) ?? data?.months[0] ?? null;
  const summary = data?.summary;
  const categoryGroups = (data ? mode === "forecast" ? data.categoryForecast : data.categoryActual : []).filter((group) => mode === "forecast" ? group.amountForecast > 0 : group.amountActual > 0).map((group) => ({ amount: mode === "forecast" ? group.amountForecast : group.amountActual, color: moneyCategoryColor(group.category), colorKey: moneyCategoryColorKey(group.category), name: group.category?.name ?? "その他" }));
  const selectedActualAvailable = selected?.expenseActual !== null && selected?.expenseActual !== undefined;
  const monthlyAverageDivisor = data ? moneyAverageDivisorFor(year, data.currentMonth, mode) : null;
  const monthlyAverage = monthlyAverageDivisor === null ? null : (mode === "forecast" ? (summary?.expenseForecast ?? 0) : (summary?.expenseActual ?? 0)) / monthlyAverageDivisor;
  const selectedHeading = selected ? `${selected.month.slice(0, 4)}年${Number(selected.month.slice(5))}月` : "選択した月";
  return <main className="screen-page money-analysis-page" onClickCapture={clickCapture} onPointerCancel={pointerCancel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
    <header className="screen-header"><button aria-label="お金へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>お金の分析</h1><span className="header-spacer" /></header>
    <div className={`money-year-selector${dragging ? " is-swipe-dragging" : ""}`} style={{ "--money-year-swipe-offset": `${offset}px` } as CSSProperties}>
      <button aria-label="前年" onClick={() => onYearChange(year - 1)} type="button">‹</button><h2>{year}年</h2><button aria-label="翌年" onClick={() => onYearChange(year + 1)} type="button">›</button>
    </div>
    <MoneyModeToggle label="年間のお金の表示" mode={mode} onChange={setMode} />
    {!data ? <p className="empty-state">読み込み中</p> : <>
      <section className="money-analysis-section money-analysis-summary"><h2>年間のまとめ</h2><div className="money-summary"><div><span>{mode === "forecast" ? "年間の支出見込み" : "年間の確定支出"}</span><strong className="money-summary__expense">{amountLabel(mode === "forecast" ? summary?.expenseForecast : summary?.expenseActual)}</strong></div><div><span>{mode === "forecast" ? "年間の収入見込み" : "年間の確定収入"}</span><strong className="money-summary__income">{amountLabel(mode === "forecast" ? summary?.incomeForecast : summary?.incomeActual)}</strong></div><div><span>{mode === "forecast" ? "年間の収支見込み" : "年間の確定収支"}</span><strong className={((mode === "forecast" ? summary?.remainingForecast : summary?.remainingActual) ?? 0) >= 0 ? "money-summary__income" : "money-summary__expense"}>{signedAmountLabel(mode === "forecast" ? summary?.remainingForecast : summary?.remainingActual)}</strong></div><div><span>月平均支出</span><strong>{monthlyAverage === null ? "—" : amountLabel(Math.round(monthlyAverage))}</strong></div></div></section>
      <MoneyCategoryDonutVisual centerLabel={mode === "forecast" ? "年間の支出" : "確定した支出"} emptyMessage={mode === "forecast" ? "この年のカテゴリ別支出はありません" : "この年の確定したカテゴリ別支出はありません"} groups={categoryGroups} />
      <section className="money-analysis-section"><h2>月ごとの支出</h2>{(mode === "forecast" ? data.summary.expenseForecast > 0 : data.months.some((month) => (month.expenseActual ?? 0) > 0)) ? <MoneyYearChart data={data} mode={mode} onSelect={setSelectedMonth} selectedMonth={selectedMonth} /> : <p className="empty-state">この年の支出はまだありません</p>}{mode === "actual" && data.months.some((month) => month.expenseActual === null) ? <p className="money-chart-note">未来の月は、確定した支出がある月だけ表示しています。</p> : null}</section>
      <section className="money-analysis-section money-analysis-detail"><h2>{selectedHeading}</h2><div className="money-summary"><div><span>{mode === "forecast" ? "支出見込み" : "確定支出"}</span><strong className="money-summary__expense">{amountLabel(mode === "forecast" ? selected?.expenseForecast : selected?.expenseActual)}</strong></div><div><span>{mode === "forecast" ? "確定支出" : "確定収入"}</span><strong className={mode === "forecast" ? "money-summary__expense" : "money-summary__income"}>{amountLabel(mode === "forecast" ? selected?.expenseActual : selected?.incomeActual)}</strong></div><div><span>{mode === "forecast" ? "収入見込み" : "確定収支"}</span><strong className={mode === "forecast" ? "money-summary__income" : (selected?.remainingActual ?? 0) >= 0 ? "money-summary__income" : "money-summary__expense"}>{amountLabel(mode === "forecast" ? selected?.incomeForecast : selected?.remainingActual)}</strong></div><div><span>{mode === "forecast" ? "残りそう" : "支出見込み"}</span><strong className={mode === "forecast" ? ((selected?.remainingForecast ?? 0) >= 0 ? "money-summary__income" : "money-summary__expense") : "money-summary__expense"}>{amountLabel(mode === "forecast" ? selected?.remainingForecast : selected?.expenseForecast)}</strong></div></div>{mode === "actual" && !selectedActualAvailable ? <p className="money-chart-note">この月はまだ確定した支出がありません。</p> : null}</section>
    </>}
  </main>;
}

function MoneyDeleteConfirmSheet({ title, onClose, onConfirm, busy }: { title: string; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <BottomSheet open title="お金を削除" onClose={onClose}><div className="delete-confirm"><p>「{title}」を削除しますか？</p><p className="delete-confirm__note">削除した記録は一覧から表示されなくなります。</p><Button disabled={busy} onClick={onConfirm} variant="secondary">{busy ? "削除中…" : "削除する"}</Button><Button disabled={busy} onClick={onClose} variant="ghost">キャンセル</Button></div></BottomSheet>; }

const moneyCategoryColorLabels: Record<string, string> = { orange: "オレンジ", green: "グリーン", blue: "ブルー", purple: "パープル", red: "レッド", pink: "ピンク", gold: "ゴールド", gray: "グレー", yellow: "イエロー", teal: "ティール", cyan: "シアン", indigo: "インディゴ", brown: "ブラウン", lime: "ライム", "blue-gray": "ブルーグレー" };
function MoneyCategoryColorPicker({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void }) {
  return <BottomSheet open={open} title="色を選択" onClose={onClose}><div aria-label="カテゴリ色" className="money-category-color-picker" role="radiogroup">{MONEY_CATEGORY_COLOR_KEYS.map((key) => <button aria-label={moneyCategoryColorLabels[key] ?? key} aria-pressed={value === key} className="money-category-color-option" key={key} onClick={() => { onChange(key); onClose(); }} type="button"><span aria-hidden="true" className="money-category-color-swatch" data-color-key={key} style={{ backgroundColor: moneyCategoryColor({ colorKey: key }) }} /><span>{moneyCategoryColorLabels[key] ?? key}</span>{value === key ? <span aria-hidden="true">✓</span> : null}</button>)}</div></BottomSheet>;
}
function MoneyCategoryColorField({ value, onClick }: { value: string; onClick: () => void }) {
  return <FormRow ariaLabel="色を変更" label="色" onClick={onClick}><span className="money-category-color-summary"><span aria-hidden="true" className="money-category-color-swatch" style={{ backgroundColor: moneyCategoryColor({ colorKey: value }) }} />{moneyCategoryColorLabels[value] ?? value}</span></FormRow>;
}
export function MoneyCategorySettings() {
  const [categories, setCategories] = useState<MoneyCategory[]>([]); const [type, setType] = useState<MoneyType>("expense"); const [editing, setEditing] = useState<string | null>(null); const [openRow, setOpenRow] = useState<string | null>(null); const [colorOpen, setColorOpen] = useState(false); const [name, setName] = useState(""); const [colorKey, setColorKey] = useState<string>("orange"); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(""); try { const { categories: next } = await getMoneyCategories(undefined, true); setCategories(next ?? []); } catch (caught) { setError(caught instanceof Error ? caught.message : "カテゴリを読み込めませんでした。"); } finally { setLoading(false); } }; // This effect starts an external data load and intentionally enters its loading state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);
  const start = (category?: MoneyCategory) => { setEditing(category?.id ?? "new"); setName(category?.name ?? ""); setColorKey(category?.colorKey ?? nextMoneyCategoryColorKey(categories.filter((item) => item.type === type), type)); setError(""); };
  const save = async () => { if (!editing || busy) return; setBusy(true); setError(""); try { if (editing === "new") { const result = await createMoneyCategory({ type, name, colorKey }); setCategories((current) => [...current, result.category]); } else { const result = await updateMoneyCategory(editing, { name, colorKey }); setCategories((current) => current.map((category) => category.id === editing ? result.category : category)); } setEditing(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした。"); } finally { setBusy(false); } };
  const deactivate = async (id: string) => { if (busy) return; setBusy(true); setError(""); try { await deleteMoneyCategory(id); setCategories((current) => current.map((category) => category.id === id ? { ...category, active: false } : category)); } catch (caught) { setError(caught instanceof Error ? caught.message : "変更できませんでした。"); } finally { setBusy(false); } };
  const filtered = categories.filter((category) => category.type === type);
  if (loading) return <section className="money-category-settings"><p className="empty-state" role="status">カテゴリを読み込み中…</p></section>;
  return <section className="money-category-settings" onPointerDownCapture={(event) => { if (openRow && !(event.target instanceof Element && event.target.closest(".event-swipe-row"))) setOpenRow(null); }}><div className="money-type-switch" role="group" aria-label="カテゴリ種類"><button aria-pressed={type === "expense"} className={type === "expense" ? "is-selected" : ""} onClick={() => setType("expense")} type="button">支出カテゴリ</button><button aria-pressed={type === "income"} className={type === "income" ? "is-selected" : ""} onClick={() => setType("income")} type="button">収入カテゴリ</button></div>{filtered.map((category) => { const row = <div className={`money-category-row${category.active ? "" : " is-inactive"}`}><span className="money-category-dot" data-color-key={moneyCategoryColorKey(category)} style={{ backgroundColor: moneyCategoryColor(category) }} /><span>{category.name}{category.active ? "" : "（無効）"}</span></div>; return editing === category.id ? <div key={category.id} className="money-category-row"><div className="money-category-editor"><Input aria-label="カテゴリ名" onChange={setName} value={name} /><MoneyCategoryColorField value={colorKey} onClick={() => setColorOpen(true)} /><Button disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中…" : "保存"}</Button></div></div> : <SwipeActionRow actions={[{ label: "編集", onClick: () => { setOpenRow(null); start(category); } }, ...(category.active ? [{ label: "無効化", onClick: () => { void deactivate(category.id); }, variant: "danger" as const }] : [])]} ariaLabel={category.name} key={category.id} onOpenChange={(open) => setOpenRow(open ? category.id : null)} onOtherRowTouch={() => setOpenRow(category.id)} open={openRow === category.id}>{row}</SwipeActionRow>; })}{editing === "new" ? <div className="money-category-editor"><Input aria-label="新しいカテゴリ名" onChange={setName} value={name} /><MoneyCategoryColorField value={colorKey} onClick={() => setColorOpen(true)} /><Button disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中…" : "作成"}</Button></div> : <Button disabled={busy} onClick={() => start()} variant="secondary">カテゴリを追加</Button>}{error ? <div className="settings-error"><p className="form-error" role="alert">{error}</p><Button disabled={busy} onClick={() => { void load(); }} variant="ghost">再試行</Button></div> : null}<MoneyCategoryColorPicker open={colorOpen} onChange={setColorKey} onClose={() => setColorOpen(false)} value={colorKey} /></section>;
}

const timezoneOptions = ["Asia/Tokyo", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London"];
export function CalendarSettings({ settings, onSettingsChange }: { settings: UserSettings | null; onSettingsChange: (settings: UserSettings) => void }) {
  const [open, setOpen] = useState<"timezone" | "weekStartsOn" | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const current = settings ?? { timezone: "Asia/Tokyo", weekStartsOn: 1 };
  const save = async (patch: Partial<UserSettings>) => { if (busy || !settings) return; setBusy(true); setError(""); try { const result = await updateSettings(patch); onSettingsChange(result.settings); setOpen(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "カレンダー設定を保存できませんでした。"); } finally { setBusy(false); } };
  const options = open === "timezone" ? timezoneOptions : [{ label: "日曜日", value: "0" }, { label: "月曜日", value: "1" }];
  return <section className="calendar-settings"><FormRow ariaLabel="タイムゾーンを変更" disabled={busy} label="タイムゾーン" onClick={() => { if (!busy) setOpen("timezone"); }} summary={current.timezone} /><FormRow ariaLabel="週の開始を変更" disabled={busy} label="週の開始" onClick={() => { if (!busy) setOpen("weekStartsOn"); }} summary={weekDayLabel(current.weekStartsOn)} />{busy ? <p className="settings-status" role="status">保存中…</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<BottomSheet open={Boolean(open)} title={open === "timezone" ? "タイムゾーン" : "週の開始"} onClose={() => setOpen(null)}><div className="event-option-sheet">{options.map((option) => { const value = typeof option === "string" ? option : option.value; const label = typeof option === "string" ? option : option.label; const selected = open === "timezone" ? current.timezone === value : String(current.weekStartsOn) === value; return <button aria-pressed={selected} className="event-option-sheet__option" disabled={busy} key={value} onClick={() => { void save(open === "timezone" ? { timezone: value } : { weekStartsOn: Number(value) }); }} type="button"><span>{label}</span>{selected ? <span aria-hidden="true">✓</span> : null}</button>; })}</div></BottomSheet></section>;
}

const weekDayLabel = (value: number) => ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][value] ?? "月曜日";
type ArchiveUiState = "idle" | "candidate" | "saving" | "complete" | "confirm_pending" | "error";
const archiveStateLabel: Record<ArchiveUiState, string> = { idle: "未確認", candidate: "候補あり", saving: "保存中…", complete: "アーカイブ完了", confirm_pending: "確認待ち", error: "確認できませんでした" };
function ArchiveSettings({ metadata, state, candidate, error, onCheck }: { metadata: ArchiveMetadata[]; state: ArchiveUiState; candidate: ArchiveCandidateResponse | null; error: string; onCheck: () => void }) {
  const recordCount = metadata.reduce((total, item) => total + item.recordCount, 0);
  const firstDate = metadata.map((item) => item.minDate).filter((date): date is string => Boolean(date)).sort()[0];
  const latest = metadata[0]?.archivedAt ? formatDate(metadata[0].archivedAt.slice(0, 10), true) : "—";
  const candidateCount = candidate ? archiveRecordCount(candidate.records) : 0;
  return <section className="archive-settings" aria-label="ローカルアーカイブ"><div className="archive-status-row"><span>端末に保存済み</span><strong>{recordCount > 0 ? `${firstDate ? `${firstDate}から` : "履歴"}・${recordCount}件` : "まだありません"}</strong></div><div className="archive-status-row"><span>クラウドに保存</span><strong>直近12か月</strong></div><div className="archive-status-row"><span>状態</span><strong>{archiveStateLabel[state]}{state === "candidate" ? `（${candidateCount}件）` : ""}</strong></div><div className="archive-status-row"><span>最終確認</span><strong>{latest}</strong></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={state === "saving"} onClick={onCheck} variant="secondary">{state === "saving" ? "保存中…" : "アーカイブを確認"}</Button><p className="archive-note">古い履歴を端末に保存してから、クラウドの整理を確認します。</p></section>;
}
function SettingsDetailPage({ accountFeedback, detail, user, settings, archiveMetadata, archiveState, archiveCandidate, archiveError, onArchiveCheck, onBack, onBackToAccount, onLogout, onSettingsChange, onMigrationStarted, onOpenPassword, onPasswordChanged }: { accountFeedback: string; detail: SettingsDetail; user: AuthUser; settings: UserSettings | null; archiveMetadata: ArchiveMetadata[]; archiveState: ArchiveUiState; archiveCandidate: ArchiveCandidateResponse | null; archiveError: string; onArchiveCheck: () => void; onBack: () => void; onBackToAccount: () => void; onLogout: () => void; onSettingsChange: (settings: UserSettings) => void; onMigrationStarted: (migrationId: string) => void; onOpenPassword: () => void; onPasswordChanged: () => void }) {
  if (detail === "guide") return <GuidePage onClose={onBack} />;
  const titles: Record<SettingsDetail, string> = { account: "アカウント", password: "パスワードを変更", notifications: "通知", calendar: "カレンダー", money: "お金", data: "データ / バックアップ", guide: "使い方" };
  const body = detail === "account" ? <AccountSettings onChangePassword={onOpenPassword} onLogout={onLogout} successMessage={accountFeedback} user={user} /> : detail === "password" ? <PasswordChangeSettings onCompleted={onPasswordChanged} /> : detail === "notifications" ? <NotificationSettingsSection onSettingsChange={onSettingsChange} settings={settings} /> : detail === "calendar" ? <CalendarSettings onSettingsChange={onSettingsChange} settings={settings} /> : detail === "money" ? <MoneyCategorySettings /> : <><BackupSettings onMigrationStarted={onMigrationStarted} userId={user.id} /><ArchiveSettings candidate={archiveCandidate} error={archiveError} metadata={archiveMetadata} onCheck={onArchiveCheck} state={archiveState} /></>;
  const back = detail === "password" ? onBackToAccount : onBack;
  return <main className="screen-page settings-page"><header className="screen-header"><button aria-label={detail === "password" ? "アカウントへ戻る" : "設定へ戻る"} className="back-button" onClick={back} type="button">‹</button><h1>{titles[detail]}</h1><span className="header-spacer" /></header><section className="settings-detail-list">{body}</section></main>;
}
function SettingsShell({ user, settings, settingsLoad, detail, archiveMetadata, archiveState, archiveCandidate, archiveError, onArchiveCheck, onRetrySettings, onOpenDetail, onBack, onLogout, onSettingsChange, onMigrationStarted }: { user: AuthUser; settings: UserSettings | null; settingsLoad: DataLoadState; detail: SettingsDetail | null; archiveMetadata: ArchiveMetadata[]; archiveState: ArchiveUiState; archiveCandidate: ArchiveCandidateResponse | null; archiveError: string; onArchiveCheck: () => void; onRetrySettings: () => void; onOpenDetail: (detail: SettingsDetail) => void; onBack: () => void; onLogout: () => void; onSettingsChange: (settings: UserSettings) => void; onMigrationStarted: (migrationId: string) => void }) {
  const [accountFeedback, setAccountFeedback] = useState("");
  const openPassword = () => { setAccountFeedback(""); onOpenDetail("password"); };
  const backToAccount = () => { window.history.replaceState({}, "", "/settings/account"); window.dispatchEvent(new PopStateEvent("popstate")); };
  const passwordChanged = () => { setAccountFeedback("パスワードを変更しました。"); backToAccount(); };
  if (settingsLoad !== "success") return <main className="screen-page settings-page"><header className="screen-header"><h1>設定</h1></header><DataStateMessage onRetry={onRetrySettings} state={settingsLoad} /></main>;
  if (detail) return <SettingsDetailPage accountFeedback={accountFeedback} archiveCandidate={archiveCandidate} archiveError={archiveError} archiveMetadata={archiveMetadata} archiveState={archiveState} detail={detail} onArchiveCheck={onArchiveCheck} onBack={onBack} onBackToAccount={backToAccount} onLogout={onLogout} onMigrationStarted={onMigrationStarted} onOpenPassword={openPassword} onPasswordChanged={passwordChanged} onSettingsChange={onSettingsChange} settings={settings} user={user} />;
  return <main className="screen-page settings-page"><header className="screen-header"><h1>設定</h1></header><section className="settings-root-list"><FormRow ariaLabel="アカウントを開く" label="アカウント" onClick={() => onOpenDetail("account")} /><FormRow ariaLabel="通知を開く" label="通知" onClick={() => onOpenDetail("notifications")} /><FormRow ariaLabel="カレンダーを開く" label="カレンダー" onClick={() => onOpenDetail("calendar")} /><FormRow ariaLabel="お金を開く" label="お金" onClick={() => onOpenDetail("money")} /><FormRow ariaLabel="データとバックアップを開く" label="データ / バックアップ" onClick={() => onOpenDetail("data")} /><FormRow ariaLabel="使い方を開く" label="使い方" onClick={() => onOpenDetail("guide")} /></section></main>;
}
function AddChoiceSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (choice: AddChoice) => void }) { return <BottomSheet open={open} onClose={onClose} title="追加"><div className="choice-list"><FormRow ariaLabel="家を追加" chevron={false} label="家" onClick={() => onSelect("家")} /><FormRow ariaLabel="仕事を追加" chevron={false} label="仕事" onClick={() => onSelect("仕事")} /><FormRow ariaLabel="お金を追加" chevron={false} label="お金" onClick={() => onSelect("お金")} /></div></BottomSheet>; }

export function App() {
  const linkedDate = notificationDateFromPath(); const [user, setUser] = useState<AuthUser | null>(null); const [settings, setSettings] = useState<UserSettings | null>(null); const [settingsLoad, setSettingsLoad] = useState<DataLoadState>("loading"); const [userState, setUserState] = useState<{ migrationState: "active" | "migration_locked" } | null>(null); const [migrationId, setMigrationId] = useState<string | undefined>(); const [authChecked, setAuthChecked] = useState(false); const [authError, setAuthError] = useState(""); const [snapshotMetadata, setSnapshotMetadata] = useState<{ userId: string; timezone: string; weekStartsOn: number } | null>(null); const [offlineMode, setOfflineMode] = useState(false); const [offlineSavedAt, setOfflineSavedAt] = useState<number | null>(null); const [screen, setScreen] = useState<Screen>(screenFromPath); const [settingsDetail, setSettingsDetail] = useState<SettingsDetail | null>(settingsDetailFromPath()); const [events, setEvents] = useState<Event[]>([]); const [moneyProjection, setMoneyProjection] = useState<MoneyProjection | null>(null); const [moneyYearProjection, setMoneyYearProjection] = useState<MoneyYearProjection | null>(null); const [dailyNote, setDailyNote] = useState<DailyNote | null>(null); const [month, setMonth] = useState(monthStart(linkedDate ?? todayDateKey())); const [moneyMonth, setMoneyMonth] = useState(monthStart(linkedDate ?? todayDateKey())); const [analysisYear, setAnalysisYear] = useState(new Date().getFullYear()); const [dailyDate, setDailyDate] = useState(linkedDate ?? todayDateKey()); const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>("all"); const [dailyFilter, setDailyFilter] = useState<CalendarFilter>("all"); const [selectedDate, setSelectedDate] = useState<string | null>(linkedDate); const [dateSheetOpen, setDateSheetOpen] = useState(Boolean(linkedDate)); const [addOpen, setAddOpen] = useState(false); const [pendingAddContext, setPendingAddContext] = useState<MoneyReturnContext | null>(null); const [formState, setFormState] = useState<{ category: Event["category"]; initialDate: string; event?: Event; returnTo: ReturnContext; scope?: EventScope } | null>(null); const [moneyFormState, setMoneyFormState] = useState<{ initialDate: string; item?: MoneyItem; returnTo: MoneyReturnContext; scope?: EventScope } | null>(null); const [detailState, setDetailState] = useState<{ event: Event; returnTo: ReturnContext } | null>(null); const [scopeState, setScopeState] = useState<{ event: Event; returnTo: ReturnContext; action: "edit" | "delete" } | null>(null); const [moneyScopeState, setMoneyScopeState] = useState<{ item: MoneyItem; returnTo: MoneyReturnContext; action: "edit" | "delete" } | null>(null); const [deleteTarget, setDeleteTarget] = useState<{ event: Event; returnTo: ReturnContext; scope: EventScope } | null>(null); const [moneyDeleteTarget, setMoneyDeleteTarget] = useState<{ item: MoneyItem; scope: EventScope; returnTo: MoneyReturnContext } | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [moneyDeleteOpen, setMoneyDeleteOpen] = useState(false); const [deleteBusy, setDeleteBusy] = useState(false); const [selectionNote, setSelectionNote] = useState(""); const [archiveRows, setArchiveRows] = useState<ArchiveRecord[]>([]); const [archiveMetadata, setArchiveMetadata] = useState<ArchiveMetadata[]>([]); const [archiveState, setArchiveState] = useState<ArchiveUiState>("idle"); const [archiveCandidate, setArchiveCandidate] = useState<ArchiveCandidateResponse | null>(null); const [archiveError, setArchiveError] = useState(""); const [reloadNonce, setReloadNonce] = useState(0); const [calendarLoad, setCalendarLoad] = useState<DataLoadState>("loading"); const [dailyLoad, setDailyLoad] = useState<DataLoadState>("loading"); const [moneyLoad, setMoneyLoad] = useState<DataLoadState>("loading"); const [analysisLoad, setAnalysisLoad] = useState<DataLoadState>("loading"); const [calendarDataReady, setCalendarDataReady] = useState(false); const [dailyDataReady, setDailyDataReady] = useState(false); const [moneyDataReady, setMoneyDataReady] = useState(false); const [moneyReadyKey, setMoneyReadyKey] = useState<string | null>(null);
  const calendarRawRef = useRef<{ key: string; data: CalendarSnapshotData } | null>(null);
  const dailyRawRef = useRef<{ key: string; data: DailySnapshotData } | null>(null);
  const moneyRawRef = useRef<{ key: string; data: MoneyProjection } | null>(null);
  const calendarGenerationRef = useRef(0);
  const dailyGenerationRef = useRef(0);
  const calendarSequenceRef = useRef(0);
  const dailySequenceRef = useRef(0);
  const calendarLatestStartedRef = useRef(0);
  const dailyLatestStartedRef = useRef(0);
  const calendarMutationRevisionRef = useRef(0);
  const dailyMutationRevisionRef = useRef(0);
  const calendarAuthoritativeRef = useRef(false);
  const dailyAuthoritativeRef = useRef(false);
  const calendarControllerRef = useRef<AbortController | null>(null);
  const calendarPrefetchRef = useRef(new Map<string, CalendarPrefetchEntry>());
  const dailyControllerRef = useRef<AbortController | null>(null);
  const moneyGenerationRef = useRef(0);
  const moneySequenceRef = useRef(0);
  const moneyLatestStartedRef = useRef(0);
  const moneyMutationRevisionRef = useRef(0);
  const moneyAuthoritativeRef = useRef(false);
  const moneyControllerRef = useRef<AbortController | null>(null);
  const moneyPrefetchRef = useRef(new Map<string, MoneyPrefetchEntry>());
  const archiveRowsRef = useRef<ArchiveRecord[]>([]);
  const archiveMetadataRef = useRef<ArchiveMetadata[]>([]);
  useEffect(() => {
    archiveRowsRef.current = archiveRows;
    archiveMetadataRef.current = archiveMetadata;
  }, [archiveMetadata, archiveRows]);
  const serverSnapshotContext = settingsLoad === "success" && settings && user?.id === settings.userId ? { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn } : null;
  const metadataSnapshotContext = snapshotMetadata && user?.id === snapshotMetadata.userId ? { timezone: snapshotMetadata.timezone, weekStartsOn: snapshotMetadata.weekStartsOn } : null;
  const snapshotContext = serverSnapshotContext ?? metadataSnapshotContext;
  const applySettingsState = (nextSettings: UserSettings) => {
    const metadataChanged = snapshotMetadata && snapshotMetadata.userId === nextSettings.userId && (snapshotMetadata.timezone !== nextSettings.timezone || snapshotMetadata.weekStartsOn !== nextSettings.weekStartsOn);
    if ((settings && (settings.timezone !== nextSettings.timezone || settings.weekStartsOn !== nextSettings.weekStartsOn)) || metadataChanged) invalidateActiveSnapshotEpoch();
    setSettings(nextSettings);
  };
  // Settings bootstrap intentionally runs once; identity-dependent data effects observe the resulting settings state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { let active = true; void authMe().then(async ({ user: authenticatedUser }) => { if (!active) return; setUser(authenticatedUser); saveLastAuthUser(authenticatedUser); setOfflineMode(false); setOfflineSavedAt(null); setSnapshotMetadata(null); setSettingsLoad("loading"); setAuthChecked(true); void readActiveSnapshotMetadata(authenticatedUser.id).then((metadata) => { if (active && metadata) setSnapshotMetadata({ userId: metadata.userId, timezone: metadata.timezone, weekStartsOn: metadata.weekStartsOn }); }); const [result, stateResult] = await Promise.all([getSettings().catch(() => null), getUserState().catch(() => null)]); if (!active) return; if (result) { applySettingsState(result.settings); setSettingsLoad("success"); void writeActiveSnapshotMetadata(authenticatedUser.id, result.settings.timezone, result.settings.weekStartsOn); saveLastAuthSnapshotContext(authenticatedUser.id, result.settings.timezone, result.settings.weekStartsOn); } else setSettingsLoad("error"); if (stateResult) setUserState(stateResult.state); }).catch((error: unknown) => { if (!active) return; const status = apiErrorStatus(error); if (status === 401) { clearLastAuthUser(); setAuthChecked(true); return; } if (status !== null) { setAuthError("ログイン状態を確認できませんでした。"); setAuthChecked(true); return; } const lastUser = readLastAuthUser(); if (!lastUser) { setAuthError("ログイン状態を確認できませんでした。"); setAuthChecked(true); return; } setUser(lastUser); setOfflineMode(true); setSettingsLoad("error"); setAuthChecked(true); const storedContext = readLastAuthSnapshotContext(lastUser.id); if (storedContext) { setSnapshotMetadata({ userId: lastUser.id, timezone: storedContext.timezone, weekStartsOn: storedContext.weekStartsOn }); setOfflineSavedAt(storedContext.savedAt); void getActiveSnapshotSavedAt({ userId: lastUser.id, timezone: storedContext.timezone, weekStartsOn: storedContext.weekStartsOn, month }).then((savedAt) => { if (active && savedAt) setOfflineSavedAt(savedAt); }); } void readActiveSnapshotMetadata(lastUser.id).then((metadata) => { if (!active || !metadata) return; setSnapshotMetadata({ userId: metadata.userId, timezone: metadata.timezone, weekStartsOn: metadata.weekStartsOn }); if (!storedContext) setOfflineSavedAt(metadata.savedAt); }); }); const syncLocation = () => { const nextScreen = screenFromPath(); const nextDate = notificationDateFromPath(); setScreen(nextScreen); setSettingsDetail(nextScreen === "settings" ? settingsDetailFromPath() : null); if (nextScreen === "daily") { const restoredDate = nextDate ?? todayDateKey(); setDailyDate(restoredDate); setMonth(monthStart(restoredDate)); } if (nextScreen === "calendar") { setSelectedDate(nextDate); setDateSheetOpen(Boolean(nextDate)); if (nextDate) setMonth(monthStart(nextDate)); } else { setDateSheetOpen(false); } }; const onPopState = syncLocation; window.addEventListener("popstate", onPopState); return () => { active = false; window.removeEventListener("popstate", onPopState); }; }, []);
  // Offline recovery intentionally re-runs only the auth/settings bootstrap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!offlineMode) return; const onOnline = () => { void authMe().then(({ user: authenticatedUser }) => { saveLastAuthUser(authenticatedUser); setUser(authenticatedUser); setOfflineMode(false); setOfflineSavedAt(null); setReloadNonce((current) => current + 1); void Promise.all([getSettings().catch(() => null), getUserState().catch(() => null)]).then(([result, stateResult]) => { if (result) { applySettingsState(result.settings); setSettingsLoad("success"); void writeActiveSnapshotMetadata(authenticatedUser.id, result.settings.timezone, result.settings.weekStartsOn); saveLastAuthSnapshotContext(authenticatedUser.id, result.settings.timezone, result.settings.weekStartsOn); } if (stateResult) setUserState(stateResult.state); }); }).catch(() => undefined); }; window.addEventListener("online", onOnline); return () => window.removeEventListener("online", onOnline); }, [offlineMode]);
  useEffect(() => { if (!user || userState?.migrationState === "migration_locked") return; let active = true; void Promise.all([getArchiveRows(user.id), getArchiveMetadata(user.id)]).then(([rows, metadata]) => { if (!active) return; setArchiveRows(rows); setArchiveMetadata(metadata); setArchiveState(metadata.some((item) => item.status === "confirm_pending") ? "confirm_pending" : metadata.some((item) => item.status === "confirmed") ? "complete" : "idle"); }).catch(() => { if (active) setArchiveRows([]); }); return () => { active = false; }; }, [user, userState?.migrationState]);
  useEffect(() => {
    if (!user || !snapshotContext || screen !== "calendar") return;
    const identity = { userId: user.id, ...snapshotContext, month };
    const key = calendarSnapshotKey(identity);
    const generation = ++calendarGenerationRef.current;
    const sequence = ++calendarSequenceRef.current;
    calendarLatestStartedRef.current = sequence;
    const mutationRevision = calendarMutationRevisionRef.current;
    const requestEpoch = getActiveSnapshotEpoch();
    const controller = new AbortController();
    calendarControllerRef.current = controller;
    let active = true;
    calendarAuthoritativeRef.current = false;
    const apply = (data: CalendarSnapshotData) => {
      if (!active || calendarGenerationRef.current !== generation || calendarLatestStartedRef.current !== sequence || calendarMutationRevisionRef.current !== mutationRevision) return;
      calendarRawRef.current = { key, data };
      const localEvents = archiveEventsForRange(archiveRowsRef.current, user.id, data.range, snapshotContext.weekStartsOn);
      const localMoney = archiveMoneyForRange(archiveRowsRef.current, user.id, data.range, snapshotContext.weekStartsOn);
      const retentionBoundary = archiveMetadataRef.current[0]?.retentionBoundary;
      setEvents(mergeProjectedEvents(data.events, localEvents, retentionBoundary));
      setMoneyProjection(mergeMoneyProjections(data.money, localMoney, retentionBoundary));
      setCalendarDataReady(true);
    };
    const queuePrefetch = (targetMonth: string) => {
      const targetIdentity = { userId: user.id, ...snapshotContext, month: targetMonth };
      const targetKey = calendarSnapshotKey(targetIdentity);
      const existing = calendarPrefetchRef.current.get(targetKey);
      if (existing?.phase === "scheduled" || existing?.phase === "in-flight") return;
      if (existing?.completedAt && Date.now() - existing.completedAt < CALENDAR_PREFETCH_TTL_MS) return;
      const entry: CalendarPrefetchEntry = { phase: "scheduled" };
      calendarPrefetchRef.current.set(targetKey, entry);
      scheduleBackgroundWork(() => {
        if (!active || requestEpoch !== getActiveSnapshotEpoch() || calendarMutationRevisionRef.current !== mutationRevision) {
          if (calendarPrefetchRef.current.get(targetKey) === entry) calendarPrefetchRef.current.delete(targetKey);
          return;
        }
        entry.phase = "in-flight";
        const prefetchController = new AbortController();
        entry.controller = prefetchController;
        void (async () => {
          try {
            const savedAt = await getActiveSnapshotSavedAt(targetIdentity);
            if (!active || requestEpoch !== getActiveSnapshotEpoch() || calendarMutationRevisionRef.current !== mutationRevision) return;
            if (savedAt !== null && Date.now() - savedAt < CALENDAR_PREFETCH_TTL_MS) {
              entry.completedAt = savedAt;
              return;
            }
            const result = await getCalendar(targetMonth, prefetchController.signal);
            const data: CalendarSnapshotData = { month: result.month ?? targetMonth.slice(0, 7), range: result.range, events: result.events ?? [], money: result.money };
            if (!isCalendarSnapshotData(data) || data.month !== targetMonth.slice(0, 7)) throw new Error("Calendar prefetch response was invalid");
            if (!active || requestEpoch !== getActiveSnapshotEpoch() || calendarMutationRevisionRef.current !== mutationRevision) return;
            const written = await writeServerConfirmedActiveSnapshot(targetIdentity, data, isCalendarSnapshotData, requestEpoch, { evictCalendarSnapshots: { preserveMonths: [month, shiftMonth(month, -1), shiftMonth(month, 1), targetMonth] } });
            if (written) entry.completedAt = Date.now();
          } catch (error) {
            if (!prefetchController.signal.aborted && !isAbortError(error)) {
              // Prefetch is an optional acceleration layer; the visible month is unaffected.
            }
          } finally {
            if (calendarPrefetchRef.current.get(targetKey) === entry && entry.completedAt === undefined) calendarPrefetchRef.current.delete(targetKey);
          }
        })();
      });
    };
    const memory = readMemoryActiveSnapshot(identity, isCalendarSnapshotData);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarDataReady(Boolean(memory));
    setCalendarLoad(memory ? "refreshing" : "loading");
    if (memory) apply(memory);
    const persistentRead = memory ? Promise.resolve(null) : readPersistentActiveSnapshot(identity, isCalendarSnapshotData);
    void persistentRead.then((cached) => {
      if (!cached || calendarAuthoritativeRef.current || !active || calendarGenerationRef.current !== generation || requestEpoch !== getActiveSnapshotEpoch()) return;
      apply(cached);
      setCalendarLoad("refreshing");
    });
    void getCalendar(month, controller.signal).then((result) => {
      const data: CalendarSnapshotData = { month: result.month ?? month.slice(0, 7), range: result.range, events: result.events ?? [], money: result.money };
      if (!isCalendarSnapshotData(data) || data.month !== month.slice(0, 7)) throw new Error("Calendar snapshot response was invalid");
      if (!active || calendarGenerationRef.current !== generation || calendarLatestStartedRef.current !== sequence || calendarMutationRevisionRef.current !== mutationRevision || requestEpoch !== getActiveSnapshotEpoch()) return;
      calendarAuthoritativeRef.current = true;
      apply(data);
      setCalendarLoad("success");
      void writeServerConfirmedActiveSnapshot(identity, data, isCalendarSnapshotData, requestEpoch, { evictCalendarSnapshots: { preserveMonths: [month, shiftMonth(month, -1), shiftMonth(month, 1)] } });
      queuePrefetch(shiftMonth(month, -1));
      queuePrefetch(shiftMonth(month, 1));
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted || isAbortError(error) || calendarGenerationRef.current !== generation || calendarLatestStartedRef.current !== sequence) return;
      setCalendarLoad("error");
    });
    return () => { active = false; controller.abort(); if (calendarControllerRef.current === controller) calendarControllerRef.current = null; };
  // The effect intentionally depends on stable identity primitives; archive data is read through refs and reconciled separately below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, reloadNonce, screen, settings?.timezone, settings?.weekStartsOn, snapshotMetadata?.timezone, snapshotMetadata?.weekStartsOn, user?.id]);
  useEffect(() => {
    if (!user || !snapshotContext || screen !== "daily") return;
    const identity = { userId: user.id, ...snapshotContext, date: dailyDate };
    const key = dailySnapshotKey(identity);
    const generation = ++dailyGenerationRef.current;
    const sequence = ++dailySequenceRef.current;
    dailyLatestStartedRef.current = sequence;
    const mutationRevision = dailyMutationRevisionRef.current;
    const requestEpoch = getActiveSnapshotEpoch();
    const controller = new AbortController();
    dailyControllerRef.current = controller;
    let active = true;
    dailyAuthoritativeRef.current = false;
    const apply = (data: DailySnapshotData) => {
      if (!active || dailyGenerationRef.current !== generation || dailyLatestStartedRef.current !== sequence || dailyMutationRevisionRef.current !== mutationRevision) return;
      dailyRawRef.current = { key, data };
      const range = { startDate: data.date, endDate: data.date };
      const localEvents = archiveEventsForRange(archiveRowsRef.current, user.id, range, snapshotContext.weekStartsOn);
      const localMoney = archiveMoneyForRange(archiveRowsRef.current, user.id, range, snapshotContext.weekStartsOn);
      const retentionBoundary = archiveMetadataRef.current[0]?.retentionBoundary;
      setEvents(mergeProjectedEvents(data.events, localEvents, retentionBoundary));
      setMoneyProjection(mergeMoneyProjections(data.money, localMoney, retentionBoundary));
      setDailyNote(data.dailyNote ?? archiveDailyNoteForDate(archiveRowsRef.current, user.id, data.date));
      setDailyDataReady(true);
    };
    const memory = readMemoryActiveSnapshot(identity, isDailySnapshotData);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDailyDataReady(Boolean(memory));
    setDailyLoad(memory ? "refreshing" : "loading");
    if (memory) apply(memory);
    const persistentRead = memory ? Promise.resolve(null) : readPersistentActiveSnapshot(identity, isDailySnapshotData);
    void persistentRead.then((cached) => {
      if (!cached || dailyAuthoritativeRef.current || !active || dailyGenerationRef.current !== generation || requestEpoch !== getActiveSnapshotEpoch()) return;
      apply(cached);
      setDailyLoad("refreshing");
    });
    void getDaily(dailyDate, controller.signal).then((result) => {
      const data: DailySnapshotData = { date: result.date, events: result.events ?? [], dailyNote: result.dailyNote ?? null, money: result.money };
      if (!isDailySnapshotData(data) || data.date !== dailyDate) throw new Error("Daily snapshot response was invalid");
      if (!active || dailyGenerationRef.current !== generation || dailyLatestStartedRef.current !== sequence || dailyMutationRevisionRef.current !== mutationRevision || requestEpoch !== getActiveSnapshotEpoch()) return;
      dailyAuthoritativeRef.current = true;
      apply(data);
      setDailyLoad("success");
      void writeServerConfirmedActiveSnapshot(identity, data, isDailySnapshotData, requestEpoch);
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted || isAbortError(error) || dailyGenerationRef.current !== generation || dailyLatestStartedRef.current !== sequence) return;
      setDailyLoad("error");
    });
    return () => { active = false; controller.abort(); if (dailyControllerRef.current === controller) dailyControllerRef.current = null; };
  // The effect intentionally depends on stable identity primitives; archive data is read through refs and reconciled separately below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDate, reloadNonce, screen, settings?.timezone, settings?.weekStartsOn, snapshotMetadata?.timezone, snapshotMetadata?.weekStartsOn, user?.id]);
  useEffect(() => {
    if (!user || !snapshotContext) return;
    if (screen === "calendar" && calendarRawRef.current?.key === calendarSnapshotKey({ userId: user.id, ...snapshotContext, month })) {
      const data = calendarRawRef.current.data;
      const localEvents = archiveEventsForRange(archiveRows, user.id, data.range, snapshotContext.weekStartsOn);
      const localMoney = archiveMoneyForRange(archiveRows, user.id, data.range, snapshotContext.weekStartsOn);
      const retentionBoundary = archiveMetadata[0]?.retentionBoundary;
      setEvents(mergeProjectedEvents(data.events, localEvents, retentionBoundary));
      setMoneyProjection(mergeMoneyProjections(data.money, localMoney, retentionBoundary));
    }
    if (screen === "daily" && dailyRawRef.current?.key === dailySnapshotKey({ userId: user.id, ...snapshotContext, date: dailyDate })) {
      const data = dailyRawRef.current.data;
      const range = { startDate: data.date, endDate: data.date };
      const localEvents = archiveEventsForRange(archiveRows, user.id, range, snapshotContext.weekStartsOn);
      const localMoney = archiveMoneyForRange(archiveRows, user.id, range, snapshotContext.weekStartsOn);
      const retentionBoundary = archiveMetadata[0]?.retentionBoundary;
      setEvents(mergeProjectedEvents(data.events, localEvents, retentionBoundary));
      setMoneyProjection(mergeMoneyProjections(data.money, localMoney, retentionBoundary));
      setDailyNote(data.dailyNote ?? archiveDailyNoteForDate(archiveRows, user.id, data.date));
    }
    if (screen === "money" && moneyRawRef.current?.key === moneySnapshotKey({ kind: "money", userId: user.id, ...snapshotContext, month: moneyMonth })) {
      const data = moneyRawRef.current.data;
      const range = { startDate: moneyMonth, endDate: monthEnd(moneyMonth) };
      setMoneyProjection(mergeMoneyProjections(data, archiveMoneyForRange(archiveRows, user.id, range, snapshotContext.weekStartsOn), archiveMetadata[0]?.retentionBoundary));
    }
  // Raw active data is held in refs so archive loading cannot restart the network request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveMetadata, archiveRows, dailyDate, moneyMonth, month, screen, settings?.timezone, settings?.weekStartsOn, snapshotMetadata?.timezone, snapshotMetadata?.weekStartsOn, user?.id]);
  useEffect(() => {
    if (!user || !snapshotContext || screen !== "money") return;
    const identity: MoneySnapshotIdentity = { kind: "money", userId: user.id, ...snapshotContext, month: moneyMonth };
    const key = moneySnapshotKey(identity);
    const generation = ++moneyGenerationRef.current;
    const sequence = ++moneySequenceRef.current;
    moneyLatestStartedRef.current = sequence;
    const mutationRevision = moneyMutationRevisionRef.current;
    const requestEpoch = getActiveSnapshotEpoch();
    const controller = new AbortController();
    moneyControllerRef.current = controller;
    let active = true;
    let cachedVisible = false;
    moneyAuthoritativeRef.current = false;
    const apply = (data: MoneyProjection) => {
      if (!active || moneyGenerationRef.current !== generation || moneyLatestStartedRef.current !== sequence || moneyMutationRevisionRef.current !== mutationRevision) return;
      moneyRawRef.current = { key, data };
      const range = { startDate: moneyMonth, endDate: monthEnd(moneyMonth) };
      const localMoney = archiveMoneyForRange(archiveRowsRef.current, user.id, range, snapshotContext.weekStartsOn);
      setMoneyProjection(mergeMoneyProjections(data, localMoney, archiveMetadataRef.current[0]?.retentionBoundary));
      setMoneyDataReady(true);
      setMoneyReadyKey(key);
      cachedVisible = true;
    };
    const queuePrefetch = (targetMonth: string) => {
      const targetIdentity: MoneySnapshotIdentity = { kind: "money", userId: user.id, ...snapshotContext, month: targetMonth };
      const targetKey = moneySnapshotKey(targetIdentity);
      const existing = moneyPrefetchRef.current.get(targetKey);
      if (existing?.phase === "scheduled" || existing?.phase === "in-flight") return;
      if (existing?.completedAt && Date.now() - existing.completedAt < MONEY_PREFETCH_TTL_MS) return;
      const entry: MoneyPrefetchEntry = { phase: "scheduled" };
      moneyPrefetchRef.current.set(targetKey, entry);
      scheduleBackgroundWork(() => {
        if (!active || requestEpoch !== getActiveSnapshotEpoch() || moneyMutationRevisionRef.current !== mutationRevision) {
          if (moneyPrefetchRef.current.get(targetKey) === entry) moneyPrefetchRef.current.delete(targetKey);
          return;
        }
        entry.phase = "in-flight";
        const prefetchController = new AbortController();
        entry.controller = prefetchController;
        void (async () => {
          try {
            const savedAt = await getActiveSnapshotSavedAt(targetIdentity);
            if (!active || requestEpoch !== getActiveSnapshotEpoch() || moneyMutationRevisionRef.current !== mutationRevision) return;
            if (savedAt !== null && Date.now() - savedAt < MONEY_PREFETCH_TTL_MS) {
              entry.completedAt = savedAt;
              return;
            }
            const result = await getMoneyMonth(targetMonth, prefetchController.signal);
            if (!result.month || result.month.slice(0, 7) !== targetMonth.slice(0, 7)) throw new Error("Money prefetch response was invalid");
            const data: MoneyProjection = { occurrences: result.occurrences, summary: result.summary, days: result.days };
            if (!isMoneySnapshotData(data) || !active || requestEpoch !== getActiveSnapshotEpoch() || moneyMutationRevisionRef.current !== mutationRevision) return;
            const written = await writeServerConfirmedActiveSnapshot(targetIdentity, data, isMoneySnapshotData, requestEpoch, { evictMoneySnapshots: { preserveMonths: [moneyMonth, shiftMonth(moneyMonth, -1), shiftMonth(moneyMonth, 1), targetMonth] } });
            if (written) entry.completedAt = Date.now();
          } catch (error) {
            if (!prefetchController.signal.aborted && !isAbortError(error)) {
              // Prefetch is an optional acceleration layer; the visible month is unaffected.
            }
          } finally {
            if (moneyPrefetchRef.current.get(targetKey) === entry && entry.completedAt === undefined) moneyPrefetchRef.current.delete(targetKey);
          }
        })();
      });
    };
    const memory = readMemoryActiveSnapshot(identity, isMoneySnapshotData);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoneyDataReady(Boolean(memory));
    setMoneyReadyKey(memory ? key : null);
    setMoneyLoad(memory ? "refreshing" : "loading");
    if (memory) apply(memory);
    const persistentRead = memory ? Promise.resolve(null) : readPersistentActiveSnapshot(identity, isMoneySnapshotData);
    void persistentRead.then((cached) => {
      if (!cached || moneyAuthoritativeRef.current || !active || moneyGenerationRef.current !== generation || moneyLatestStartedRef.current !== sequence || requestEpoch !== getActiveSnapshotEpoch()) return;
      apply(cached);
      setMoneyLoad("refreshing");
    });
    void getMoneyMonth(moneyMonth, controller.signal).then((result) => {
      if (!result.month || result.month.slice(0, 7) !== moneyMonth.slice(0, 7)) throw new Error("Money snapshot response was invalid");
      const data: MoneyProjection = { occurrences: result.occurrences, summary: result.summary, days: result.days };
      if (!isMoneySnapshotData(data)) throw new Error("Money snapshot response was invalid");
      if (!active || moneyGenerationRef.current !== generation || moneyLatestStartedRef.current !== sequence || moneyMutationRevisionRef.current !== mutationRevision || requestEpoch !== getActiveSnapshotEpoch()) return;
      moneyAuthoritativeRef.current = true;
      apply(data);
      setMoneyLoad("success");
      void writeServerConfirmedActiveSnapshot(identity, data, isMoneySnapshotData, requestEpoch, { evictMoneySnapshots: { preserveMonths: [moneyMonth, shiftMonth(moneyMonth, -1), shiftMonth(moneyMonth, 1)] } });
      queuePrefetch(shiftMonth(moneyMonth, -1));
      queuePrefetch(shiftMonth(moneyMonth, 1));
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted || isAbortError(error) || moneyGenerationRef.current !== generation || moneyLatestStartedRef.current !== sequence || requestEpoch !== getActiveSnapshotEpoch()) return;
      setMoneyLoad(cachedVisible ? "success" : "error");
    });
    return () => { active = false; controller.abort(); if (moneyControllerRef.current === controller) moneyControllerRef.current = null; };
  // The effect intentionally depends on stable identity primitives; archive data is read through refs and reconciled separately below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyMonth, reloadNonce, screen, settings?.timezone, settings?.weekStartsOn, snapshotMetadata?.timezone, snapshotMetadata?.weekStartsOn, user?.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!user || screen !== "money-analysis") return; const controller = new AbortController(); let active = true; setAnalysisLoad("loading"); void getMoneyYear(analysisYear, controller.signal).then((nextYear) => { if (!active) return; setMoneyYearProjection(nextYear); setAnalysisLoad("success"); }).catch((error) => { if (active && !controller.signal.aborted && !isAbortError(error)) setAnalysisLoad("error"); }); return () => { active = false; controller.abort(); }; }, [analysisYear, screen, user, reloadNonce]);
 const navigate = (nextScreen: Screen) => { window.history.pushState({}, "", screenPath[nextScreen]); setScreen(nextScreen); setSettingsDetail(null); setSelectedDate(null); setDateSheetOpen(false); setFormState(null); setDetailState(null); };
  const openSettingsDetail = (detail: SettingsDetail) => { window.history.pushState({}, "", `/settings/${detail}`); setScreen("settings"); setSettingsDetail(detail); setSelectedDate(null); setDateSheetOpen(false); };
  const closeSettingsDetail = () => { window.history.replaceState({}, "", "/settings"); setSettingsDetail(null); };
  const selectCalendarDate = (date: string, filter: CalendarFilter) => { setCalendarFilter(filter); setSelectedDate(date); setDateSheetOpen(true); setMonth(monthStart(date)); window.history.pushState({}, "", `/calendar?date=${encodeURIComponent(date)}`); };
  const changeDailyDate = (date: string) => { setMonth(monthStart(date)); setDailyDate(date); window.history.pushState({}, "", `/daily?date=${encodeURIComponent(date)}`); };
  const openCalendarSearch = () => navigate("calendar-search");
  const selectCalendarSearchResult = (result: CalendarSearchResult) => { setEvents((current) => [result, ...current.filter((event) => eventIdentity(event) !== eventIdentity(result))]); setCalendarFilter("all"); setMonth(monthStart(result.occurrenceDate)); setSelectedDate(result.occurrenceDate); setDateSheetOpen(true); setScreen("calendar"); window.history.pushState({}, "", "/calendar?date=" + encodeURIComponent(result.occurrenceDate) + "&event=" + encodeURIComponent(result.id) + (result.occurrenceKey ? "&occurrenceKey=" + encodeURIComponent(result.occurrenceKey) : "")); };
  const openMoneyAnalysis = () => { setMoneyYearProjection(null); setScreen("money-analysis"); window.history.pushState({}, "", screenPath["money-analysis"]); };
  const changeAnalysisYear = (nextYear: number) => { setMoneyYearProjection(null); setAnalysisYear(nextYear); };
  const closeMoneyAnalysis = () => { setScreen("money"); window.history.replaceState({}, "", screenPath.money); };
  const loadSettings = () => { setSettingsLoad("loading"); void getSettings().then((result) => { applySettingsState(result.settings); setSettingsLoad("success"); }).catch(() => setSettingsLoad("error")); };
  const handleAuthenticated = (authenticatedUser: AuthUser) => { setUser(authenticatedUser); saveLastAuthUser(authenticatedUser); setOfflineMode(false); setOfflineSavedAt(null); setSnapshotMetadata(null); setAuthError(""); setSettingsLoad("loading"); void readActiveSnapshotMetadata(authenticatedUser.id).then((metadata) => { if (metadata) setSnapshotMetadata({ userId: metadata.userId, timezone: metadata.timezone, weekStartsOn: metadata.weekStartsOn }); }); void Promise.all([getSettings(), getUserState()]).then(([settingsResult, stateResult]) => { applySettingsState(settingsResult.settings); setSettingsLoad("success"); void writeActiveSnapshotMetadata(authenticatedUser.id, settingsResult.settings.timezone, settingsResult.settings.weekStartsOn); saveLastAuthSnapshotContext(authenticatedUser.id, settingsResult.settings.timezone, settingsResult.settings.weekStartsOn); setUserState(stateResult.state); }).catch(() => setSettingsLoad("error")); };
  const handleLogout = () => { const currentUserId = user?.id; clearLastAuthUser(); setOfflineMode(false); setOfflineSavedAt(null); calendarControllerRef.current?.abort(); dailyControllerRef.current?.abort(); moneyControllerRef.current?.abort(); calendarPrefetchRef.current.forEach((entry) => entry.controller?.abort()); calendarPrefetchRef.current.clear(); moneyPrefetchRef.current.forEach((entry) => entry.controller?.abort()); moneyPrefetchRef.current.clear(); calendarGenerationRef.current += 1; dailyGenerationRef.current += 1; moneyGenerationRef.current += 1; clearMemoryActiveSnapshots(); void logout().finally(async () => { if (currentUserId) await clearActiveSnapshotsForUser(currentUserId); setUser(null); setSettings(null); setSnapshotMetadata(null); setSettingsLoad("loading"); setUserState(null); setMigrationId(undefined); setEvents([]); setMoneyProjection(null); setDailyNote(null); setCalendarDataReady(false); setDailyDataReady(false); setMoneyDataReady(false); setMoneyReadyKey(null); calendarRawRef.current = null; dailyRawRef.current = null; moneyRawRef.current = null; setSettingsDetail(null); setScreen("calendar"); window.history.pushState({}, "", "/calendar"); }); };
  const checkArchive = async () => {
    if (!user) return;
    setArchiveState("saving"); setArchiveError("");
    try {
      const candidate = await getArchiveCandidates();
      setArchiveCandidate(candidate);
      const candidateCount = archiveRecordCount(candidate.records);
      if (candidateCount === 0) { setArchiveState(archiveMetadata.length > 0 ? "complete" : "idle"); return; }
      await runArchiveBatch(candidate, { saveAndVerify: (bundle) => saveArchiveBundle(bundle), markConfirmPending: async (bundle) => { await updateArchiveStatus(user.id, bundle.archiveBatchId, "confirm_pending"); }, confirm: (bundle) => confirmArchive({ archiveBatchId: bundle.archiveBatchId, checksum: bundle.checksum, recordCount: candidateCount, schemaVersion: bundle.schemaVersion || ARCHIVE_SCHEMA_VERSION, manifestVersion: bundle.manifestVersion, manifest: bundle.manifest }) });
      const localRows = await getArchiveRows(user.id); const localMetadata = await getArchiveMetadata(user.id); setArchiveRows(localRows); setArchiveMetadata(localMetadata); setArchiveState("confirm_pending");
      await updateArchiveStatus(user.id, candidate.archiveBatchId, "confirmed", new Date().toISOString());
      setArchiveRows(await getArchiveRows(user.id)); setArchiveMetadata(await getArchiveMetadata(user.id)); setArchiveState("complete");
    } catch (caught) {
      setArchiveState("error"); setArchiveError(caught instanceof ArchiveStorageError ? caught.message : caught instanceof Error ? caught.message : "アーカイブを確認できませんでした。保存済み履歴は保持されています。");
    }
  };
  const searchWithArchive = async (query: string, limit = 50, signal?: AbortSignal) => {
    const [{ events: serverEvents }, localRows] = await Promise.all([searchCalendarEvents(query, limit, signal), Promise.resolve(archiveRows)]);
    const localEvents = archiveSearchEvents(localRows, user?.id ?? "", query, settings?.weekStartsOn ?? 1, limit);
    const merged = new Map<string, CalendarSearchResult>();
    localEvents.forEach((event) => merged.set(`${event.id}:${event.occurrenceKey ?? event.occurrenceDate}`, event));
    (serverEvents ?? []).forEach((event) => { const key = `${event.id}:${event.occurrenceKey ?? event.occurrenceDate}`; if (!merged.has(key)) merged.set(key, event); });
    return { events: [...merged.values()].slice(0, limit) };
  };
  const returnContext = (): ReturnContext => screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter };
  const blockOfflineMutation = (): boolean => { if (!offlineMode) return false; setSelectionNote("オフライン中は編集できません。接続が戻ると最新情報に更新されます。"); return true; };
  const openAdd = (category: Event["category"], context?: ReturnContext) => { if (blockOfflineMutation()) return; const nextContext = context ?? (pendingAddContext && pendingAddContext.screen !== "money" ? pendingAddContext : returnContext()); setPendingAddContext(null); setSelectedDate(nextContext.screen === "calendar" ? nextContext.date : null); setAddOpen(false); setSelectionNote(""); setFormState({ category, initialDate: nextContext.date, returnTo: nextContext }); };
  const openMoney = (context: MoneyReturnContext, item?: MoneyItem, scope: EventScope = "series") => { if (blockOfflineMutation()) return; setPendingAddContext(null); setAddOpen(false); setDateSheetOpen(false); setFormState(null); setDetailState(null); setSelectedDate(context.screen === "calendar" ? context.date : null); setMoneyFormState({ initialDate: context.screen === "money" ? todayDateKey() : context.date, item, returnTo: context, scope }); };
  const handleAddSelect = (choice: AddChoice) => { const context = pendingAddContext ?? returnContext(); if (choice === "お金") { openMoney(context); return; } const eventContext: ReturnContext = context.screen === "money" ? { screen: "calendar", date: todayDateKey(), filter: "all" } : context; openAdd(choice === "家" ? "home" : "work", eventContext); };
  const restore = (context: ReturnContext) => { const path = context.screen === "calendar" ? `/calendar?date=${encodeURIComponent(context.date)}` : `/daily?date=${encodeURIComponent(context.date)}`; window.history.replaceState({}, "", path); setScreen(context.screen); setDateSheetOpen(false); if (context.screen === "calendar") { setCalendarFilter(context.filter); setSelectedDate(context.date); setMonth(monthStart(context.date)); } else { setDailyFilter(context.filter); setDailyDate(context.date); } };
  const openDaily = (date: string, filter: CalendarFilter) => { setSelectedDate(null); setDateSheetOpen(false); setDailyFilter(filter); setDailyDate(date); setScreen("daily"); window.history.pushState({}, "", `/daily?date=${encodeURIComponent(date)}`); };
  const closeForm = () => { const context = formState?.returnTo; setFormState(null); if (context) restore(context); };
  const closeMoneyForm = () => { const context = moneyFormState?.returnTo; setMoneyFormState(null); if (context?.screen === "calendar" || context?.screen === "daily") { restore(context); } };
  const currentMoneySnapshotKey = user && snapshotContext ? moneySnapshotKey({ kind: "money", userId: user.id, ...snapshotContext, month: moneyMonth }) : null;
  const moneyReadyForCurrentIdentity = moneyDataReady && moneyReadyKey === currentMoneySnapshotKey;
  const changeMoneyMonth = (nextMonth: string) => { if (user && snapshotContext) { const nextIdentity: MoneySnapshotIdentity = { kind: "money", userId: user.id, ...snapshotContext, month: nextMonth }; const cached = readMemoryActiveSnapshot(nextIdentity, isMoneySnapshotData); setMoneyDataReady(Boolean(cached)); setMoneyReadyKey(cached ? moneySnapshotKey(nextIdentity) : null); } else { setMoneyDataReady(false); setMoneyReadyKey(null); } setMoneyMonth(nextMonth); };
  const refreshMoneyProjection = (nextMonth = moneyMonth) => { moneyMutationRevisionRef.current += 1; changeMoneyMonth(nextMonth); setMoneyLoad(moneyReadyForCurrentIdentity ? "refreshing" : "loading"); setReloadNonce((current) => current + 1); };
  const handleMoneySaved = () => { const context = moneyFormState?.returnTo; setMoneyFormState(null); if (!context) return; if (context.screen === "money") { refreshMoneyProjection(context.month); } else { restore(context); void refreshProjection(context); } };
  const handleNoteSaved = async (content: string) => { if (offlineMode) throw new Error("オフライン中はメモを保存できません。"); const result = await upsertDailyNote(dailyDate, content); setDailyNote(result.dailyNote); if (user && snapshotContext && dailyRawRef.current?.key === dailySnapshotKey({ userId: user.id, ...snapshotContext, date: dailyDate })) { const nextData: DailySnapshotData = { ...dailyRawRef.current.data, dailyNote: result.dailyNote }; dailyRawRef.current = { key: dailyRawRef.current.key, data: nextData }; void writeServerConfirmedActiveSnapshot({ userId: user.id, ...snapshotContext, date: dailyDate }, nextData, isDailySnapshotData); } return result.dailyNote; };
  const closeDetail = () => { const context = detailState?.returnTo; setDetailState(null); if (context) restore(context); };
  const openEventEdit = (event: Event, returnTo: ReturnContext) => { if (blockOfflineMutation()) return; if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "edit" }); return; } setDetailState(null); setFormState({ category: event.category, event, initialDate: event.startDate ?? event.periodAnchorDate ?? event.periodStartDate ?? returnTo.date, returnTo, scope: "series" }); };
  const editEvent = () => { if (!detailState) return; openEventEdit(detailState.event, detailState.returnTo); };
  const requestDelete = (event: Event, returnTo: ReturnContext) => { if (blockOfflineMutation()) return; if (returnTo.screen === "calendar") setDateSheetOpen(false); if (event.recurrenceRuleId && event.occurrenceKey) { setScopeState({ event, returnTo, action: "delete" }); return; } setDeleteTarget({ event, returnTo, scope: "series" }); setFormState(null); setDeleteOpen(true); };
  const refreshProjection = (context: ReturnContext) => { if (context.screen === "calendar") { calendarMutationRevisionRef.current += 1; setMonth(monthStart(context.date)); setCalendarLoad(calendarDataReady ? "refreshing" : "loading"); } else { dailyMutationRevisionRef.current += 1; setDailyDate(context.date); setDailyLoad(dailyDataReady ? "refreshing" : "loading"); } setReloadNonce((current) => current + 1); };
  const requestMoneyDelete = (item: MoneyItem, scope: EventScope = moneyFormState?.scope ?? "series") => { if (blockOfflineMutation()) return; setMoneyDeleteTarget({ item, scope, returnTo: moneyFormState?.returnTo ?? { screen: "money", month: moneyMonth } }); setMoneyDeleteOpen(true); };
  const confirmMoneyDelete = async () => { const target = moneyDeleteTarget; if (!target) return; setDeleteBusy(true); try { await deleteMoney(target.item.id, target.scope, target.item.occurrenceKey ?? undefined); setMoneyDeleteOpen(false); setMoneyDeleteTarget(null); setMoneyFormState(null); if (target.returnTo.screen === "calendar" || target.returnTo.screen === "daily") { restore(target.returnTo); void refreshProjection(target.returnTo); } else { refreshMoneyProjection(target.returnTo.screen === "money" ? target.returnTo.month : moneyMonth); } } catch (caught) { setSelectionNote(caught instanceof Error ? caught.message : "削除できませんでした。"); } finally { setDeleteBusy(false); } };
  const openMoneyEdit = (item: MoneyItem, context: MoneyReturnContext = { screen: "money", month: moneyMonth }) => { if (blockOfflineMutation()) return; if (item.recurrenceRuleId && item.occurrenceKey) { setMoneyScopeState({ item, returnTo: context, action: "edit" }); return; } openMoney(context, item, "series"); };
  const handleMoneyScopeSelect = (scope: EventScope) => { const target = moneyScopeState; if (!target) return; setMoneyScopeState(null); if (target.action === "edit") openMoney(target.returnTo, target.item, scope); else { setMoneyDeleteTarget({ item: target.item, scope, returnTo: target.returnTo }); setMoneyDeleteOpen(true); } };
  const handleScopeSelect = (scope: EventScope) => { const target = scopeState; if (!target) return; setScopeState(null); if (target.action === "edit") { setDetailState(null); setFormState({ category: target.event.category, event: target.event, initialDate: target.event.startDate ?? target.event.periodAnchorDate ?? target.event.periodStartDate ?? target.returnTo.date, returnTo: target.returnTo, scope }); } else { setDeleteTarget({ event: target.event, returnTo: target.returnTo, scope }); setDeleteOpen(true); } };
  const handleSaved = (event: Event) => { setEvents((current) => [...current.filter((item) => event.occurrenceKey ? item.occurrenceKey !== event.occurrenceKey : item.id !== event.id), event]); const context = formState?.returnTo; setFormState(null); if (context) { restore(context); void refreshProjection(context); } };
  const saveLastUsedNotification = async (category: Event["category"], preference: LastUsedNotificationPreference) => {
    const result = await updateSettings(category === "home" ? { lastUsedNotificationHome: preference } : { lastUsedNotificationWork: preference });
    applySettingsState(result.settings);
  };
  const confirmDelete = async () => { const target = deleteTarget; if (!target) return; setDeleteBusy(true); try { await deleteEvent(target.event.id, target.scope, target.event.occurrenceKey ?? undefined); setEvents((current) => target.scope === "occurrence" ? current.filter((event) => event.occurrenceKey !== target.event.occurrenceKey) : current.filter((event) => event.id !== target.event.id)); setDeleteOpen(false); setDeleteTarget(null); setDetailState(null); restore(target.returnTo); void refreshProjection(target.returnTo); } catch (caught) { setSelectionNote(caught instanceof Error ? caught.message : "削除できませんでした。"); } finally { setDeleteBusy(false); } };
  if (!authChecked) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><p className="empty-state">読み込み中</p></main></div>;
  if (!user) { if (window.location.pathname === "/password-reset") return <PasswordResetPage onAuthenticated={handleAuthenticated} token={new URLSearchParams(window.location.search).get("token") ?? ""} />; return <><LoginPage onAuthenticated={handleAuthenticated} />{authError ? <p className="auth-global-error" role="alert">{authError}</p> : null}</>; }
  if (userState?.migrationState === "migration_locked") return <MigrationScreen migrationId={migrationId} onCompleted={() => { setUserState((current) => current ? { ...current, migrationState: "active" } : current); setMigrationId(undefined); }} user={user} />;
const content = moneyFormState ? <MoneyForm initialDate={moneyFormState.initialDate} item={moneyFormState.item} onCancel={closeMoneyForm} onDelete={moneyFormState.item ? () => requestMoneyDelete(moneyFormState.item as MoneyItem, moneyFormState.scope) : undefined} onSaved={handleMoneySaved} scope={moneyFormState.scope} suppressInitialRecentOpen /> : formState ? <EventForm category={formState.category} event={formState.event} initialDate={formState.initialDate} lastUsedNotification={formState.event ? null : settings ? formState.category === "home" ? settings.lastUsedNotificationHome : settings.lastUsedNotificationWork : null} onCancel={closeForm} onDelete={formState.event ? () => requestDelete(formState.event as Event, formState.returnTo) : undefined} onNotificationPreferenceSaved={saveLastUsedNotification} onSaved={handleSaved} scope={formState.scope} suppressInitialRecentOpen /> : detailState ? <EventDetailPage event={detailState.event} onBack={closeDetail} onDelete={() => requestDelete(detailState.event, detailState.returnTo)} onEdit={editEvent} /> : screen === "calendar-search" ? <CalendarSearchPage onBack={() => navigate("calendar")} onSelect={selectCalendarSearchResult} searchResults={searchWithArchive} /> : screen === "calendar" ? <CalendarShell events={events} loadState={calendarLoad} hasData={calendarDataReady} money={moneyProjection} filter={calendarFilter} month={month} onRetry={() => setReloadNonce((current) => current + 1)} onDateSelect={selectCalendarDate} onFilterChange={setCalendarFilter} onMonthChange={setMonth} onSearch={openCalendarSearch} /> : screen === "daily" ? !dailyDataReady ? <main className="screen-page daily-page"><header className="screen-header"><h1>デイリー</h1></header><DataStateMessage onRetry={() => setReloadNonce((current) => current + 1)} state={dailyLoad} /></main> : <DailyShell key={dailyDate} date={dailyDate} dailyNote={dailyNote} events={events} money={moneyProjection} filter={dailyFilter} offlineMode={offlineMode} onDateChange={changeDailyDate} onFilterChange={setDailyFilter} onEditEvent={(event) => openEventEdit(event, { screen: "daily", date: dailyDate, filter: dailyFilter })} onEditMoney={(item) => openMoneyEdit(item, { screen: "daily", date: dailyDate, filter: dailyFilter })} onMoneyChanged={() => { void refreshProjection({ screen: "daily", date: dailyDate, filter: dailyFilter }); }} onSaveNote={handleNoteSaved} /> : screen === "money" ? !moneyReadyForCurrentIdentity ? <main className="screen-page money-page"><header className="screen-header"><h1>お金</h1></header><DataStateMessage onRetry={() => refreshMoneyProjection()} state={moneyLoad} /></main> : <MoneyPage month={moneyMonth} money={moneyProjection} offlineMode={offlineMode} onEdit={(item) => openMoneyEdit(item)} onMoneyChanged={() => refreshMoneyProjection()} onMonthChange={changeMoneyMonth} onOpenAnalysis={openMoneyAnalysis} /> : screen === "money-analysis" ? analysisLoad !== "success" ? <main className="screen-page money-analysis-page"><header className="screen-header"><button aria-label="お金へ戻る" className="back-button" onClick={closeMoneyAnalysis} type="button">‹</button><h1>お金の分析</h1></header><DataStateMessage onRetry={() => setReloadNonce((current) => current + 1)} state={analysisLoad} /></main> : <MoneyAnalysisPage key={analysisYear} data={moneyYearProjection} onBack={closeMoneyAnalysis} onYearChange={changeAnalysisYear} year={analysisYear} /> : <SettingsShell archiveCandidate={archiveCandidate} archiveError={archiveError} archiveMetadata={archiveMetadata} archiveState={archiveState} detail={settingsDetail} onArchiveCheck={() => { void checkArchive(); }} onBack={closeSettingsDetail} onLogout={handleLogout} onMigrationStarted={(id) => { setMigrationId(id); setUserState({ migrationState: "migration_locked" }); }} onOpenDetail={openSettingsDetail} onRetrySettings={loadSettings} onSettingsChange={applySettingsState} settings={settings} settingsLoad={settingsLoad} user={user} />;
  const offlineBannerText = offlineSavedAt ? `オフライン中です。${new Date(offlineSavedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}時点の予定を表示しています。編集はできません。` : "オフライン中です。保存済みの予定を表示しています。編集はできません。";
  const activeNavigation = screen === "money-analysis" || screen === "calendar-search" ? screen === "calendar-search" ? "calendar" : "money" : screen;
return <MobileShell activeNavigation={formState || moneyFormState || detailState || deleteOpen || moneyDeleteOpen || moneyScopeState ? undefined : activeNavigation} onAdd={() => { if (blockOfflineMutation()) return; const context: MoneyReturnContext = screen === "daily" ? { screen: "daily", date: dailyDate, filter: dailyFilter } : screen === "money" || screen === "money-analysis" ? { screen: "money", month: moneyMonth } : { screen: "calendar", date: selectedDate ?? todayDateKey(), filter: calendarFilter }; setPendingAddContext(context); setSelectedDate(null); setDateSheetOpen(false); setAddOpen(true); }} onNavigate={navigate} showBottomNavigation={!formState && !moneyFormState && !detailState && !deleteOpen && !moneyDeleteOpen && !moneyScopeState}>{offlineMode ? <p className="offline-banner" role="status">{offlineBannerText}</p> : null}{content}{selectionNote ? <p className="selection-note" role="status">{selectionNote}</p> : null}{selectedDate && dateSheetOpen && !formState && !moneyFormState && !detailState ? <CalendarDateSheet date={selectedDate} events={events} money={moneyProjection} filter={calendarFilter} offlineMode={offlineMode} onAddCategory={(category) => { setDateSheetOpen(false); openAdd(category, { screen: "calendar", date: selectedDate, filter: calendarFilter }); }} onAddMoney={() => openMoney({ screen: "calendar", date: selectedDate, filter: calendarFilter })} onClose={() => setDateSheetOpen(false)} onDateChange={(nextDate) => selectCalendarDate(nextDate, calendarFilter)} onEditEvent={(event) => openEventEdit(event, { screen: "calendar", date: selectedDate, filter: calendarFilter })} onEditMoney={(item) => openMoneyEdit(item, { screen: "calendar", date: selectedDate, filter: calendarFilter })} onMoneyChanged={() => { void refreshProjection({ screen: "calendar", date: selectedDate, filter: calendarFilter }); }} onOpenDaily={() => openDaily(selectedDate, calendarFilter)} /> : null}<AddChoiceSheet onClose={() => { setPendingAddContext(null); setAddOpen(false); }} onSelect={handleAddSelect} open={addOpen} /><ScopeSheet action={scopeState?.action ?? "edit"} onClose={() => setScopeState(null)} onSelect={handleScopeSelect} open={Boolean(scopeState)} /><ScopeSheet action={moneyScopeState?.action ?? "edit"} onClose={() => setMoneyScopeState(null)} onSelect={handleMoneyScopeSelect} open={Boolean(moneyScopeState)} subject="項目" /><DeleteConfirmSheet busy={deleteBusy} onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }} onConfirm={() => { void confirmDelete(); }} open={deleteOpen} title={deleteTarget?.event.title ?? "予定"} />{moneyDeleteOpen && moneyDeleteTarget ? <MoneyDeleteConfirmSheet busy={deleteBusy} onClose={() => { setMoneyDeleteOpen(false); setMoneyDeleteTarget(null); }} onConfirm={() => { void confirmMoneyDelete(); }} title={moneyDeleteTarget.item.title} /> : null}</MobileShell>;
}
