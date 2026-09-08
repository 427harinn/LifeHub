# LifeHub API仕様

## 1. 基本方針

LifeHubではCalendar / Daily / Event / Money / DailyNote / Settings / NotificationTemplate / MoneyCategory / Search / Archive / Migrationの責務を分離する。

Calendar / Daily / Notification / Search日時解決では、**Event + RecurrenceRule + OverrideをOccurrenceへ展開する共通Projectionサービス**を利用する。

すべての個人データは `userId` ownershipを確認する。

## M5時点の実装範囲

M4で実API / DB projectionの対象になるのは、`timingType=scheduled`のEventとDailyNoteである。CalendarとDailyは同じEvent projection / range serviceを利用し、`userId` ownershipを条件に含め、activeでないEventと`deletedAt`があるEventを除外する。

period / notification / Money / Searchの本実装は後続Milestoneとする。M4 UIで確認するperiod / Moneyの一部はfixture / placeholderであり、M5ではscheduled recurrenceだけを永続化・projectionする。

M2で実装する認証APIは以下。Session tokenはD1へ平文保存せずSHA-256 hashとして保存し、ブラウザにはHttpOnly / SameSite=Lax Cookieだけを返す。

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/user-state
```

register / login成功時に `LifeHubUserState` と `UserSettings` が存在しない場合は初期生成する。未認証の通常APIは401を返す。

---

## 2. Calendar

```text
GET /api/calendar?month=2026-09
```

M4では月表示の42セルに必要なグリッド範囲（先頭週の日曜日から6週目の土曜日まで）だけを取得する。返却の`range`はこの取得範囲を表す。Calendarは`EventProjectionService`を利用し、Dailyや他の日時解決処理とEventの重なり判定を共有する。

返却対象:

M4実装済み:

- activeなscheduled Event occurrence
- cancelled / deleted Eventの除外
- scheduledの複数日予定

M4 UI確認用または後続範囲:

- period Eventの表示fixture
- 日ごとのMoney収支差額 / お金タブ用Money明細の表示fixture
- recurrence occurrence / EventOccurrenceOverride

Calendar描画に必要な情報を1リクエストで取得する。

返却例:

```json
{
  "month": "2026-09",
  "range": { "startDate": "2026-08-30", "endDate": "2026-10-10" },
  "events": []
}
```

---

## 3. Daily

```text
GET /api/daily?date=2026-09-10
```

返却対象:

M4実装済み:

- scheduledの終日予定 / 時間あり予定
- 指定日と重なるscheduled複数日予定
- DailyNote

M4 UI確認用または後続範囲:

- period予定
- 当日Money集計 / 明細

Calendarと同じProjectionを利用する。

M4では指定日の1日分だけをrangeとして投影する。複数日scheduled Eventは指定日と重なる場合だけ返し、activeでないEvent、`deletedAt`があるEventは返さない。

---

## 4. Event

```text
POST   /api/events
GET    /api/events/:id
PATCH  /api/events/:id
DELETE /api/events/:id
```

M6では`timingType=period`も永続化・projectionする。scheduledとperiodは互いの日時フィールドを持たず、periodは`periodWindowType`、anchorまたはcustom range、`deadlineTime`を使用する。

```text
GET /api/events?startDate=2026-09-01&endDate=2026-09-30
```

list / detail / update / deleteは、認証ユーザーの`userId`を必ず条件に含める。他ユーザーのIDは存在を推測できないよう404とする。DELETEは`active=false`と`deletedAt`を設定するsoft deleteとする。

繰り返しEventでは:

```text
scope = occurrence | following | series
```

を指定する。

occurrence対象ではstableな `occurrenceKey` を必須とする。

作成・series編集のpayloadでは`recurrence`を指定する。なしは`null`で、指定時は`frequency / interval / weekdays / dayOfMonth / startsOn / endsOn`を含める。PATCH / DELETEのscopeは次の動作とする。

- `occurrence`: `occurrenceKey`必須。PATCHはmodified override、DELETEはcancelled override
- `following`: `occurrenceKey`必須。元Ruleを対象日直前で終了し、PATCHだけ新Event + Ruleを作成
- `series`: base Event / Ruleを編集、DELETEは`active=false + deletedAt`

`occurrence`は選択した1回だけ、`following`は選択した回から先だけを対象とし、過去occurrenceは変更しない。`series`は過去を含むseries全体を対象とするため、base Event / Ruleの編集後は未overrideの過去projectionも新定義に従う。series削除はsoft deleteで過去・将来を含むactive projectionから除外する。

scope指定時もEvent、Rule、Overrideすべてで認証userId ownershipを確認し、他ユーザーのIDは404とする。

period Eventの `this_week / this_month` 作成時は `periodAnchorDate` を保存する。

periodの作成・更新validationは次を適用する。

- `this_week / this_month` は`periodAnchorDate`必須
- `custom_range` は`periodStartDate <= periodEndDate`、`periodAnchorDate = null`、recurrence不可
- `this_week` はなし / weekly、`this_month`はなし / monthlyだけを許可
- periodではscheduledのdate/time fieldをnullにし、scheduledではperiod fieldをnullにする

period recurrenceのprojectionは、Calendarでは週開始日 / 月初 / custom range開始日にだけ表示し、Daily / Date Sheetでは対象期間内の日に表示する。stable keyは`event:{eventId}:week:{weekStart}`、`event:{eventId}:month:{YYYY-MM}`、`event:{eventId}:range:{periodStartDate}`を使用する。

---

## 5. Event recent definitions

```text
GET /api/events/recent-definitions?limit=20
```

再利用可能な定義を返し、過去の日付はそのままコピーしない。

M3のrecent候補は現在ユーザーのactiveなEventから返し、フォーム入口のcategoryを維持して、title / allDay / time / place / memoだけを新しい日付contextへコピーする。

---

## 6. Money（後続Milestone）

Moneyモデル / APIの本実装はM8以降の対象とする。M4のCalendar / Daily UIに表示するMoneyはfixture / placeholderを含む確認用projectionであり、productionのMoney永続化を意味しない。

```text
GET    /api/money/month?month=2026-09
POST   /api/money
GET    /api/money/:id
PATCH  /api/money/:id
DELETE /api/money/:id
```

繰り返しMoneyも:

```text
scope = occurrence | following | series
```

を共通利用する。

月表示は:

- 支出見込み
- 収入見込み
- 残りそう
- 確定済み / 予定の補助集計
- カテゴリ別集計
- occurrence一覧

を返す。

---

## 7. Money actual

```text
PUT /api/money/:id/occurrences/:occurrenceKey/actual
DELETE /api/money/:id/occurrences/:occurrenceKey/actual
```

用途:

- planned → actual
- estimated_actual → actual
- actual修正
- actual取消

月末処理でactual未入力occurrenceは `estimated_actual` として当時の予定額をDB保存する。

---

## 8. Money recent definitions

```text
GET /api/money/recent-definitions?limit=20
```

---

## 9. DailyNote

日付ごとに1件。

```text
PUT    /api/daily-notes/:date
DELETE /api/daily-notes/:date
```

`PUT` はcreate/updateを兼ねる。DailyNoteのmigration / API / UIはM4で実装済みである。

`userId + date`を一意キーとする。`content`が空文字または空白だけの場合、PUTはその日付のDailyNoteを削除し`dailyNote: null`を返す。DELETEは対象がなくても成功扱いとする。

Daily画面の取得は `/api/daily` に含め、編集だけ独立APIにする。

---

## 10. Search

```text
GET /api/search?q=美容院
```

初期検索対象:

- Event title
- Event place
- Event memo

D1からアーカイブ済みの履歴は端末側IndexedDB検索と統合する。

---

## 11. Settings

```text
GET   /api/settings
PATCH /api/settings
```

対象:

- timezone
- weekStartsOn
- morningSummaryEnabled
- morningSummaryTime
- eveningSummaryEnabled
- eveningSummaryTime
- periodDefaultDeadlineTime

---

## 12. NotificationTemplate

```text
GET    /api/notification-templates
POST   /api/notification-templates
PATCH  /api/notification-templates/:id
DELETE /api/notification-templates/:id
```

削除は既存EventNotificationへ影響させない。

デフォルトテンプレート設定もこのAPIで扱う。

---

## 13. MoneyCategory

```text
GET    /api/money-categories
POST   /api/money-categories
PATCH  /api/money-categories/:id
DELETE /api/money-categories/:id
```

既存MoneyItemが参照中のカテゴリを完全削除せず、必要ならinactive扱いにする。

---

## 14. Archive

```text
GET  /api/archive/candidates
POST /api/archive/confirm
```

confirm時には対象ID / 件数 / checksum等を検証する。

クライアントのIndexedDB保存成功確認前にD1削除しない。

---

## 15. Migration / 機種変更

```text
POST /api/migration/prepare
POST /api/migration/lock
POST /api/migration/import
POST /api/migration/complete
```

### prepare

D1側のエクスポート対象とメタデータを取得する。IndexedDB分とクライアントで統合する。

### lock

保存済みJSONを再読込し、schema / checksum / validation確認後にのみ呼ぶ。

実行後:

- 移行対象D1データ整理
- `migration_locked`

### import

新端末で最近1年分 + 将来必要な定義をD1へ復元する。1年より古い履歴はIndexedDBへ復元する。

### complete

Calendar / Daily / Money再構築確認後にlock解除。

---

## 16. Notification scheduling

Worker内部の共通Projectionを利用する。

- scheduled / timeあり: occurrence開始
- all-day: 09:00
- period: deadlineDate + deadlineTime
- 朝夜まとめ: UserSettings時刻

periodは有効期間内ならまとめ通知対象、期限後は対象外。

---

## 17. migration_locked

通常書き込みAPIを拒否する。

許可:

- migration import / complete
- 必要な認証・状態確認

通常Event / Money / DailyNote / Settings変更は不可。

M2では機種変更フロー自体とlock操作UIは未実装だが、Workerの`requireWritableUserState` guardをSettings writeへ適用し、将来の通常write APIへ同じguardを適用できる構造にする。

---

## 18. API実装原則

- userId ownership必須
- Household / HouseholdMemberを持ち込まない
- timezoneを無視した境界計算をしない
- recurrenceを重複実装しない
- occurrenceKeyをoverride / notification / edit scopeで共通利用する
- periodAnchorDateをcreatedAtで代用しない
- actual / estimated_actual集計を画面ごとに重複実装しない
- migration_lockedをWorker側で強制する
- stagingでmigration/API検証後にPRを作る
- Production/defaultへ明示指示なしでdeploy / migrationしない
