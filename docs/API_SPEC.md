# LifeHub API仕様

## 1. 基本方針

LifeHubでは、Calendar / Daily / Event / Money / Settings / Search / Archive / Migrationの責務を分離する。

特にCalendarとDailyでは、フロント側で繰り返し予定を個別に展開しない。

**Event + RecurrenceRule + Overrideを指定期間のOccurrenceへ展開する共通ProjectionサービスをWorker側に持ち、CalendarとDailyの両方から利用する。**

これにより、同じ予定がCalendarとDailyで違う形になることを防ぐ。

---

## 2. Calendar

```text
GET /api/calendar?month=2026-09
```

返却対象:

- 通常予定
- 繰り返し予定の対象月occurrence
- 今回だけ変更されたEventOccurrenceOverride
- 今回だけ削除されたoccurrenceの除外
- 複数日予定
- 今週中 / 今月中 / 日付範囲のperiod Event
- 日ごとのMoney収支差額
- お金タブ表示用のMoney occurrence

Calendar描画に必要な情報を1リクエストで取得できる形を基本とする。

---

## 3. Daily

```text
GET /api/daily?date=2026-09-10
```

返却対象:

- 終日予定
- 時間あり予定
- 当日を含むperiod Event
- 当日のお金集計
- お金明細
- DailyNote

Event occurrenceの生成にはCalendarと同じProjectionサービスを利用する。

---

## 4. Event

### 作成

```text
POST /api/events
```

### 詳細

```text
GET /api/events/:id
```

### 編集

```text
PATCH /api/events/:id
```

### 削除

```text
DELETE /api/events/:id
```

単発Eventは通常編集・削除。

繰り返しEventは操作時にscopeを指定する。

```text
scope = occurrence | following | series
```

意味:

- occurrence: 今回のみ
- following: この予定以降
- series: すべて

occurrence対象時はstableな `occurrenceKey` も渡す。

---

## 5. Event recent definitions

「以前の項目から選ぶ」用。

```text
GET /api/events/recent-definitions?limit=20
```

過去Eventから再利用可能な定義を返す。

日付など今回固有の値をそのままコピーせず、タイトル・場所・メモ・通知等の再利用可能フィールドを返す。

---

## 6. Money

### 月表示

```text
GET /api/money/month?month=2026-09
```

返却対象:

- 支出見込み
- 収入見込み
- 残りそう
- 確定済み / 予定の補助集計
- カテゴリ別集計
- Money occurrence一覧

### 作成

```text
POST /api/money
```

### 編集

```text
PATCH /api/money/:id
```

### 削除

```text
DELETE /api/money/:id
```

繰り返しMoneyでもEventと同じscopeを使用する。

```text
scope = occurrence | following | series
```

---

## 7. Money actual

occurrence単位の実績入力はMoneyItem本体の編集と分ける。

```text
PUT /api/money/:id/occurrences/:occurrenceKey/actual
```

主な用途:

- plannedからactualへ変更
- estimated_actualからactualへ変更
- actualの修正

月末時点で未確定のoccurrenceはサーバー処理でplannedAmountを `estimated_actual` としてDB保存する。

---

## 8. Money recent definitions

```text
GET /api/money/recent-definitions?limit=20
```

「以前の項目から選ぶ」用。

---

## 9. Search

```text
GET /api/search?q=美容院
```

初期検索対象:

- Event title
- Event place
- Event memo

必要に応じてMoney titleも検索対象に追加できる。

D1から削除済みのローカルアーカイブについては、端末側IndexedDB検索と結果を統合する。

---

## 10. Settings

```text
GET /api/settings
PATCH /api/settings
```

対象例:

- timezone
- weekStartsOn
- 朝まとめ通知時刻
- 夜まとめ通知時刻
- 通知ON/OFF
- その他個人設定

通知テンプレート・MoneyCategoryは必要に応じて独立APIに分離してよい。

---

## 11. Archive

古い履歴は端末IndexedDBへ保存してからD1から削除する。

### 候補取得

```text
GET /api/archive/candidates
```

### ローカル保存後の確定

```text
POST /api/archive/confirm
```

confirm時には対象ID・件数・checksum等を利用し、クライアントが保存確認していない履歴を削除しない。

---

## 12. Migration / 機種変更

### 機種変更準備

```text
POST /api/migration/prepare
```

D1側のエクスポート対象情報・メタデータを取得する。

IndexedDB分は端末側で統合し、完全JSONを生成する。

### 最終開始

```text
POST /api/migration/lock
```

このAPIは、保存済みJSONの再読込・validation・checksum確認後にのみ呼ぶ。

実行後:

- D1の移行対象データを整理/削除
- Userを `migration_locked` にする

### Import

```text
POST /api/migration/import
```

新端末でJSONからクラウド保持対象を復元する。

1年より古い履歴は端末側IndexedDBへ復元するため、すべてをD1へ戻さない。

### 完了

```text
POST /api/migration/complete
```

Calendar / Daily / Moneyの復元確認後にmigration lockを解除する。

---

## 13. Notification scheduling

通知APIとは別に、Worker内部で共通のOccurrence Projectionを利用して通知対象を計算する。

- 固定日時Event: occurrence開始日時基準
- 終日Event: 09:00基準
- period Event: deadlineDate + deadlineTime基準
- 朝夜まとめ通知: Settingsのユーザー指定時刻

Calendar表示用Occurrenceと通知用Occurrenceで別々のrecurrence実装を作らない。

---

## 14. API実装原則

- すべての個人データを `userId` で所有する
- Household / HouseholdMemberを持ち込まない
- timezoneを無視した日付境界計算をしない
- recurrenceをCalendar / Daily / Notificationごとに重複実装しない
- occurrenceKeyを安定させ、override / notification / edit scopeで共通利用する
- migration_locked中は通常の書き込みAPIを拒否する
- Production/default環境へ勝手にdeploy・migrationしない
