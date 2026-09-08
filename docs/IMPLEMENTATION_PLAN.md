# LifeHub 実装計画

## 1. 目的

この文書は、確定済みのLifeHub仕様をCodexで安全に実装するための高レベルMilestone計画を定義する。

実際の各作業では `docs/DEVELOPMENT_POLICY.md` を正とし、Codex自身が作業branch上で `.ai/MILESTONE.md` / `.ai/TASKS.md` を作成・更新する。

この文書は「何をどの順番で完成させるか」を示す。細かい実装タスクは各Milestone開始時にCodexが分解する。

基本原則:

- 各Milestoneは最新mainから新規branchを切る
- 実装・test・Evidence・docs更新・push・PR作成までを1単位とする
- PRは自動mergeしない
- GUI変更は390×844のScreenshot Evidenceを必須とする
- 動きが重要な箇所は動画Evidenceも残す
- スマートフォンで確認する価値が出た段階からstaging確認を行う
- production/defaultおよびHouseToDo環境には明示指示なしで触れない

---

# Milestone 1: Application Foundation

## 目的

LifeHubがローカルで起動し、HouseToDoから必要な汎用基盤だけを持った独立アプリとして開発できる状態にする。

## 主な内容

- React / Vite / TypeScript基盤
- Worker + Vite assets構成
- lint / typecheck / Vitest / Playwright / build基盤
- LifeHub用ディレクトリ構成
- HouseToDoのUI foundationから必要部分を抽出
- spacing / radius / typography継承
- LifeHub orange color tokens
- Button / Input / FormRow / BottomSheet等の基本UI
- 390×844 mobile shell
- PWA / Service Workerの最低限の土台
- local D1 / wrangler dev環境
- `.ai/MILESTONE.md` / `.ai/TASKS.md` 初期作成

## 持ち込まないもの

- Task
- TaskRecord
- Shopping
- Household / HouseholdMember
- green theme

## 完了条件

- frontend / Workerがローカル起動
- lint / typecheck / test / build pass
- 390×844で基本UI Evidence
- HouseToDo固有ドメインが残っていないことをセルフレビュー
- PR作成

staging deployはまだ必須にしない。

---

# Milestone 2: Auth / Personal Settings / Navigation Shell

## 目的

個人アプリとしてログインでき、主要画面を移動できるアプリ骨格を完成させる。

## 主な内容

- User / Session / Cookie認証
- 個人所有 `userId` の基盤
- LifeHubUserState
- UserSettings
- timezone / weekStartsOn
- Bottom Navigation
  - カレンダー
  - デイリー
  - ＋追加
  - お金
  - 設定
- 各画面のshell / empty state
- Settingsの基本shell
- migration_lockedを考慮できるmiddleware土台

## Evidence

- ログイン
- Bottom Navigation全画面
- ＋を押した `家 / 仕事 / お金` 選択UI
- 設定画面shell

## 完了条件

- 認証・Session test
- userId ownership test
- mobile navigation Evidence
- PR作成

まだ全機能をstagingで触れる価値が小さいため、stagingは任意。

---

# Milestone 3: Single Scheduled Event

## 目的

まず「普通のカレンダー予定」を登録・編集・削除できるようにする。

## 主な内容

- Event migration / repository / service / route
- `scheduled` Event
- home / work
- 単日
- 複数日
- 終日
- 時間あり
- Event CRUD
- Event詳細
- EventForm
- Progressive Disclosure
- 場所 / メモ
- `以前の項目から選ぶ`
- returnToの基礎
- notification / recurrenceはこのMilestoneでは未実装またはUI上で未選択状態のみ

## Form Evidence

390×844で最低限:

- scheduled / timeあり
- 終日
- 複数日
- 家 / 仕事
- 場所・メモ展開
- recent definition選択

## 完了条件

- Event CRUD API test
- validation test
- ownership test
- EventForm Evidence
- 登録 → 編集 → 削除のE2E
- PR作成

この時点ではCalendar本表示が未完成なので、stagingはまだ任意。

---

# Milestone 4: Calendar + Daily MVP / First Staging

## 目的

LifeHubの中心体験をスマートフォンで触れる状態にする。ここを最初のstaging基準点とする。

## 主な内容

### Calendar

- 大きな月表示
- 月移動
- `すべて / 家 / 仕事 / お金` タブshell
- 日セル
- 単発Event表示
- TimeTree型の複数日帯
- 日付タップ
- Date Sheet
- `+N` の表示基盤
- CalendarからQuick Add
- returnTo

### Daily

- 日付移動
- 終日予定を上部表示
- 時間あり予定を縦タイムラインで表示
- Calendar → Daily
- Daily → Add → returnTo
- DailyNote CRUD / UI
- Money領域は空状態または後続用placeholder

## Calendar密度検証

Calendarは固定の最大表示件数を採用しない。実測したセル利用可能高さから`availableRows`を算出し、端末のsafe-areaやbrowser UIの差に応じて表示row数が変動するadaptive方式を正とする。

390×844およびiPhone Safari相当で、

- 予定が少ない月
- 予定が多い月
- 同日に多数の予定
- 複数日帯が複数重なるケース

を投入しScreenshot Evidenceを作成する。

Evidenceでは固定2 / 3 / 4件を決めるのではなく、availableRowsに収まらないEvent / Money明細がhidden countへ送られること、`すべて`のMoney summaryが最終rowを予約すること、実機でレイアウトが崩れないことを確認する。

## First Staging

このMilestone完了時に初めて本格的なstagingを用意する。

- `lifehub-staging` Worker
- `lifehub-staging` D1
- 必要なstaging secrets
- existing staging schema確認（新規remote migrationは未適用）
- deploy

M4のstaging smoke（health / login / Event CRUD / Calendar / Daily / DailyNote）は既存schemaで成功した。remote migration操作ではCloudflare API `7403` permission errorが発生したが、今回新規migrationはなくM4 blockerではない。次回新しいremote migrationを適用する前に権限問題を解決する。production/defaultは明示指示なしに操作しない。

ユーザーがスマートフォンから、ログイン → Event登録 → Calendar / Daily確認まで行える状態にする。

## Evidence

- Calendar通常状態
- Calendar高密度状態
- 複数日帯の開始 / 継続 / 終了 / 週またぎ
- Date Sheet
- Daily timeline
- Calendar → Add → returnTo 動画

## 完了条件

- Calendar / Daily API test
- E2E
- staging deploy
- mobile実機確認可能
- PR作成

---

# Milestone 5: Scheduled Recurrence Engine

## 目的

固定日時予定の繰り返しを、共通Occurrence Projectionとして完成させる。

## 主な内容

- RecurrenceRule
- daily / weekly / monthly
- interval
- weekdays
- dayOfMonth
- startsOn / endsOn
- UI上の「カスタム」詳細設定
- stable occurrenceKey
- Projection service
- month-day clamp
- timezone / week boundary
- Calendar / Dailyで同じProjectionを利用
- EventOccurrenceOverride
- `今回のみ / これ以降 / すべて` 編集・削除
- series split

## 重点test

- 毎日
- 2日ごと
- 毎週複数曜日
- 2週間ごと
- 毎月31日
- recurrence endsOn
- occurrenceKey安定性
- 今回のみ変更
- 今回のみ削除
- これ以降編集 / 削除
- timezone境界

## Evidence

- Calendarの繰り返し予定色
- Recurrence BottomSheet
- 対象範囲選択
- 今回だけ変更したCalendar

動作確認はstagingへ反映して行う。

---

# Milestone 6: Period Event

## 目的

LifeHub固有の `期間中にやりたい` 予定を完成させる。

## 主な内容

- `timingType=period`
- `periodWindowType`
  - this_week
  - this_month
  - custom_range
- `periodAnchorDate`
- deadlineTime
- this_week + weekly
- this_month + monthly
- custom_range recurrence禁止
- period Projection
- periodの今回のみ / これ以降 / すべて
- Calendar period帯
- Dailyで終日の下にperiodを表示
- period専用色

## Evidence

- 今週中
- 今月中
- custom range
- Calendarの横断帯
- 月/週境界
- Daily上部
- period Form分岐

## 重点test

- weekStartsOn
- periodAnchorDate
- monthly boundary
- period recurrence
- overrideで1回だけcustom rangeへ変更

staging必須。

---

# Milestone 7: Notification

## 目的

Event通知をHouseToDo基盤を参考にLifeHub仕様で完成させる。

## 主な内容

- Push subscription
- LifeHub専用VAPID
- Service Worker
- EventNotification複数offset
- NotificationTemplate
- NotificationDelivery
- scheduled timeあり通知
- all-day 09:00基準
- period deadline基準
- 朝まとめ通知 09:00 default
- 夜まとめ通知 21:00 default
- 朝/夜のON-OFF・時刻変更
- deep link
- Cron retry重複防止
- migration_locked時の除外

## Evidence / 実機

PushはブラウザEvidenceだけでは不十分なので、stagingで実機確認を行う。

必要な動画:

- 通知許可
- Push受信
- 通知タップ → 該当画面deep link

## 重点test

- timezone
- offset
- period期限
- recurrence occurrence
- override後の通知日時
- 重複防止

---

# Milestone 8: Money MVP

## 目的

単発の支出・収入と今月見込みを使えるようにする。

## 主な内容

- MoneyCategory
- 初期カテゴリ
- Category CRUD
- MoneyItem
- expense / income
- plannedAmount
- 単発Money
- MoneyForm
- recent definitions
- Money月API
- 今月summary
  - 支出見込み
  - 収入見込み
  - 残りそう
- Calendarの日セル最上部に日次収支差額
- Calendar Moneyタブ個別額
- Daily予定タイムライン下にMoney

## Evidence

- Money Form
- Money画面今月summary
- Calendarすべてタブの金額
- Calendar Moneyタブ
- Daily Money

staging必須。

---

# Milestone 9: Money Recurrence / Actual / Estimated Actual

## 目的

ズボラ家計簿の中核となる定期支出・実績・みなし実績を完成させる。

## 主な内容

- Money + RecurrenceRule
- MoneyOccurrenceOverride
- MoneyOccurrenceSettlement
- 今回のみ / これ以降 / すべて
- actual入力 / 修正 / 取消
- estimated_actual
- 月末確定処理
- estimated_actual → actual
- 過去月の金額固定
- Calendar / Daily / Money共通金額決定ロジック

## 重点test

- 家賃の系列変更
- 電気代 planned → actual
- 未入力の月末estimated_actual
- 過去のplannedAmount変更で過去月が変わらない
- 今回だけplannedAmount変更
- series split

stagingで月次ケースのfixtureを使って確認する。

---

# Milestone 10: Money Visualization

## 目的

Moneyを「ざっくり把握できる」画面として完成させる。

## 主な内容

- 今月
  - 支出見込み
  - 収入見込み
  - 残りそう
  - 確定済み / 予定
- category donut chart
- category list
- 月ごとbar chart
- 月詳細
- actual / estimated_actualの控えめな表示
- long-range集計の土台

## Evidence

- 今月
- 明細多い状態
- donut
- 月ごとbar
- 月詳細

390×844でグラフの可読性を重点確認する。

---

# Milestone 11: Search

## 目的

過去・未来の予定をCalendar中心で探せるようにする。

## 主な内容

- Event title / place / memo検索
- 検索結果一覧
- occurrence日時解決
- 結果タップ
  - 該当月へジャンプ
  - 日付選択
  - Date Sheetを開く
- 将来のIndexedDB検索統合を想定したinterface

## Evidence

- 検索UI
- 複数結果
- 結果 → Calendar jump動画

---

# Milestone 12: Local Archive

## 目的

D1を無期限に膨らませず、1年超の履歴を端末へ安全に退避できるようにする。

## 主な内容

- IndexedDB archive store
- ArchiveMetadata
- 12か月超candidate判定
- `/api/archive/candidates`
- IndexedDB保存
- 件数 / ID / checksum検証
- `/api/archive/confirm`
- 保存検証後のみD1削除
- D1 + IndexedDB統合Calendar / Daily / Money表示
- IndexedDB検索統合
- SettingsのArchive状態

## 重点test

- D1削除前の保存検証
- 保存失敗時はD1を消さない
- recurrence親定義を誤って削除しない
- 境界月merge

## Evidence

- Archive設定画面
- 過去Calendar表示

---

# Milestone 13: Backup / Device Migration

## 目的

通常バックアップと安全な機種変更を完成させる。

## 主な内容

### 通常Backup

- D1 + IndexedDB完全JSON
- schemaVersion
- checksum / validation
- export
- D1を削除しない

### Device Migration

1. 機種変更開始
2. 強い警告
3. 完全JSON生成
4. 保存
5. 保存JSON再選択
6. schema / checksum / validation
7. `このバックアップで機種変更を開始`
8. D1移行対象整理
9. migration_locked
10. 新端末login
11. import
12. 最近1年をD1、古い履歴をIndexedDBへ復元
13. Calendar / Daily / Money再構築確認
14. completeでlock解除

## 重点test

- invalid JSON拒否
- checksum不一致
- migration_locked中の書き込み拒否
- import途中失敗
- complete前に通常利用不可
- 完全復元

## Evidence

このMilestoneは操作フロー自体が重要なので動画Evidenceを必須とする。

stagingのみで検証し、productionデータでは行わない。

---

# Milestone 14: Settings / Polish / Release Readiness

## 目的

各所に分散して実装した設定を統合し、初期リリース候補として品質を整える。

## 主な内容

- Settings最終構成
  - account
  - notification
  - NotificationTemplate
  - Calendar / weekStartsOn
  - MoneyCategory
  - Archive
  - Backup / Migration
- loading / empty / error states
- accessibility
- mobile safe area
- keyboard / input usability
- performance
- PWA install
- iPhone実機確認
- Push実機確認
- staging総合smoke
- docs最終更新

## Release前確認

- productionリソースはこのMilestoneでも勝手に作らない
- stagingで十分確認した後、別途明示的なProduction Release作業を行う

---

# Milestone依存関係

基本順序:

```text
M1 Foundation
 ↓
M2 Auth / Navigation
 ↓
M3 Single Event
 ↓
M4 Calendar / Daily + First Staging
 ↓
M5 Scheduled Recurrence
 ↓
M6 Period Event
 ↓
M7 Notification
 ↓
M8 Money MVP
 ↓
M9 Money Recurrence / Settlement
 ↓
M10 Money Visualization
 ↓
M11 Search
 ↓
M12 Archive
 ↓
M13 Backup / Migration
 ↓
M14 Polish / Release Readiness
```

原則この順で進める。

ただし、小さなUI改善や仕様修正は関連Milestone内で行ってよい。依存関係を崩す大きな先行実装は避ける。

---

# 各Milestone開始時にCodexが行うこと

1. `main` 最新化
2. 新規branch作成
3. `README.md` と関連docsを読む
4. `docs/DEVELOPMENT_POLICY.md` を読む
5. この `IMPLEMENTATION_PLAN.md` の対象Milestoneを読む
6. `.ai/MILESTONE.md` を対象Milestoneの具体的完了条件に更新
7. `.ai/TASKS.md` を小タスクへ分割
8. 実装開始

小タスクごとにセルフレビュー・testを行い、Milestone終了時にPR作成まで実施する。

---

# 設計から実装へ移る条件

以下は完了済みとする。

- Product / Screen / Event Form仕様
- Data Model
- Recurrence / Occurrence
- Notification
- Money
- API
- Design System
- Backup / Retention
- Cloudflare Infrastructure
- HouseToDo reuse方針
- Development Policy
- 全仕様書整合性レビュー
- 本Milestone分割

したがって、本書作成後はPhase 0を完了し、**Milestone 1: Application Foundationから実装フェーズへ移行できる**。
