# LifeHub ロードマップ

## 方針

LifeHubは、実装を始める前に設計を固める。

HouseToDoの既存コードを大量にコピーしてから削るのではなく、必要な基盤・UI・考え方を選択的に抽出する。

---

# Phase 0: 設計

現在のフェーズ。

## 0-1. プロダクト仕様

- [x] アプリの目的
- [x] 5つのボトムナビ
- [x] Calendar / Daily / Moneyの役割分担
- [x] 家 / 仕事カテゴリ
- [x] 期間中にやりたい項目
- [x] 予定メモ / 今日のメモ
- [x] ズボラ家計簿の基本思想
- [x] 予定額 / 実績 / みなし実績

## 0-2. HouseToDo流用設計

- [x] 流用 / 再設計 / 新規の分類
- [x] Auth / Household流用方針
- [x] UI foundation流用方針
- [x] 登録フォーム参考方針
- [x] recurrenceをそのままコピーしない方針
- [x] Push基盤流用方針
- [x] Calendar / Homeの参考範囲

## 0-3. データモデル設計

次に実施。

- [ ] User / Householdの採用範囲
- [ ] Event
- [ ] EventTiming
- [ ] RecurrenceRule
- [ ] NotificationRule
- [ ] NotificationTemplate
- [ ] DailyNote
- [ ] MoneyEntry
- [ ] MoneyCategory
- [ ] planned / actual / estimated_actual
- [ ] 過去データ / recurrence instanceの扱い

## 0-4. API設計

- [ ] Calendar range API
- [ ] Calendar day API
- [ ] Daily API
- [ ] Event CRUD
- [ ] Event search
- [ ] Recent Event / 以前の項目
- [ ] Money CRUD
- [ ] Money monthly aggregation
- [ ] DailyNote CRUD
- [ ] Notification APIs

## 0-5. UI詳細設計

- [ ] Calendar cell仕様
- [ ] 複数日予定の帯
- [ ] Date Sheet
- [ ] Daily timeline
- [ ] Add choice sheet
- [ ] Event form
- [ ] Money form
- [ ] Money charts
- [ ] empty / loading / error states

設計完了後にMVP実装へ進む。

---

# Phase 1: LifeHub基盤

HouseToDoから汎用基盤を抽出し、LifeHubとして起動できる状態にする。

候補:

- React / Vite / TypeScript
- UI foundation
- BottomSheet
- Bottom Navigation骨格
- Auth / Session
- Household
- Workers / D1
- timezone utilities
- PWA
- testing setup

このPhaseではTask / Shoppingドメインを持ち込まない。

---

# Phase 2: Event基盤

- Event DB / API
- Event form
- 家 / 仕事
- 単日予定
- 終日
- 開始 / 終了
- 編集 / 削除
- 以前の項目から選ぶ

まず単発Eventを完成させる。

---

# Phase 3: Calendar + Daily

- 月Calendar
- 家 / 仕事 / すべて
- 日付選択
- Date Sheet
- Daily timeline
- Calendar ↔ Daily
- Calendar / DailyからのQuick Add
- returnTo
- 過去日登録

---

# Phase 4: Recurrence + Period Event

- 共通RecurrenceRule
- 毎日
- 毎週
- 曜日指定
- 毎月
- 繰り返し期間
- 期間中にやりたいEvent
- Event instance/projection

HouseToDoのrecurrence utilityを参考にするが、Task modelはコピーしない。

---

# Phase 5: Notification

- HouseToDo Push基盤の移植/再利用
- Event notification
- 複数通知
- NotificationTemplate
- 家 / 仕事のdefault template
- deep link
- timezone検証

---

# Phase 6: Money MVP

- 支出 / 収入
- MoneyCategory
- Money form
- 以前の項目から選ぶ
- 単発MoneyEntry
- Calendar Moneyタブ
- Daily Moneyタブ
- 今月summary

---

# Phase 7: Money Recurrence / ズボラ実績

- Money + RecurrenceRule
- 予定額
- 実績額入力
- future recurrence ruleを壊さない月単位override
- estimated_actual
- 月末の扱い
- 月別集計

---

# Phase 8: Money可視化

- 今月: category pie
- category list
- 月ごと: bar chart
- 月詳細

高度な家計分析はMVP対象外。

---

# Phase 9: DailyNote / Search

- 今日のメモ
- 過去メモ
- Event検索
- Calendar jump

ここまででLifeHubの「軽いライフログ」が成立する。

---

# Phase 10: Settings / Polish

- Notification templates UI
- Money category設定
- Household関連設定
- UI polish
- accessibility
- performance
- App Store / PWA公開準備

---

# 開発フロー（実装フェーズ）

HouseToDoで採用している安全な開発フローをLifeHubでも基本とする。

1. main最新化
2. milestoneごとにbranch作成
3. 実装
4. unit / integration test
5. lint / typecheck / build
6. UI変更はPlaywright 390×844 evidence
7. staging validation
8. 必要なmigrationのみstaging適用
9. staging deploy
10. PR作成
11. 自動mergeしない
12. review後に手動merge

productionは明示的なリリースPhaseまで触らない。

---

# 次に設計する内容

次の作業は **データモデル設計**。

特に以下の関係を最初に固める。

```text
Event ─────────────┐
                   ├─ RecurrenceRule
MoneyEntry ────────┘

Event ─ NotificationRule

Date ─ DailyNote
```

Eventの日時・期間表現、recurrence instance、Moneyの予定/実績overrideが設計上の重要ポイント。
