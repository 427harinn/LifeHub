export type FixtureEventKind = "single" | "recurring" | "period";

export type CalendarFixtureEvent = {
  day: number;
  label: string;
  category: "home" | "work";
  kind: FixtureEventKind;
  money?: string;
  band?: "start" | "middle" | "end";
  isMultiDay?: boolean;
};

// M2-only display data. It never goes through the Worker or D1.
export const calendarFixture = {
  year: 2026,
  month: 8,
  today: 7,
  events: [
    { day: 3, label: "通院", category: "home", kind: "single", money: "-1,500" },
    { day: 5, label: "会議", category: "work", kind: "recurring" },
    { day: 7, label: "買い物", category: "home", kind: "single", money: "-1,500" },
    { day: 7, label: "通帳を確認", category: "home", kind: "single" },
    { day: 7, label: "請求確認", category: "work", kind: "recurring" },
    { day: 8, label: "締切", category: "work", kind: "recurring" },
    { day: 10, label: "出張", category: "work", kind: "single", band: "start", isMultiDay: true },
    { day: 11, label: "出張", category: "work", kind: "single", band: "middle", isMultiDay: true },
    { day: 12, label: "出張", category: "work", kind: "single", band: "end", money: "-5,000", isMultiDay: true },
    { day: 13, label: "今週中", category: "home", kind: "period", band: "start" },
    { day: 14, label: "今週中", category: "home", kind: "period", band: "middle" },
    { day: 15, label: "今週中", category: "home", kind: "period", band: "end", money: "+2,999" },
    { day: 16, label: "旅行", category: "home", kind: "single", band: "start", isMultiDay: true },
    { day: 17, label: "旅行", category: "home", kind: "single", band: "middle", isMultiDay: true },
    { day: 18, label: "旅行", category: "home", kind: "single", band: "end", isMultiDay: true },
    { day: 18, label: "定例", category: "work", kind: "recurring" },
    { day: 18, label: "買い物", category: "home", kind: "single" },
    { day: 18, label: "連絡", category: "work", kind: "recurring" },
    { day: 19, label: "週またぎ", category: "work", kind: "single", band: "start", isMultiDay: true },
    { day: 19, label: "移動", category: "work", kind: "single", money: "-2,000" },
    { day: 20, label: "週またぎ", category: "work", kind: "single", band: "middle", isMultiDay: true },
    { day: 21, label: "週またぎ", category: "work", kind: "single", band: "middle", isMultiDay: true },
    { day: 22, label: "週またぎ", category: "work", kind: "single", band: "end", isMultiDay: true },
    { day: 24, label: "今月中", category: "home", kind: "period", band: "start" },
    { day: 25, label: "今月中", category: "home", kind: "period", band: "middle" },
    { day: 26, label: "今月中", category: "home", kind: "period", band: "end" }
  ] satisfies CalendarFixtureEvent[]
};

export const dailyFixture = {
  allDay: [{ label: "家の予定", category: "home" }, { label: "週次レビュー", category: "work" }],
  period: [{ label: "今週中：書類を整理", category: "home" }, { label: "今月中：資料をまとめる", category: "work" }],
  timed: [
    { time: "08:30", label: "朝の散歩", category: "home" },
    { time: "10:00", label: "定例ミーティング", category: "work" },
    { time: "12:30", label: "昼食を買う", category: "home" },
    { time: "15:30", label: "クリーニング受け取り", category: "home" },
    { time: "18:00", label: "顧客への返信", category: "work" },
    { time: "20:00", label: "明日の確認", category: "work" }
  ],
  money: [{ label: "食費", amount: "-1,500円" }, { label: "副収入", amount: "+2,999円" }],
  memo: "午後は少し余白をつくる"
};

export const moneyFixture = {
  expense: "-48,500円",
  income: "+280,000円",
  remaining: "231,500円",
  entries: [
    { label: "家賃", category: "固定費", amount: "-80,000円" },
    { label: "食費", category: "食費", amount: "-1,500円" },
    { label: "給料", category: "給料", amount: "+280,000円" }
  ]
};

export const searchFixture = [
  { category: "home", day: 7, label: "買い物", time: "10:00" },
  { category: "work", day: 10, label: "出張", time: "終日" },
  { category: "work", day: 19, label: "移動", time: "14:00" },
  { category: "money", day: 19, label: "交通費", time: "" },
  { category: "home", day: 15, label: "今週中：書類を整理", time: "期限" }
] as const;
