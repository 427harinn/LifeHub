# LifeHub ロードマップ

## 1. 方針

LifeHub は HouseToDo を直接改造せず、完成度の高い基盤・UI・考え方だけを選択的に流用する独立プロダクトとする。

LifeHub は完全個人用であり、Household / HouseholdMember / 共有モデルは持ち込まない。

設計文書を正として実装し、実装中に仕様変更が発生した場合はコードだけを変更せず、必ず関連文書も同じ作業内で更新する。

開発手順の詳細は `DEVELOPMENT_POLICY.md` を正とする。

---

# Phase 0: 設計

## 0-1. プロダクト / 画面設計

- [x] アプリの目的
- [x] 完全個人用
- [x] Todoではなく予定を扱い、完了状態を持たない
- [x] 5つのボトムナビ
- [x] Calendar / Daily / Money / Settingsの役割
- [x] 家 / 仕事カテゴリ
- [x] scheduled / period Event
- [x] 今週中 / 今月中 / 任意期間
- [x] Calendar複数日帯
- [x] Daily timeline
- [x] Event登録フロー
- [x] Money基本UI
- [x] LifeHub用オレンジテーマ

## 0-2. HouseToDo流用設計

- [x] Auth / Session流用方針
- [x] Householdを持ち込まない方針
- [x] UI foundation / BottomSheet流用方針
- [x] returnTo / recent definitions参考方針
- [x] recurrenceを再設計する方針
- [x] Push / Service Worker / scheduler参考方針

## 0-3. データモデル

- [x] User ownership
- [x] UserSettings / LifeHubUserState
- [x] Event
- [x] periodWindow / periodAnchorDate
- [x] RecurrenceRule
- [x] EventOccurrenceOverride
- [x] EventNotification / NotificationTemplate
- [x] DailyNote
- [x] MoneyItem / MoneyCategory
- [x] MoneyOccurrenceOverride
- [x] MoneyOccurrenceSettlement
- [x] actual / estimated_actual
- [x] ArchiveMetadata
- [x] migration_locked

## 0-4. API

- [x] Calendar API
- [x] Daily API
- [x] Event CRUD
- [x] Event recent definitions
- [x] Search
- [x] Money CRUD / monthly aggregation
- [x] Money actual
- [x] DailyNote CRUD
- [x] NotificationTemplate CRUD方針
- [x] MoneyCategory CRUD方針
- [x] Settings
- [x] Archive
- [x] Migration

## 0-5. インフラ / データ保持

- [x] HouseToDoとCloudflareリソースを完全分離
- [x] staging-first
- [x] D1直近1年保持
- [x] IndexedDBアーカイブ
- [x] JSONバックアップ
- [x] 安全な機種変更フロー

## 0-6. 実装開始前

- [x] 開発方針文書
- [ ] 全仕様書の最終整合性確認
- [ ] MVP milestone / task分割

---

# Phase 1: 基盤

- React / Vite / TypeScript
- UI foundation
- LifeHub color tokens
- BottomSheet
- Bottom Navigation
- Auth / Session
- Workers / D1
- timezone / weekStartsOn utilities
- PWA / Service Worker基盤
- testing setup
- local環境

Task / Shopping / Householdドメインは持ち込まない。

---

# Phase 2: Event MVP

- Event schema / migration
- Event CRUD API
- Event form
- 家 / 仕事
- scheduled Event
- 単日 / 複数日
- 終日 / 時間あり
- 編集 / 削除
- 以前の項目から選ぶ
- returnTo

まず単発Eventを完成させる。

---

# Phase 3: Calendar + Daily MVP

- 大きな月Calendar
- すべて / 家 / 仕事 / お金タブ
- 日セルMoney表示
- 単発 / 繰り返し / periodの色分け
- TimeTree型の複数日帯
- `+N` 省略表示
- Date Sheet
- Daily timeline
- Calendar ↔ Daily
- Calendar / DailyからQuick Add
- DailyNote

Calendarの1日最大表示件数は、390×844に最大量のダミーデータを入れてEvidenceを確認後に決定する。

---

# Phase 4: Recurrence + Period Event

- 共通Recurrence Projection
- daily / weekly / monthly
- interval / weekdays / dayOfMonth
- recurrence range
- stable occurrenceKey
- 今週中 / 今月中 / custom range
- periodAnchorDate
- 今回のみ / これ以降 / すべて
- EventOccurrenceOverride

Calendar / Daily / Notificationで別々のrecurrence実装を作らない。

---

# Phase 5: Notification

- Web Push基盤
- Push subscription
- Event複数通知
- 終日09:00基準
- period deadline基準
- 朝09:00 / 夜21:00まとめ通知
- 設定から時刻変更 / ON-OFF
- NotificationTemplate
- deep link
- NotificationDeliveryによる重複防止
- timezone検証

---

# Phase 6: Money MVP

- MoneyCategory
- Money form
- 支出 / 収入
- plannedAmount
- 単発Money
- 以前の項目から選ぶ
- Calendar Money表示
- Daily Money表示
- 今月summary

---

# Phase 7: Money Recurrence / 実績

- Money + RecurrenceRule
- MoneyOccurrenceOverride
- 今回のみ / これ以降 / すべて
- actual入力
- 月末estimated_actual確定
- MoneyOccurrenceSettlement
- 過去月集計固定

---

# Phase 8: Money可視化

- 今月: 支出見込み / 収入見込み / 残りそう
- 確定済み / 予定の補助集計
- category donut
- category list
- 月別bar chart
- 月詳細

高度な家計分析は初期対象外。

---

# Phase 9: Search / Archive

- Event title / place / memo検索
- Calendar jump
- IndexedDB検索統合
- 1年超履歴のローカルアーカイブ
- D1 + IndexedDB統合表示
- ArchiveMetadata

---

# Phase 10: Settings / Backup / Migration

- 通知設定
- NotificationTemplate設定
- MoneyCategory設定
- Calendar設定
- Archive状態
- 通常JSONバックアップ
- 機種変更JSON生成・再検証
- migration lock
- 新端末import / complete

---

# Phase 11: Polish / Release

- accessibility
- loading / empty / error states
- performance
- PWA install確認
- iPhone実機確認
- notification実機確認
- staging総合テスト
- production環境準備

production作成・deploy・migrationは明示的なリリース作業としてのみ行う。

---

# 実装フェーズ共通フロー

各milestoneは `DEVELOPMENT_POLICY.md` に従う。

要約:

1. main最新化
2. 新規branch
3. `.ai/MILESTONE.md` / `.ai/TASKS.md` をCodexが更新
4. 実装
5. lint / typecheck / test / build
6. UIは390×844 screenshot evidence、必要なら動画
7. 関連仕様書更新
8. 十分まとまった段階でstaging検証
9. push
10. Pull Request作成
11. PRリンク・branch・commit・test・evidenceを報告
12. 自動mergeしない
13. production/defaultへ明示指示なしで触れない
