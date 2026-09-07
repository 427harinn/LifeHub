# HouseToDo からの流用設計

## 1. 目的

LifeHubはHouseToDoを直接改造するのではなく、完成度が高い基盤・UI・考え方を抽出して利用する独立プロダクトとする。

LifeHubは完全個人用であり、Household / HouseholdMemberによる共有モデルは持ち込まない。

分類:

- **A: ほぼそのまま流用**
- **B: HouseToDoを参考にLifeHub向けへ再設計**
- **C: 新規開発**

---

## 2. 流用マップ

| 領域 | 方針 | 備考 |
|---|---|---|
| React / Vite / TypeScript | A | 基本構成 |
| Cloudflare Workers | A | API基盤 |
| D1 | A | 基盤のみ。schemaはLifeHub新規 |
| R2 | 不使用 | 初期版不要 |
| Auth / Session | A/B | 個人ログイン基盤 |
| Household / HouseholdMember | 持ち込まない | 完全個人用 |
| timezone / weekStartsOn | A/B | 汎用日付処理 |
| spacing / radius / typography | A | HouseToDoと同じ |
| color theme | C | LifeHubオレンジ系 |
| BottomSheet | A | 強く流用 |
| Bottom Navigation | B | 構造流用、項目変更 |
| Settings shell | B | 構造流用 |
| Form row / Progressive Disclosure | A/B | 思想・UIを強く継承 |
| returnTo | B | Calendar / Daily context維持 |
| 以前の項目から選ぶ | B | UX参考、API新規 |
| Recurrence date utility | B | 汎用部分を抽出 |
| weekly_flexible / monthly_flexible | 持ち込まない | TimingとRecurrenceを分離 |
| occurrence keyの考え方 | B | stable keyへ応用 |
| Push / Service Worker | A/B | 基盤流用候補 |
| Notification scheduler | B | 複数通知/period対応へ再設計 |
| Calendar月UI | B | 基本操作参考、描画はLifeHub新規 |
| Calendar API | C | Event/Money中心 |
| Calendar Date Sheet | A/B | UI参考 |
| Home UI | B | Dailyの参考 |
| Task status / TaskRecord | 持ち込まない | 完了概念なし |
| Shopping | 持ち込まない | 対象外 |
| Event | C | LifeHub中心モデル |
| EventOccurrenceOverride | C | 今回のみ編集/削除 |
| DailyNote | C | 個人専用 |
| Money | C | planned / actual / estimated_actual |
| Archive / Migration | C | IndexedDB + JSON |

---

## 3. 基盤

### フロント

流用候補:

- React / Vite / TypeScript
- ESLint / Vitest / Playwright
- PWA / Service Worker基盤
- UI foundation components

Task / Shoppingコードを大量コピーして削る方法は採用しない。

### Backend

参考・流用:

- Workers構成
- D1 repository/service/route分離
- API error handling
- authentication middleware
- Cookie session
- timezone処理

LifeHub専用Worker / D1 / secrets / Cronを作る。

---

## 4. Auth

User / SessionはHouseToDoを参考にする。

持ち込まない:

- Household
- HouseholdMember
- invite
- owner / member
- household switching
- household権限制御

主要データは `userId` 所有。

---

## 5. UI

HouseToDoからそのまま継承するもの:

- spacing
- radius
- typography
- button/input/form rowのサイズ感
- BottomSheet
- safe-area
- mobile-first layout

LifeHubで変更するもの:

- primaryをgreenからorangeへ
- Calendar予定色を単発 / 繰り返し / periodの3種類へ
- Money色

HouseToDoのgreen値を直接コピーしない。

---

## 6. 登録フォーム

HouseToDoの良い点を継承する。

- 1画面中心
- rowからBottomSheet
- 高度な項目を隠す
- rowにsummary表示
- recent definitions
- editでも同じフォーム
- form state / validation / payload変換を分離

TaskForm自体はコピーせずEventForm / MoneyFormを新規設計する。

---

## 7. Recurrence

LifeHubでは以下を分離する。

- Timing: scheduled / period
- RecurrenceRule: daily / weekly / monthly
- Period Window: this_week / this_month / custom_range
- periodAnchorDate: 対象週/月を安定復元
- OccurrenceOverride

UI上の「カスタム」はfrequencyではなく詳細設定入口。

参考にするutility:

- timezone-safe date key
- weekday
- weekStartsOn
- month-day clamp
- range計算
- occurrence key

TaskRecordやflexible recurrence型はコピーしない。

---

## 8. Calendar / Daily

Calendarで参考にする:

- month navigation
- selected date
- Date Sheet
- quick add
- returnTo

LifeHub新規:

- 大きな情報量の月Calendar
- TimeTree型複数日帯
- 単発 / recurrence / period色分け
- Money表示
- Event検索

DailyはHouseToDo Homeの縦情報階層を参考にするが、start / complete / skip等は持ち込まない。

---

## 9. Notification

流用候補:

- Web Push
- Push subscription
- Service Worker
- Cron
- timezone-aware scheduler
- deep link

新規:

- 複数offset
- EventNotification
- NotificationTemplate
- all-day 09:00
- period deadline通知
- 朝夜まとめ
- NotificationDelivery

---

## 10. Money / Archive / Migration

完全新規。

Money:

- MoneyItem
- MoneyCategory
- MoneyOccurrenceOverride
- MoneyOccurrenceSettlement
- actual / estimated_actual
- 月次集計・グラフ

Archive / Migration:

- D1直近1年
- IndexedDB
- ArchiveMetadata
- JSON export/import
- migration_locked

---

## 11. Codexへの実装原則

1. HouseToDoにあるという理由だけでコピーしない
2. 汎用基盤とドメイン固有コードを分ける
3. Household / Task / Shoppingを持ち込まない
4. recurrenceはLifeHubモデルへ再設計する
5. EventとMoneyで共通化できるロジックは共通化する
6. UIはHouseToDoの形を継承し、色はLifeHub用tokenを使う
7. 実装前に関連仕様書を読む
8. 実装で仕様変更が必要になったらコードだけ変えず文書も更新する
9. `DEVELOPMENT_POLICY.md` のbranch / evidence / staging / PRルールに従う

---

## 12. 現在の確定状況

以下はすでに確定済みであり、HouseToDo既存仕様で勝手に補完しない。

- 完全個人用 / userId ownership
- Event / RecurrenceRule / Overrideの概念モデル
- periodAnchorDate
- 複数通知モデル
- period通知基準
- Money初期カテゴリ
- actual / estimated_actual月末確定
- Calendar TimeTree型帯
- Calendar単発 / 繰り返し / period色分け
- D1 1年保持 / IndexedDB archive
- JSON機種変更フロー

DBの具体的なSQL型・index等は実装milestoneで確定してよいが、概念モデルを変更する場合は先に文書を更新する。
