# LifeHub データモデル設計

## 1. 目的

LifeHub の中心ドメインである予定・繰り返し・お金・日メモ・通知・アーカイブ・機種変更を、HouseToDo の Task / Household モデルへ無理に寄せずに設計する。

本設計では以下を重視する。

- LifeHub は完全個人用とし、主要データはすべて `userId` で所有する
- Household / HouseholdMember / 担当者 / 共有範囲を持ち込まない
- 「日時が決まっている予定」と「期間中にやりたい予定」を明確に分離する
- Timing と Recurrence を別責務として扱う
- 将来 occurrence を大量に事前生成しない
- Event / Money の「今回のみ / これ以降 / すべて」を扱える
- Money の planned / actual / estimated_actual を履歴として安定して残す
- 古い履歴を D1 から IndexedDB へ移せる
- 機種変更時に JSON から完全復元できる
- Todo の完了状態を一切持たない

`RECURRENCE_AND_OCCURRENCE.md`、`NOTIFICATION_SPEC.md`、`MONEY_SPEC.md`、`BACKUP_AND_RETENTION.md`、`API_SPEC.md` と矛盾しないことを前提とする。

---

## 2. 全体像

```text
User
 ├─ LifeHubUserState
 ├─ UserSettings
 ├─ Event
 │   ├─ RecurrenceRule?
 │   ├─ EventNotification[]
 │   └─ EventOccurrenceOverride[]
 ├─ MoneyItem
 │   ├─ RecurrenceRule?
 │   ├─ MoneyOccurrenceOverride[]
 │   └─ MoneyOccurrenceSettlement[]
 ├─ DailyNote[]
 ├─ NotificationTemplate[]
 │   └─ NotificationTemplateOffset[]
 ├─ MoneyCategory[]
 ├─ NotificationDelivery[]
 └─ ArchiveMetadata[]
```

重要な分離:

- `Event / MoneyItem` = 元の定義
- `RecurrenceRule` = 繰り返し定義
- `Occurrence` = 指定期間に投影して得られる1回分。原則DBへ保存しない
- `OccurrenceOverride` = 特定1回だけの変更・除外
- `MoneyOccurrenceSettlement` = 特定1回の金額確定状態

HouseToDo の `weekly_flexible / monthly_flexible` のように Timing と Recurrence を1つの型へまとめない。

---

# 3. User / LifeHubUserState

認証用 `User / Session` は HouseToDo の仕組みを参考・流用候補とするが、LifeHub のドメインデータは共有単位を持たない。

## 3.1 LifeHubUserState

LifeHub 固有のアカウント状態を認証モデルから分離して持つ。

```text
LifeHubUserState
- userId PK
- migrationState: active | migration_locked
- migrationStartedAt nullable
- migrationBackupChecksum nullable
- migrationBackupCreatedAt nullable
- createdAt
- updatedAt
```

### active

通常利用可能。

### migration_locked

機種変更開始後から新端末での復元完了まで。

この状態では通常の Event / Money / DailyNote 書き込みを拒否する。

完了状態や Todo status の意味には利用しない。

---

# 4. UserSettings

ユーザーごとのアプリ設定。

```text
UserSettings
- userId PK
- timezone
- weekStartsOn

- morningSummaryEnabled
- morningSummaryTime       default 09:00
- eveningSummaryEnabled
- eveningSummaryTime       default 21:00

- periodDefaultDeadlineTime default 21:00

- createdAt
- updatedAt
```

終日 Event の単体通知基準時刻 09:00 は初期仕様では固定値としてよく、設定項目にしなくてよい。

将来設定化する場合のみフィールド追加する。

---

# 5. Event

予定の中心モデル。

## 5.1 主なフィールド

```text
Event
- id
- userId

- category: home | work
- title
- place nullable
- memo nullable

- timingType: scheduled | period

- allDay nullable

- startDate nullable
- startTime nullable
- endDate nullable
- endTime nullable

- periodWindowType nullable: this_week | this_month | custom_range
- periodStartDate nullable
- periodEndDate nullable
- deadlineTime nullable

- recurrenceRuleId nullable

- active
- deletedAt nullable
- createdAt
- updatedAt
```

`createdBy` は完全個人用のため持たない。

## 5.2 category

```text
home
work
```

- `home`: 家・私生活
- `work`: 仕事

共有範囲ではなく、同一ユーザー内の分類だけを意味する。

---

# 6. Event timingType

## 6.1 scheduled

日時が決まっている通常のカレンダー予定。

例:

- 9/10 15:00 歯医者
- 9/18〜9/20 東京旅行
- 毎週火曜 10:00 定例会議

### allDay = false

使用:

```text
startDate
startTime
endDate
endTime
```

### allDay = true

使用:

```text
startDate
endDate
```

時間は null。

単日終日は `startDate = endDate`。

scheduled の場合:

```text
periodWindowType = null
periodStartDate = null
periodEndDate = null
```

---

## 6.2 period

「実施する日時は決まっていないが、この期間のどこかに置いておきたい予定」。

Todoではなく予定として扱い、完了・未完了・チェック状態を持たない。

### periodWindowType

```text
this_week
this_month
custom_range
```

### this_week

その occurrence が属する週全体を期間として投影する。

`weekStartsOn` に従って開始日・終了日を計算する。

### this_month

その occurrence が属する月全体を期間として投影する。

### custom_range

指定した任意の日付範囲。

```text
periodStartDate
periodEndDate
```

を使用する。

初期仕様では recurrence 不可。

### deadlineTime

period の単体通知基準時刻。

未指定の場合は UserSettings の `periodDefaultDeadlineTime`、初期値 21:00 を使用する。

period の場合 `allDay` は意味を持たないため null とする。

---

# 7. period と recurrence の有効組み合わせ

初期仕様:

| periodWindowType | recurrenceなし | weekly | monthly | daily / その他 |
|---|---:|---:|---:|---:|
| this_week | ○ | ○ | × | × |
| this_month | ○ | × | ○ | × |
| custom_range | ○ | × | × | × |

無効な組み合わせはDB validationだけに頼らず、UI上でも選択肢自体を出さない。

---

# 8. RecurrenceRule

Event と MoneyItem で共通利用する純粋な繰り返し定義。

```text
RecurrenceRule
- id
- userId

- frequency: daily | weekly | monthly
- interval

- weekdays nullable
- dayOfMonth nullable

- startsOn
- endsOn nullable

- createdAt
- updatedAt
```

繰り返しなしは `recurrenceRuleId = null`。
`frequency = none` は持たない。

## 8.1 daily

```text
interval = 1  -> 毎日
interval = 2  -> 2日ごと
```

## 8.2 weekly

`weekdays` を使用する。

例:

- 毎週火曜
- 毎週火・木
- 2週間ごとの月曜

## 8.3 monthly

`dayOfMonth` を使用する。

31日が存在しない月などは、その月の末日へ丸める方針とする。

## 8.4 recurrence期間

```text
startsOn = 開始日
endsOn = null    -> ずっと
endsOn = date    -> その日まで
```

「これ以降編集」では既存Ruleを分割点直前で終了し、新しい Event / MoneyItem + RecurrenceRule を作る。

---

# 9. Occurrence Projection

将来 occurrence をDBへ大量生成しない。

Worker の共通 Projection サービスが、

```text
Base definition
+ RecurrenceRule
+ OccurrenceOverride
```

から指定期間の occurrence を生成する。

同じProjectionを以下で共通利用する。

- Calendar
- Daily
- Search結果の日時解決
- Notification scheduling
- Money月表示

## 9.1 stable occurrenceKey

特定1回を安定して識別する。

例:

```text
scheduled:
event:{eventId}:2026-09-15T10:00

weekly period:
event:{eventId}:week:2026-09-14

monthly period:
event:{eventId}:month:2026-09

money:
money:{moneyItemId}:2026-09-25
```

正確な文字列形式は実装時に固定する。

重要なのは、後から再Projectionしても同じ occurrence が同じ key になること。

---

# 10. EventOccurrenceOverride

繰り返し Event の「今回のみ編集 / 今回のみ削除」を保持する。

```text
EventOccurrenceOverride
- id
- userId
- eventId
- occurrenceKey

- overrideType: modified | cancelled

- title nullable
- category nullable
- place nullable
- memo nullable

- timingType nullable
- allDay nullable
- startDate nullable
- startTime nullable
- endDate nullable
- endTime nullable

- periodWindowType nullable
- periodStartDate nullable
- periodEndDate nullable
- deadlineTime nullable

- createdAt
- updatedAt
```

`eventId + occurrenceKey` は一意。

## modified

値がある項目だけ元Event定義を上書きする。

## cancelled

その occurrence を Calendar / Daily / Notification から除外する。

これは「完了」ではなく、その回の予定を削除したという意味。

### この予定以降

Overrideへ大量に保存せず、系列分割で表現する。

### すべて

元Event / RecurrenceRuleを編集、または系列をsoft deleteする。

---

# 11. EventNotification

1 Event に複数の単体通知 offset を持つ。

```text
EventNotification
- id
- userId
- eventId
- offsetMinutes
- sortOrder
- createdAt
```

例:

```text
1440 -> 1日前
30   -> 30分前
10   -> 10分前
```

通知テンプレートを選んだ場合も、適用時点で EventNotification へ値をコピーする。

テンプレート変更で既存 Event の通知を勝手に変えない。

## 通知基準

- scheduled / timeあり: occurrence開始日時
- scheduled / allDay: 当日09:00
- period: occurrence deadlineDate + deadlineTime

---

# 12. NotificationTemplate

```text
NotificationTemplate
- id
- userId
- name
- targetCategory nullable: home | work
- isDefault
- active
- createdAt
- updatedAt
```

```text
NotificationTemplateOffset
- id
- templateId
- offsetMinutes
- sortOrder
```

例:

```text
家の標準
- 1440
- 30
```

---

# 13. NotificationDelivery

Cron再実行やWorker retryで同じ通知を重複送信しないため、通知済み状態を occurrence 単位で管理する。

```text
NotificationDelivery
- id
- userId
- notificationType: event | morning_summary | evening_summary

- eventId nullable
- occurrenceKey nullable
- eventNotificationId nullable

- scheduledFor
- sentAt nullable
- status: pending | sent | failed

- createdAt
- updatedAt
```

Event単体通知では、少なくとも

```text
eventNotificationId + occurrenceKey + scheduledFor
```

が重複しないようにする。

朝夜まとめ通知も `userId + notificationType + scheduledFor` で重複送信を防ぐ。

---

# 14. DailyNote

1日全体に紐づく軽いメモ。

```text
DailyNote
- id
- userId
- date
- content
- createdAt
- updatedAt
```

`userId + date` は一意。

Event.memoとは別物。

- Event.memo: 予定固有
- DailyNote: その日全体

共有概念は持たない。

---

# 15. MoneyCategory

```text
MoneyCategory
- id
- userId
- type: expense | income
- name
- colorKey nullable
- sortOrder
- active
- createdAt
- updatedAt
```

初期カテゴリ:

### expense

- 食費
- 日用品
- 固定費
- 交通
- 医療
- 娯楽
- その他

### income

- 給料
- 臨時収入
- その他

ユーザーが設定画面から追加・編集可能。

---

# 16. MoneyItem

単発または繰り返しの支出・収入の基準定義。

```text
MoneyItem
- id
- userId

- type: expense | income
- title
- categoryId
- plannedAmount

- date
- time nullable

- recurrenceRuleId nullable
- memo nullable

- active
- deletedAt nullable
- createdAt
- updatedAt
```

金額は正数で保存し、expense / income によってUI上の符号を決める。

### 単発

```text
美容院
expense
plannedAmount: 8000
date: 2026-09-03
recurrenceRuleId: null
```

### 毎月

```text
電気代
expense
plannedAmount: 10000
recurrence: monthly
```

---

# 17. MoneyOccurrenceOverride

Money の特定 occurrence の「今回のみ編集 / 今回のみ削除」を表す。

金額の実績確定とは責務を分ける。

```text
MoneyOccurrenceOverride
- id
- userId
- moneyItemId
- occurrenceKey

- overrideType: modified | cancelled

- title nullable
- categoryId nullable
- plannedAmount nullable
- date nullable
- time nullable
- memo nullable

- createdAt
- updatedAt
```

`moneyItemId + occurrenceKey` は一意。

例:

- 今月だけ家賃予定額を変更
- 今回だけ日付変更
- 今回だけ削除

「これ以降」は Event と同じく系列分割で表現する。

---

# 18. MoneyOccurrenceSettlement

Money occurrence の金額確定状態を保存する。

`MoneyOccurrenceOverride` とは別テーブルにする。

```text
MoneyOccurrenceSettlement
- id
- userId
- moneyItemId
- occurrenceKey

- status: actual | estimated_actual
- amount

- finalizedAt
- updatedAt
```

`moneyItemId + occurrenceKey` は一意。

## 18.1 actual

ユーザーが実際の金額を入力した状態。

例:

```text
予定 10,000円
実績 5,200円
```

```text
status = actual
amount = 5200
```

## 18.2 estimated_actual

月末時点で actual がない occurrence を、当時の予定額で確定保存する。

```text
status = estimated_actual
amount = 10000
```

**amount自体を保存する。**

これにより、後から MoneyItem.plannedAmount や系列定義が変更されても過去月の金額が変わらない。

## 18.3 後から実績判明

```text
estimated_actual -> actual
amount = 実額
```

へ更新できる。

---

# 19. Moneyの表示額決定

## 現在月

1. `MoneyOccurrenceSettlement(status=actual)` があればその amount
2. それ以外は override 適用後の plannedAmount

現在月には月末前から estimated_actual を事前生成しない。

## 過去月

1. actual
2. estimated_actual

月末処理によりどちらかをDBに保存する。

このロジックは Calendar / Daily / Money画面で共通化する。

---

# 20. 「以前の項目から選ぶ」

専用Templateテーブルは初期必須にしない。

最近の Event / MoneyItem 定義から再利用候補を返す。

## Event

再利用候補:

- title
- category
- place
- memo
- timing種別
- recurrence設定
- notification設定

今回の context に依存する日付は新しい初期値へ置き換える。

## Money

- type
- title
- category
- plannedAmount
- recurrence設定
- memo

日付は新しい登録contextへ合わせる。

---

# 21. ArchiveMetadata

D1からIndexedDBへ退避した履歴の管理情報。

アーカイブ実データ自体は端末IndexedDB側に保持する。

D1には必要最低限のメタデータだけ残せる。

```text
ArchiveMetadata
- id
- userId
- archiveType: event | money | daily_note
- rangeStart
- rangeEnd
- itemCount
- checksum
- archivedAt
- createdAt
```

用途:

- どの期間がローカルへ移動済みか確認
- D1削除前の整合性確認
- 設定画面のアーカイブ状態表示

初期保持方針:

- D1: 直近1年 + 将来生成に必要な定義
- IndexedDB: 1年より古い履歴

親 recurrence 定義など未来に必要なものは年齢だけで削除しない。

---

# 22. 機種変更JSONに必要なモデル

JSONはCalendar / Daily / Moneyを完全復元できる情報を含む。

最低限:

- schemaVersion
- exportedAt
- appVersion
- UserSettings
- LifeHubUserStateに必要な移行情報（秘密情報を除く）
- Event
- RecurrenceRule
- EventOccurrenceOverride
- EventNotification
- NotificationTemplate / Offset
- DailyNote
- MoneyItem
- MoneyCategory
- MoneyOccurrenceOverride
- MoneyOccurrenceSettlement
- ArchiveMetadata
- D1保持中の履歴
- IndexedDBのアーカイブ履歴

含めないもの:

- password hash
- session token
- VAPID private key
- Cloudflare secrets
- その他認証秘密情報

機種変更ではJSONを保存・再読込・validation・checksum確認後にのみ D1整理と `migration_locked` へ進む。

---

# 23. D1から削除可能なもの / 残すもの

## 1年より古くなればアーカイブ可能

- 完全に過去となった単発Event
- 終了済みrecurrence系列の過去データ
- 古いEventOccurrenceOverride
- 古いMoney occurrence override / settlement
- 古いDailyNote

## 原則D1へ残す

- User / Session等の認証基盤
- UserSettings
- LifeHubUserState
- 現在も有効なEvent定義
- 現在も続くRecurrenceRule
- 現在も有効なMoneyItem
- NotificationTemplate
- MoneyCategory
- 通知スケジュールに必要なデータ
- ArchiveMetadataの必要部分

アーカイブはユーザーから見た削除ではない。
Calendar等ではD1 + IndexedDBを統合して表示する。

---

# 24. Soft delete

通常の単発予定・Moneyはユーザー操作で削除可能。

繰り返し系列全体の削除は、初期方針として `active = false` + `deletedAt` のsoft deleteを推奨する。

理由:

- occurrence overrideとの整合を保ちやすい
- 機種変更JSONや過去アーカイブの整合性を壊しにくい
- 誤ったcascade deleteを避けやすい

ただし、保持期間を過ぎてアーカイブ確認済みの古いsoft-deletedデータは物理削除可能。

---

# 25. LifeHubで持たないモデル

以下は中心モデルとして作らない。

- Household
- HouseholdMember
- HouseholdInvite
- assignedUser
- owner / member role
- Todo status
- completedAt
- completion record
- TaskRecord
- start / complete / skip / pass workflow
- Shopping
- HouseToDo の `weekly_flexible / monthly_flexible`
- 将来 occurrence の事前大量生成
- 共有家計簿モデル

LifeHubは予定アプリであり、period Eventを含めすべてのEventに「完了」という状態を持たせない。

---

# 26. HouseToDoから参考・流用するもの

## 直接または大部分流用候補

- User / Session / Cookie認証の基盤
- timezone-safe date utility
- weekStartsOnの考え方
- Web Push / Push subscription / Service Worker
- Cloudflare Workers / D1基盤

## 参考のみ

- recurrence projection
- month-day clamp
- occurrence / period key
- notification scheduler
- recent definitions UX

## 持ち込まない

- Household系
- Task model
- TaskRecord
- flexible Task recurrence型
- 完了 / skip workflow

---

# 27. 実装時の制約

- すべての主要クエリで `userId` ownershipを必ず確認する
- `householdId` をLifeHubドメインへ追加しない
- occurrenceKeyをEvent / Money / Notificationで安定して共有する
- Calendar / Daily / Notificationごとにrecurrence計算を別実装しない
- `estimated_actual` は月末時点の金額を `amount` として固定保存する
- migration_locked中は通常書き込みAPIを拒否する
- D1から履歴を消す前にIndexedDB保存・checksum確認を必須にする
- Production/default環境へ明示指示なくdeploy / migrationしない
