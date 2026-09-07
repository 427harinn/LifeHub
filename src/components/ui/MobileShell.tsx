import type { ReactNode } from "react";

const navigationItems = [
  { id: "calendar", label: "カレンダー", glyph: "◫" },
  { id: "daily", label: "デイリー", glyph: "◌" },
  { id: "add", label: "追加", glyph: "＋" },
  { id: "money", label: "お金", glyph: "¥" },
  { id: "settings", label: "設定", glyph: "⚙" }
] as const;

type MobileShellProps = {
  children: ReactNode;
  activeNavigation?: (typeof navigationItems)[number]["id"];
  onAdd?: () => void;
};

export function MobileShell({ children, activeNavigation = "calendar", onAdd }: MobileShellProps) {
  return (
    <div className="mobile-shell">
      <div className="mobile-shell__content">{children}</div>
      <nav aria-label="主要画面" className="mobile-nav">
        {navigationItems.map((item) => (
          <button
            aria-current={activeNavigation === item.id ? "page" : undefined}
            aria-label={item.label}
            className={`mobile-nav__button${item.id === "add" ? " mobile-nav__button--add" : ""}`}
            key={item.id}
            onClick={item.id === "add" ? onAdd : undefined}
            type="button"
          >
            <span aria-hidden="true" className="mobile-nav__glyph">{item.glyph}</span>
            <span className="sr-only">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
