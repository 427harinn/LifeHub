import type { SVGProps } from "react";

export type NavIconName = "calendar" | "daily" | "add" | "money" | "settings" | "search";

type NavIconProps = SVGProps<SVGSVGElement> & {
  name: NavIconName;
};

export function NavIcon({ name, ...props }: NavIconProps) {
  const paths = {
    calendar: (
      <>
        <rect height="17" rx="2" width="18" x="3" y="4" />
        <path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
      </>
    ),
    daily: (
      <>
        <path d="M5 6h14M5 12h10M5 18h7" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    add: <path d="M12 5v14M5 12h14" />,
    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8.5h6M9 12h6M9 15.5h6M12 8.5v7" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.41 1.41-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V19.6h-2v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.41-1.41.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2h.09A1.7 1.7 0 0 0 9.4 11a1.7 1.7 0 0 0-.34-1.88L9 9.06l1.41-1.41.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 13.38 6.5v-.09h2v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.41 1.41-.06.06A1.7 1.7 0 0 0 19.4 11c.13.6.6 1.03 1.2 1.03h.09v2h-.09c-.6 0-1.07.43-1.2.97Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5" />
      </>
    )
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="22"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
