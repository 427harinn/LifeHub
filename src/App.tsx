import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiErrorStatus, authMe, getSettings, login, logout, register, type AuthUser, type UserSettings } from "./api/client";
import { BottomSheet, Button, FormRow, Input, MobileShell } from "./components/ui";

type Screen = "calendar" | "daily" | "money" | "settings";
type AddChoice = "家" | "仕事" | "お金";

const screenFromPath = (): Screen => {
  const path = window.location.pathname;
  if (path === "/daily") return "daily";
  if (path === "/money") return "money";
  if (path === "/settings") return "settings";
  return "calendar";
};

const screenPath: Record<Screen, string> = { calendar: "/calendar", daily: "/daily", money: "/money", settings: "/settings" };

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

  return (
    <div className="auth-page">
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
        <button className="text-button" onClick={() => { setIsRegistering((current) => !current); setError(""); }} type="button">
          {isRegistering ? "ログインに戻る" : "アカウントを作成する"}
        </button>
      </main>
    </div>
  );
}

function CalendarShell() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  }), [daysInMonth, firstWeekday]);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <main className="screen-page calendar-page">
      <header className="screen-header"><h1>カレンダー</h1><button className="today-button" type="button">今日</button></header>
      <section aria-label={`${year}年${month + 1}月`} className="calendar-section">
        <div className="calendar-month"><button aria-label="前の月" className="month-button" type="button">‹</button><h2>{year}年{month + 1}月</h2><button aria-label="次の月" className="month-button" type="button">›</button></div>
        <div className="calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="calendar-grid">{cells.map((day, index) => <div className={`calendar-cell${day === today ? " calendar-cell--today" : ""}`} key={`${day ?? "empty"}-${index}`}>{day ? <span>{day}</span> : null}</div>)}</div>
      </section>
      <p className="empty-state">予定はありません</p>
    </main>
  );
}

function DailyShell() {
  return <main className="screen-page"><header className="screen-header"><h1>デイリー</h1><button className="today-button" type="button">今日</button></header><section className="empty-section"><h2>今日</h2><p className="empty-state">予定はありません</p></section></main>;
}

function MoneyShell() {
  return <main className="screen-page"><header className="screen-header"><h1>お金</h1></header><section className="empty-section"><h2>今月</h2><p className="empty-state">記録はありません</p></section></main>;
}

const weekDayLabel = (value: number) => ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][value] ?? "月曜日";

function SettingsShell({ user, settings, onLogout }: { user: AuthUser; settings: UserSettings | null; onLogout: () => void }) {
  return <main className="screen-page settings-page">
    <header className="screen-header"><h1>設定</h1></header>
    <section className="settings-section" aria-labelledby="personal-settings"><h2 id="personal-settings">基本設定</h2><div className="settings-list"><FormRow label="タイムゾーン" summary={settings?.timezone ?? "読み込み中"} /><FormRow label="週の開始" summary={settings ? weekDayLabel(settings.weekStartsOn) : "読み込み中"} /></div></section>
    <section className="settings-section" aria-labelledby="feature-settings"><h2 id="feature-settings">設定項目</h2><div className="settings-list"><FormRow label="通知" summary="準備中" /><FormRow label="Calendar" summary="準備中" /><FormRow label="Money category" summary="準備中" /><FormRow label="backup / archive" summary="準備中" /></div></section>
    <section className="settings-section" aria-labelledby="account-settings"><h2 id="account-settings">アカウント</h2><div className="settings-list"><FormRow label="メール" summary={user.email} /><Button className="logout-button" onClick={onLogout} variant="secondary">ログアウト</Button></div></section>
  </main>;
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<AddChoice | null>(null);

  useEffect(() => {
    let active = true;
    void authMe().then(async ({ user: authenticatedUser }) => {
      if (!active) return;
      setUser(authenticatedUser);
      const result = await getSettings().catch(() => null);
      if (active && result) setSettings(result.settings);
    }).catch((error: unknown) => {
      if (active && apiErrorStatus(error) !== 401) setAuthError("ログイン状態を確認できませんでした。");
    }).finally(() => { if (active) setAuthChecked(true); });
    const onPopState = () => setScreen(screenFromPath());
    window.addEventListener("popstate", onPopState);
    return () => { active = false; window.removeEventListener("popstate", onPopState); };
  }, []);

  const navigate = (nextScreen: Screen) => { window.history.pushState({}, "", screenPath[nextScreen]); setScreen(nextScreen); setSelectedChoice(null); };
  const handleAuthenticated = (authenticatedUser: AuthUser) => { setUser(authenticatedUser); setAuthError(""); void getSettings().then(({ settings: nextSettings }) => setSettings(nextSettings)).catch(() => undefined); };
  const handleLogout = () => { void logout().finally(() => { setUser(null); setSettings(null); setScreen("calendar"); window.history.pushState({}, "", "/calendar"); }); };
  const handleAddSelect = (choice: AddChoice) => { setSelectedChoice(choice); setSheetOpen(false); };

  if (!authChecked) return <div className="auth-page"><header className="app-header"><h1>LifeHub</h1></header><main className="auth-content"><p className="empty-state">読み込み中</p></main></div>;
  if (!user) return <><LoginPage onAuthenticated={handleAuthenticated} />{authError ? <p className="auth-global-error" role="alert">{authError}</p> : null}</>;

  const content = screen === "calendar" ? <CalendarShell /> : screen === "daily" ? <DailyShell /> : screen === "money" ? <MoneyShell /> : <SettingsShell onLogout={handleLogout} settings={settings} user={user} />;
  return <MobileShell activeNavigation={screen} onAdd={() => setSheetOpen(true)} onNavigate={navigate}>{content}{selectedChoice ? <p className="selection-note" role="status">{selectedChoice}の追加を準備しています。</p> : null}<AddChoiceSheet onClose={() => setSheetOpen(false)} onSelect={handleAddSelect} open={sheetOpen} /></MobileShell>;
}
