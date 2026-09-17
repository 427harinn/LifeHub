import type { ReactNode } from "react";

const navigationItems = [
  { id: "calendar", label: "カレンダー", icon: "calendar" },
  { id: "daily", label: "デイリー", icon: "daily" },
  { id: "add", label: "追加", icon: "add" },
  { id: "money", label: "お金", icon: "money" },
  { id: "settings", label: "設定", icon: "settings" }
] as const;

type MobileShellProps = {
  children: ReactNode;
  activeNavigation?: (typeof navigationItems)[number]["id"];
  onAdd?: () => void;
  onNavigate?: (navigation: Exclude<(typeof navigationItems)[number]["id"], "add">) => void;
  showBottomNavigation?: boolean;
};

export function MobileShell({ children, activeNavigation = "calendar", onAdd, onNavigate, showBottomNavigation = true }: MobileShellProps) {
  return (
    <div className="mobile-shell">
      <div className="mobile-shell__content">{children}</div>
      {showBottomNavigation ? <nav aria-label="主要画面" className="mobile-nav">
        {navigationItems.map((item) => (
          <button
            aria-current={activeNavigation === item.id ? "page" : undefined}
            aria-label={item.label}
            className={`mobile-nav__button${item.id === "add" ? " mobile-nav__button--add" : ""}`}
            key={item.id}
            onClick={item.id === "add" ? onAdd : () => onNavigate?.(item.id)}
            type="button"
          >
            <span aria-hidden="true" className={`mobile-nav__asset-icon mobile-nav__asset-icon--${item.icon}`} />
            <span className="sr-only">{item.label}</span>
          </button>
        ))}
      </nav> : null}
    </div>
  );
}
