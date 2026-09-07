import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiErrorStatus, authMe, getSettings, login, logout, register, type AuthUser, type UserSettings } from "./api/client";
import { dailyFixture, calendarFixture, moneyFixture, type CalendarFixtureEvent } from "./fixtures/m2ShellFixtures";
import { BottomSheet, Button, FormRow, Input, MobileShell, NavIcon } from "./components/ui";

type Screen = "calendar" | "daily" | "money" | "settings";
type AddChoice = "家" | "仕事" | "お金";
type CalendarFilter = "all" | "home" | "work" | "money";
type SettingsDetail = "account" | "notifications" | "calendar" | "money" | "data";

const screenFromPath = (): Screen => {
  const path = window.location.pathname;
  if (path === "/daily") return "daily";
  if (path === "/money") return "money";
  if (path === "/settings") return "settings";
  return "calendar";
};

const screenPath: Record<Screen, string> = { calendar: "/calendar", daily: "/daily", money: "/money", settings: "/settings" };
const filterLabels: Record<CalendarFilter, string> = { all: "すべて", home: "家", work: "仕事", money: "お金" };
const filterForCategory = (category: CalendarFixtureEvent["category"]): CalendarFilter => category;

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = isRegistering ? await register(displayName, email, password) : await login(email, password);
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-page">
    <header className="app-header"><h1>LifeHub</h1></header>
    <main className="auth-content">
      <h2>{isRegistering ? "アカウントを作成" : "ログイン"}</h2>
      <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
        {isRegistering ? <label className="input-field" htmlFor="display-name"><span>表示名</span><Input id="display-name" autoComplete="name" onChange={setDisplayName} required value={displayName} /></label> : null}
        <label className="input-field" htmlFor="email"><span>メールアドレス</span><Input id="email" autoComplete="email" onChange={setEmail} required type="email" value={email} /></label>
        <label className="input-field" htmlFor="password"><span>パスワード</span><Input id="password" autoComplete={isRegistering ? "new-password" : "current-password"} minLength={12} onChange={setPassword} required type="password" value={password} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button disabled={busy} type="submit">{busy ? "確認中…" : isRegistering ? "アカウントを作成" : "ログイン"}</Button>
      </form>
      <button className="text-button" onClick={() => { setIsRegistering((current) => !current); setError(""); }} type="button">{isRegistering ? "ログインに戻る" : "アカウントを作成する"}</button>
    </main>
  </div>;
}

function FixtureTabs({ active, onChange }: { active: CalendarFilter; onChange: (filter: CalendarFilter) => void }) {
  return <div aria-label="表示切替" className="shell-tabs" role="tablist">{(Object.keys(filterLabels) as CalendarFilter[]).map((filter) => <button aria-selected={active === filter} className="shell-tab" key={filter} onClick={() => onChange(filter)} role="tab" type="button">{filterLabels[filter]}</button>)}</div>;
}

function CalendarShell({ onDateSelect, onSearch }: { onDateSelect: (day: number) => void; onSearch: () => void }) {
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const firstWeekday = new Date(calendarFixture.year, calendarFixture.month, 1).getDay();
  const daysInMonth = new Date(calendarFixture.year, calendarFixture.month + 1, 0).getDate();
  const cells = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  }), [daysInMonth, firstWeekday]);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return <main className="screen-page calendar-page">
    <header className="screen-header"><h1>カレンダー</h1><button aria-label="検索" className="icon-button" onClick={onSearch} type="button"><NavIcon name="search" /></button></header>
    <FixtureTabs active={filter} onChange={setFilter} />
    <section aria-label={`${calendarFixture.year}年${calendarFixture.month + 1}月`} className="calendar-section">
      <div className="calendar-month"><button aria-label="前の月" className="month-button" type="button">‹</button><h2>{calendarFixture.year}年{calendarFixture.month + 1}月</h2><button aria-label="次の月" className="month-button" type="button">›</button></div>
      <button className="calendar-today" type="button">今日</button>
      <div className="calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => {
        const events = day ? calendarFixture.events.filter((event) => filter === "all" || (filter === "money" ? Boolean(event.money) : filterForCategory(event.category) === filter)).filter((event) => event.day === day) : [];
        const moneyEvent = events.find((event) => event.money);
        const money = moneyEvent?.money;
        const visibleEvents = events.slice(0, events.length > 2 ? 1 : 2);
        return <button aria-label={day ? `${day}日` : "空の日付"} className={`calendar-cell${day === calendarFixture.today ? " calendar-cell--today" : ""}`} disabled={!day} key={`${day ?? "empty"}-${index}`} onClick={() => { if (day) onDateSelect(day); }} type="button">
          {day ? <><span className="calendar-cell__date">{day}</span><span className={`calendar-cell__money${money?.startsWith("+") ? " calendar-cell__money--income" : " calendar-cell__money--expense"}`}>{money ?? "\u00a0"}</span><span className="calendar-cell__events">{visibleEvents.map((event) => <span className={`calendar-event ${event.kind === "period" ? "calendar-event--period" : event.isMultiDay ? "calendar-event--multi" : "calendar-event--normal"} calendar-event--${event.band ?? "single"}`} key={`${event.label}-${event.kind}-${event.band ?? "single"}`}>{event.band === "middle" ? "\u00a0" : event.label}</span>)}{events.length > 2 ? <span className="calendar-cell__overflow">+{events.length - 1}</span> : null}</span></> : null}
        </button>;
      })}</div>
    </section>
  </main>;
}

function CalendarDateSheet({ day, onClose, onAdd }: { day: number; onClose: () => void; onAdd: () => void }) {
  return <BottomSheet open title={`2026年9月${day}日`} onClose={onClose}><div className="sheet-detail"><p className="sheet-total">今日の収支 <strong>{calendarFixture.events.find((event) => event.day === day)?.money ?? "±0円"}</strong></p><div className="sheet-list">{["終日：家の予定", "10:00：会議", "今週中：書類を整理"].map((item) => <div className="sheet-row" key={item}>{item}</div>)}</div><div className="sheet-footer"><Button onClick={onClose} variant="secondary">1日の詳細を見る</Button><button aria-label="当日に追加" className="sheet-add-button" onClick={onAdd} type="button"><NavIcon name="add" /></button></div></div></BottomSheet>;
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  return <BottomSheet open title="検索" onClose={onClose}><div className="sheet-detail"><p className="sheet-note">検索画面は後続Milestoneで追加します。</p><Button onClick={onClose} variant="secondary">閉じる</Button></div></BottomSheet>;
}

function DailyShell() {
  const [filter, setFilter] = useState<CalendarFilter>("all");
  return <main className="screen-page daily-page"><header className="screen-header"><h1>デイリー</h1><button className="today-button" type="button">今日</button></header><FixtureTabs active={filter} onChange={setFilter} /><section className="timeline-section"><h2>予定</h2><div className="fixture-group"><h3>終日</h3>{dailyFixture.allDay.filter((item) => filter === "all" || filter === item.category).map((item) => <div className="fixture-row" key={item.label}><span>{item.label}</span><small>{item.category === "home" ? "家" : "仕事"}</small></div>)}</div><div className="fixture-group"><h3>期間</h3>{dailyFixture.period.filter((item) => filter === "all" || filter === item.category).map((item) => <div className="fixture-row fixture-row--period" key={item.label}><span>{item.label}</span><small>{item.category === "home" ? "家" : "仕事"}</small></div>)}</div><div className="fixture-group"><h3>時間あり</h3>{dailyFixture.timed.filter((item) => filter === "all" || filter === item.category).map((item) => <div className="fixture-row" key={item.label}><time>{item.time}</time><span>{item.label}</span><small>{item.category === "home" ? "家" : "仕事"}</small></div>)}</div></section><section className="daily-section"><h2>今日のお金</h2>{dailyFixture.money.map((item) => <div className="fixture-row" key={item.label}><span>{item.label}</span><strong>{item.amount}</strong></div>)}</section><section className="daily-section"><h2>今日のメモ</h2><p className="memo-text">{dailyFixture.memo}</p></section></main>;
}

function MoneyShell() {
  return <main className="screen-page money-page"><header className="screen-header"><h1>お金</h1></header><section className="money-summary"><h2>今月</h2><div className="money-summary-list"><div><span>支出見込み</span><strong>{moneyFixture.expense}</strong></div><div><span>収入見込み</span><strong>{moneyFixture.income}</strong></div><div><span>残りそう</span><strong>{moneyFixture.remaining}</strong></div></div></section><section className="money-entries"><h2>明細</h2>{moneyFixture.entries.map((entry) => <div className="fixture-row" key={entry.label}><span>{entry.label}<small>{entry.category}</small></span><strong>{entry.amount}</strong></div>)}</section></main>;
}

const weekDayLabel = (value: number) => ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][value] ?? "月曜日";

function SettingsDetailPage({ detail, user, settings, onBack, onLogout }: { detail: SettingsDetail; user: AuthUser; settings: UserSettings | null; onBack: () => void; onLogout: () => void }) {
  const titles: Record<SettingsDetail, string> = { account: "アカウント", notifications: "通知", calendar: "カレンダー", money: "お金", data: "データ / バックアップ" };
  const body = detail === "account" ? <><FormRow label="メール" summary={user.email} /><Button onClick={onLogout} variant="secondary">ログアウト</Button></> : detail === "notifications" ? <><FormRow label="朝のまとめ通知" summary="ON · 09:00" /><FormRow label="夜のまとめ通知" summary="ON · 21:00" /><FormRow label="通知テンプレート" summary="標準" /></> : detail === "calendar" ? <><FormRow label="タイムゾーン" summary={settings?.timezone ?? "Asia/Tokyo"} /><FormRow label="週の開始" summary={settings ? weekDayLabel(settings.weekStartsOn) : "月曜日"} /></> : detail === "money" ? <><FormRow label="支出カテゴリ" summary="食費・日用品・固定費" /><FormRow label="収入カテゴリ" summary="給料・臨時収入" /></> : <><FormRow label="バックアップ" summary="JSON" /><FormRow label="ローカルアーカイブ" summary="確認" /></>;
  return <main className="screen-page settings-page"><header className="screen-header"><button aria-label="設定へ戻る" className="back-button" onClick={onBack} type="button">‹</button><h1>{titles[detail]}</h1><span className="header-spacer" /></header><section className="settings-detail-list">{body}</section></main>;
}

function SettingsShell({ user, settings, detail, onOpenDetail, onBack, onLogout }: { user: AuthUser; settings: UserSettings | null; detail: SettingsDetail | null; onOpenDetail: (detail: SettingsDetail) => void; onBack: () => void; onLogout: () => void }) {
  if (detail) return <SettingsDetailPage detail={detail} onBack={onBack} onLogout={onLogout} settings={settings} user={user} />;
  return <main className="screen-page settings-page"><header className="screen-header"><h1>設定</h1></header><section className="settings-root-list"><FormRow ariaLabel="アカウントを開く" label="アカウント" onClick={() => onOpenDetail("account")} /><FormRow ariaLabel="通知を開く" label="通知" onClick={() => onOpenDetail("notifications")} /><FormRow ariaLabel="カレンダーを開く" label="カレンダー" onClick={() => onOpenDetail("calendar")} /><FormRow ariaLabel="お金を開く" label="お金" onClick={() => onOpenDetail("money")} /><FormRow ariaLabel="データとバックアップを開く" label="データ / バックアップ" onClick={() => onOpenDetail("data")} /></section></main>;
}

function AddChoiceSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (choice: AddChoice) => void }) {
  return <BottomSheet open={open} onClose={onClose} title="追加"><div className="choice-list"><FormRow ariaLabel="家を追加" label="家" onClick={() => onSelect("家")} /><FormRow ariaLabel="仕事を追加" label="仕事" onClick={() => onSelect("仕事")} /><FormRow ariaLabel="お金を追加" label="お金" onClick={() => onSelect("お金")} /></div></BottomSheet>;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [screen, setScreen] = useState<Screen>(screenFromPath);
  const [settingsDetail, setSettingsDetail] = useState<SettingsDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<AddChoice | null>(null);
  const [calendarDate, setCalendarDate] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void authMe().then(async ({ user: authenticatedUser }) => {
      if (!active) return;
      setUser(authenticatedUser);
      const result = await getSettings().catch(() => null);
      if (active && result) setSettings(result.settings);
    }).catch((error: unknown) => { if (active && apiErrorStatus(error) !== 401) setAuthError("ログイン状態を確認できませんでした。"); }).finally(() => { if (active) setAuthChecked(true); });
    const onPopState = () => setScreen(screenFromPath());
    window.addEventListener("popstate", onPopState);
    return () => { active = false; window.removeEventListener("popstate", onPopState); };
  }, []);

  const navigate = (nextScreen: Screen) => { window.history.pushState({}, "", screenPath[nextScreen]); setScreen(nextScreen); setSettingsDetail(null); setSelectedChoice(null); };
  const handleAuthenticated = (authenticatedUser: AuthUser) => { setUser(authenticatedUser); setAuthError(""); void getSettings().then(({ settings: nextSettings }) => setSettings(nextSettings)).catch(() => undefined); };
  const handleLogout = () => { void logout().finally(() => { setUser(null); setSettings(null); setSettingsDetail(null); setScreen("calendar"); window.history.pushState({}, "", "/calendar"); }); };
  const handleAddSelect = (choice: AddChoice) => { setSelectedChoice(choice); setSheetOpen(false); };
  const openAdd = () => { setCalendarDate(null); setSheetOpen(true); };

  if (!authChecked) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><p className="empty-state">読み込み中</p></main></div>;
  if (!user) return <><LoginPage onAuthenticated={handleAuthenticated} />{authError ? <p className="auth-global-error" role="alert">{authError}</p> : null}</>;

  const content = screen === "calendar" ? <CalendarShell onDateSelect={setCalendarDate} onSearch={() => setSearchOpen(true)} /> : screen === "daily" ? <DailyShell /> : screen === "money" ? <MoneyShell /> : <SettingsShell detail={settingsDetail} onBack={() => setSettingsDetail(null)} onLogout={handleLogout} onOpenDetail={setSettingsDetail} settings={settings} user={user} />;
  return <MobileShell activeNavigation={screen} onAdd={() => setSheetOpen(true)} onNavigate={navigate}>{content}{selectedChoice ? <p className="selection-note" role="status">{selectedChoice}の追加を準備しています。</p> : null}{calendarDate !== null ? <CalendarDateSheet day={calendarDate} onAdd={openAdd} onClose={() => setCalendarDate(null)} /> : null}{searchOpen ? <SearchSheet onClose={() => setSearchOpen(false)} /> : null}<AddChoiceSheet onClose={() => setSheetOpen(false)} onSelect={handleAddSelect} open={sheetOpen} /></MobileShell>;
}
