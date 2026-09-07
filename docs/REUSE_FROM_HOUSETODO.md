# HouseToDo からの流用設計

## 1. 目的

LifeHub は HouseToDo を直接改造するのではなく、HouseToDo で完成度が高い基盤・UI・考え方を抽出して利用する独立プロダクトとする。

Codex が実装時に迷わないよう、各領域を以下の3分類で扱う。

- **A: ほぼそのまま流用**
- **B: HouseToDoを参考にLifeHub向けへ再設計**
- **C: 新規開発**

---

## 2. 流用マップ

| 領域 | 方針 | 備考 |
|---|---|---|
| React / Vite / TypeScript | A | 基本構成を流用 |
| Cloudflare Workers | A | API基盤として利用 |
| D1 | A | DB基盤として利用。テーブルはLifeHub用に新規設計 |
| R2 | A候補 | 将来画像等が必要な場合 |
| 認証 / Session | A | HouseToDoの安定実装を流用 |
| Household | A | 家庭共有の基盤として流用 |
| timezone / weekStartsOn | A | 日付計算の基盤として流用 |
| UI foundation | A | 色・余白・フォント・角丸・基本部品 |
| BottomSheet | A | Calendar日付詳細・選択UIなどで利用 |
| スマホ向けレイアウト | A | HouseToDoのデザイン言語を継承 |
| Bottom Navigation | B | 構造流用、項目はLifeHub用に変更 |
| Settings / Other構造 | B | 構造流用、中身はLifeHub向け |
| 登録フォームUI | B | 強く参考。データモデルは新規 |
| Progressive Disclosure | A思想 | そのまま設計原則として採用 |
| 以前の項目から選ぶ | B | UI/UX流用、Event/Money用APIは新規 |
| 日付utility | A/B | 汎用部分を抽出・再利用 |
| Recurrence計算 | B | HouseToDoを参考に共通Engineへ再設計 |
| weekly_flexible | 持ち込まない | LifeHubではrecurrenceとperiodを分離 |
| monthly_flexible | 持ち込まない | 同上 |
| Push / Service Worker | A/B | 基盤は流用候補 |
| Notification scheduler | B | 基盤参考、複数通知対応へ再設計 |
| Calendar月UI | B | 見た目・操作を参考 |
| Calendar API | C | Event/Money中心に新規 |
| Calendar Date Sheet | A/B | UIは流用候補、中身は新規 |
| Calendar quick add | B | 選択日引継ぎの考え方を採用 |
| Home UI | B | Daily画面の参考 |
| Task status | 持ち込まない | LifeHubの中心概念ではない |
| TaskRecord | 持ち込まない | Event履歴とは別設計 |
| Shopping | 持ち込まない | LifeHub対象外 |
| Event | C | LifeHubの中心モデル |
| 複数日予定 | C | LifeHubで新規 |
| 家 / 仕事分類 | C | 新しいカテゴリ軸 |
| DailyNote | C | 新規 |
| Event検索 | C | 新規 |
| MoneyEntry | C | 新規 |
| planned / actual / estimated_actual | C | LifeHub固有 |
| Moneyグラフ | C | 新規 |

---

## 3. そのまま流用したい基盤

### 3.1 フロントエンド基盤

HouseToDoの以下の構成をLifeHubの開始点として利用する。

- React
- Vite
- TypeScript
- ESLint / typecheck / Vitest / Playwrightの開発フロー
- PWA / Service Worker周辺

ただしHouseToDo固有のTask/Shoppingコードを大量に残した状態から削除するのではなく、可能であれば必要な基盤を選択的に持ってくる。

### 3.2 Backend基盤

- Cloudflare Workers
- D1
- API error handling
- authentication middleware
- repository / service / routeの分離方針
- timezone処理

を参考・流用する。

### 3.3 Auth / Household

HouseToDoの以下はLifeHubと目的が一致するため、原則そのまま使う。

- User
- Session
- Household
- HouseholdMember
- owner / member
- timezone
- weekStartsOn

LifeHubの「家 / 仕事」カテゴリはHouseholdとは別軸とする。

---

## 4. UIで強く流用するもの

### 4.1 UI Foundation

LifeHubはHouseToDoと同系統のデザインにする。

- font stack
- color tokens
- spacing
- radius
- input / row
- button
- BottomSheet
- bottom navigation
- mobile safe-area

可能ならコンポーネント・CSSを直接抽出して利用する。

### 4.2 登録フォーム

HouseToDoの家事登録画面はLifeHubのEvent登録画面の最重要参考元とする。

参考にする点:

- 1画面にまとめる
- rowを押してBottomSheetで詳細設定
- 普段使わない詳細は閉じる
- 入力値の要約をフォームrowへ表示
- 以前の項目から選ぶ
- 編集画面でも同じ構造を使う
- form state / validation / API payload変換をUIから分離する

LifeHubではTaskFormをそのまま使わず、EventForm / MoneyFormとして新規設計する。

### 4.3 戻り導線

HouseToDoで導入した `returnTo` の考え方をLifeHubでも利用する。

- 追加前にいた画面へ戻る
- Calendarの選択日を維持
- Dailyの対象日を維持
- 登録成功後も同じcontextへ戻る

---

## 5. 繰り返しは「考え方とutilityを参考」にする

### 5.1 HouseToDoの現状

HouseToDoではTask recurrenceに以下のような型がある。

- once
- daily
- weekly_fixed
- monthly_fixed
- weekly_flexible
- monthly_flexible

`weekly_flexible` / `monthly_flexible` は、繰り返し周期と「期間のどこかでやる」というTask scopeを兼ねている。

これはHouseToDoの家事管理には合うが、LifeHubではそのままコピーしない。

### 5.2 LifeHub方針

LifeHubでは概念を分離する。

#### RecurrenceRule

「どの周期で発生するか」

- none
- daily
- weekly
- monthly
- custom

#### Recurrence Range

「いつからいつまで繰り返すか」

- forever
- until
- date range

#### Event Timing

「予定日時が決まっているか / 期間中にやりたいか」

- scheduled
- period

この3つを独立させる。

### 5.3 流用候補

HouseToDoの日付処理から以下のような汎用ロジックは参考・抽出候補。

- timezone-safe date key
- weekday計算
- 月の日数
- 毎月31日指定時の短い月への丸め
- start/end date range
- occurrence key生成の考え方

Task固有のperiod key設計はそのまま持ち込まない。

---

## 6. 通知

### 流用するもの

- Web Push基盤
- Push subscription
- Service Worker
- Cron / scheduled worker
- same-origin deep linkの考え方
- timezone-aware scheduler

### 再設計するもの

LifeHubでは1予定に複数通知が必要。

例:

- 1日前
- 30分前

HouseToDoの単一 `notificationOffsetMinutes` をそのままEventへコピーしない。

NotificationRule / NotificationOffsetの新しいモデルを作る。

通知テンプレートもLifeHubで新規開発する。

---

## 7. Calendar

### 参考・流用

- 月カレンダーの基本レイアウト
- 日付選択
- BottomSheetの日付詳細
- selected date state
- quick add
- Calendar → add → 同じ日へ戻る動線
- range/day APIを分離する考え方

### 新規開発

- Event中心のCalendar API
- 家 / 仕事 / お金 / すべてタブ
- 複数日予定の帯表示
- Moneyの日別表示
- Event検索と日付ジャンプ

HouseToDoの `fixed / weeklyFlexible / monthlyFlexible / completed / shopping` というレスポンス構造は持ち込まない。

---

## 8. Daily

LifeHubのDailyはHouseToDo Homeの見た目・情報階層を参考にする。

### 参考にするもの

- 縦スクロール
- 日単位データ取得
- row展開
- loading / error / empty UI
- optimistic/local-first設計は必要に応じて参考

### 持ち込まないもの

- start
- complete
- skip
- weekly target
- TaskRecord projection

LifeHubでは時系列Event表示を中心にする。

---

## 9. 完全新規とするドメイン

以下はHouseToDoの既存モデルに無理に当てはめない。

### Event

- 家 / 仕事
- scheduled / period
- start / end
- all-day
- place
- memo
- recurrence
- notification

### DailyNote

- date
- content
- owner/user情報

### Money

- 支出 / 収入
- amount
- category
- date/time
- recurrence
- planned amount
- actual amount
- actual / estimated_actual

### Search

Event title / place / memo等を対象にするLifeHub固有検索。

---

## 10. Codexへの実装原則

LifeHub実装時、HouseToDoコードを参照するときは以下を守る。

1. 「HouseToDoにあるからそのままコピー」しない
2. ドメイン固有コードと汎用基盤を区別する
3. Auth / Household / UI foundation等の汎用基盤は積極的に流用する
4. Task / Shopping固有モデルは持ち込まない
5. recurrenceはHouseToDoを参考にするがLifeHubモデルへ再設計する
6. EventとMoneyで共有できるロジックはLifeHub側で共通化する
7. UIはHouseToDoと同じデザイン言語を維持する
8. 実装前に本ドキュメントとPRODUCT_SPEC / SCREEN_SPECを確認する

---

## 11. 現在の未確定事項

以下は設計フェーズで今後決める。

- Event / RecurrenceRuleの最終データモデル
- period Eventとrecurrenceを組み合わせる詳細ルール
- 複数通知のDB表現
- 家 / 仕事予定の共有範囲
- Money categoryの初期セット
- actual / estimated_actual確定処理のタイミング
- Calendar複数日帯の正確なレンダリング仕様

未確定事項をHouseToDoの既存仕様で勝手に補完しないこと。
