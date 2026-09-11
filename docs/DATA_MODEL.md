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

---

# 3. User / LifeHubUserState

認証用 `User / Session` は HouseToDo の仕組みを参考・流用候補とするが、LifeHub のドメインデータは共有単位を持たない。

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

`migration_locked` 中は通常の Event / Money / DailyNote 書き込みを拒否する。

M2では`users`、`sessions`、`lifehub_user_state`をlocal D1 migrationへ追加した。UserStateの初期値は`active`で、認証成功時にユーザーごとに初期生成する。migration操作とUIは後続milestoneの対象とする。

---

# 4. UserSettings

```text
UserSettings
- userId PK
- timezone
- weekStartsOn
- morningSummaryEnabled
- morningSummaryTime default 09:00
- eveningSummaryEnabled
- eveningSummaryTime default 21:00
- periodDefaultDeadlineTime default 21:00
- createdAt
- updatedAt
```

M2では`user_settings`をlocal D1 migrationへ追加し、認証成功後または`GET /api/settings`で初期生成する。初期値は`Asia/Tokyo`、`weekStartsOn=1`、朝夜まとめON、朝09:00、夜21:00、期間予定の既定締切21:00とする。全項目はAPIのstateとして保持し、画面ではtimezone / weekStartsOnを表示する。

終日Eventの単体通知基準09:00は初期仕様では固定値とする。

---

# 5. Event

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
- periodAnchorDate nullable
- periodStartDate nullable
- periodEndDate nullable
- deadlineTime nullable
- recurrenceRuleId nullable
- active
- deletedAt nullable
- createdAt
- updatedAt
```

`createdBy` は持たない。

## 5.1 scheduled

通常のカレンダー予定。

### allDay = false

```text
startDate
startTime
endDate
endTime
```

### allDay = true

```text
startDate
endDate
```

時間はnull。単日終日は `startDate = endDate`。

scheduledではperiod系フィールドはnull。

M3では`timing_type=scheduled`の行だけを作成し、period系・recurrenceRule・notificationの保存は行わなかった。M5ではscheduled EventのrecurrenceRuleを保存する。`allDay=1`の行は`start_time`と`end_time`をnullにし、`allDay=0`の行は両時刻を必須とする。Eventの通常削除は`active=0 + deletedAt`で表す。

## M6時点の実装範囲

- scheduled Eventのschema / migration / repository / projectionはM4の実データ対象である。
- DailyNoteはM4でmigration / API / UIを実装し、`userId + date`を一意とする。空保存は削除として扱う。
- scheduled recurrenceとperiod Eventのschema / projection / overrideは実装済み。notification / Money recurrenceは将来設計として残す。

M5のseries scopeはbase Event / Ruleを更新するため、過去を含む未override occurrenceのprojectionも新しい定義に従う。過去occurrenceを保護する必要がある1回はmodified overrideとして保持する。following scopeは元Ruleを対象直前で終了し、過去projectionを変更しない。

## 5.2 period

「実施日時は決まっていないが、この期間のどこかに置いておきたい予定」。Todoではなく予定として扱い、完了状態を持たない。

### periodWindowType

- `this_week`
- `this_month`
- `custom_range`

### periodAnchorDate

`this_week / this_month` が**どの週・どの月を基準に作られた予定か**を安定して復元するための基準日。

例:

```text
periodWindowType = this_week
periodAnchorDate = 2026-09-07
```

この日が属する週を `weekStartsOn` に従って投影する。

```text
periodWindowType = this_month
periodAnchorDate = 2026-09-07
```

この日が属する月を投影する。

`createdAt` から期間を推測しない。

繰り返しperiodでは、元Eventのanchorを基準に各week/month occurrenceを生成する。

### custom_range

```text
periodStartDate
periodEndDate
```

を使用し、`periodAnchorDate = null`。初期仕様ではrecurrence不可。

### deadlineTime

period単体通知の基準時刻。未指定ならUserSettingsの21:00を利用する。

periodでは `allDay = null`。

---

# 6. period と recurrence

| periodWindowType | recurrenceなし | weekly | monthly | daily / その他 |
|---|---:|---:|---:|---:|
| this_week | ○ | ○ | × | × |
| this_month | ○ | × | ○ | × |
| custom_range | ○ | × | × | × |

UIでも無効な選択肢を出さない。

---

# 7. RecurrenceRule

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

繰り返しなしはruleなし。

UI上の「カスタム」はfrequency値ではない。詳細設定入口を意味し、最終的には `daily / weekly / monthly + interval / weekdays / dayOfMonth` に正規化する。

例:

```text
2週間ごとの月・水
frequency = weekly
interval = 2
weekdays = [mon, wed]
```

31日指定等は短い月では月末へ丸める。

---

# 8. Occurrence Projection

将来occurrenceをDBへ大量生成しない。

Workerの共通Projectionサービスが、Base definition + RecurrenceRule + OccurrenceOverrideから指定期間のoccurrenceを生成する。

共通利用先:

- Calendar
- Daily
- Search日時解決
- Notification
- Money月表示

stableな `occurrenceKey` を使う。

例:

```text
event:{eventId}:2026-09-15T10:00
event:{eventId}:week:2026-09-14
event:{eventId}:month:2026-09
money:{moneyItemId}:2026-09-25
```

---

# 9. EventOccurrenceOverride

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
- periodAnchorDate nullable
- periodStartDate nullable
- periodEndDate nullable
- deadlineTime nullable
- createdAt
- updatedAt
```

`eventId + occurrenceKey` は一意。

M5ではmodified overrideのnull（場所・メモを消す等）と未変更を区別するため、仕様列に加えて内部payload JSONも保存する。APIからは`patch`としてscheduled Event fieldsだけを返す。

`cancelled` はその回を削除した意味であり、完了ではない。

「これ以降」は系列分割、「すべて」は元定義を更新またはsoft deleteする。

---

# 10. PushSubscription

```text
PushSubscription
- id
- userId
- endpoint
- endpointHash
- p256dh
- auth
- enabled
- disabledAt nullable
- lastSuccessAt nullable
- lastFailureAt nullable
- createdAt
- updatedAt
```

`userId + endpoint`を一意とし、1 userの複数端末を許可する。404 / 410は該当subscriptionだけを無効化する。

---

# 11. EventNotification

```text
EventNotification
- id
- userId
- eventId
- offsetMinutes
- sortOrder
- createdAt
```

通知基準:

- scheduled / timeあり: occurrence開始日時
- scheduled / allDay: 当日09:00
- period: occurrence deadlineDate + deadlineTime

テンプレート適用時はoffsetをEventNotificationへコピーする。

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

---

# 13. NotificationDelivery

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

Event単体通知では `eventNotificationId + occurrenceKey + scheduledFor`、まとめ通知では `userId + notificationType + scheduledFor` の重複を防ぐ。

---

# 13. DailyNote

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

M4では`daily_notes`をmigration `0004_m4_daily_notes.sql`で追加し、Daily取得に含める。本文が空になった場合は行を削除してempty stateとして扱う。

---

# 14. MoneyCategory

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

初期expense: 食費 / 日用品 / 固定費 / 交通 / 医療 / 娯楽 / その他。
初期income: 給料 / 臨時収入 / その他。

---

# 15. MoneyItem

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

金額は正数保存。符号はtypeで決める。

`recurrenceRuleId`は既存`recurrence_rules`へのuserId所有参照として利用する。occurrenceは要求範囲へprojectionし、大量事前生成しない。M9では例外状態だけをMoney occurrence専用tableへ保存する。

---

# 16. MoneyOccurrenceOverride

Moneyの特定occurrenceの「今回のみ編集 / 今回のみ削除」。金額の実績確定とは分離する。

```text
MoneyOccurrenceOverride
- id
- userId
- moneyItemId
- occurrenceKey
- overrideType: modified | cancelled
- type nullable
- title nullable
- categoryId nullable
- plannedAmount nullable
- date nullable
- patchJson nullable
- memo nullable
- createdAt
- updatedAt
```

`moneyItemId + occurrenceKey` は一意。

`userId`はMoneyItemと同一ownerで、`money_item_id`削除時はcascadeする。`modified`は非null patchを保存し、`cancelled`はcancel markerとして保存する。

---

# 17. MoneyOccurrenceSettlement

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
- estimatedAmount nullable（estimated_actualをactualへ置換した後、actual取消時に固定値へ戻すための内部保持）
```

`moneyItemId + occurrenceKey` は一意。

月末actual未入力時は、その時点の予定額を `estimated_actual.amount` としてDBへ固定保存する。

後から実額が分かれば `actual` へ更新できる。

現在月表示:

1. actualがあればamount
2. なければoverride適用後plannedAmount

過去月表示:

1. actual
2. estimated_actual

現在月・未来はactualがなければeffective plannedへ戻る。SettlementはOverrideと別tableであり、base plannedAmountを変更しない。

---

# 18. 「以前の項目から選ぶ」

専用Templateテーブルは初期必須にしない。

Eventはtitle/category/place/memo/timing/recurrence/notification等、Moneyはtype/title/category/plannedAmount/recurrence/memo等を再利用する。日付は新しいcontextを優先する。

---

# 19. ArchiveMetadata

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

D1は直近1年 + 将来生成に必要な定義、IndexedDBは1年より古い履歴を基本とする。

---

# 20. 機種変更JSON

Calendar / Daily / Moneyを完全復元できる情報を含む。

最低限:

- schemaVersion / exportedAt / appVersion
- UserSettings
- Event / RecurrenceRule / EventOccurrenceOverride / EventNotification
- NotificationTemplate / Offset
- DailyNote
- MoneyItem / MoneyCategory / MoneyOccurrenceOverride / MoneyOccurrenceSettlement
- ArchiveMetadata
- D1保持履歴
- IndexedDBアーカイブ履歴

password hash / session token / VAPID private key / Cloudflare secrets等は含めない。

---

# 21. D1保持・削除

1年より古く完全に過去となった履歴は、IndexedDB保存・checksum確認後にアーカイブ可能。

現在も有効なEvent / RecurrenceRule / MoneyItem / UserSettings / Template / Categoryなど将来に必要な定義は年齢だけで削除しない。

---

# 22. Soft delete

系列全体削除は `active=false + deletedAt` を基本とする。

アーカイブ確認済みの古いsoft-deletedデータは物理削除可能。

---

# 23. 持たないモデル

- Household / HouseholdMember / HouseholdInvite
- assignedUser / owner-member role
- Todo status / completedAt / completion record
- TaskRecord
- start / complete / skip / pass
- Shopping
- weekly_flexible / monthly_flexible
- 将来occurrenceの事前大量生成
- 共有家計簿

---

# 24. 実装時の制約

- 全主要クエリで `userId` ownershipを確認する
- `householdId` をLifeHubドメインへ追加しない
- occurrenceKeyをEvent / Money / Notificationで安定共有する
- Calendar / Daily / Notificationごとにrecurrence計算を別実装しない
- `createdAt` からperiodの対象週/月を推測しない
- `estimated_actual` は月末時点の金額を固定保存する
- migration_locked中は通常書き込みAPIを拒否する
- D1削除前にIndexedDB保存・checksum確認を必須にする
- Production/defaultへ明示指示なくdeploy / migrationしない

## 25. M12 Local Archive schema

M12のIndexedDBは `lifehub-archive`、schemaVersion `1` とする。

```text
archiveBatches: id, userId, schemaVersion, archivedAt, retentionBoundary,
  minDate, maxDate, recordCount, recordCountsByType, checksum, status, confirmedAt?
archiveRecords: rowKey, archiveBatchId, type, id, userId, recordDate?, updatedAt?, record
archivedSearchIndex: id, archiveBatchId, userId, type, recordId, text
```

ArchiveRecordは表示再構築用snapshotをbatch内に保持する。全storeはuserIdでscopeし、batch保存はtransaction、putはidempotentとする。D1の `archive_batches` はchecksum、manifest、recordCount、retentionBoundary、candidate / confirmed statusだけを保持し、archive内容そのものを複製しない。

M12ではJSON export / import、migration_locked、機種変更flowは持たない。
