# LifeHub データモデル設計

## 1. 目的

LifeHub の中心ドメインである予定・繰り返し・お金・日メモ・通知を、HouseToDo の Task モデルへ無理に寄せずに設計する。

本設計では以下を重視する。

- Event と Money で共通利用できる recurrence を持つ
- 「日時が決まっている予定」と「期間中にやりたい」を明確に分離する
- 繰り返し定義と、実際の日付ごとの発生を分ける
- ズボラ家計簿の planned / actual / estimated_actual を自然に扱える
- HouseToDo の Auth / Household / timezone 基盤を利用できる
- UI の Progressive Disclosure と整合する

---

## 2. 全体像

```text
User
  └─ HouseholdMember
        └─ Household
             ├─ Event
             │    ├─ RecurrenceRule
             │    └─ EventNotification[]
             │
             ├─ MoneyItem
             │    ├─ RecurrenceRule
             │    └─ MoneyOccurrenceOverride[]
             │
             ├─ DailyNote
             │
             ├─ NotificationTemplate
             │    └─ NotificationTemplateOffset[]
             │
             └─ MoneyCategory
```

重要なのは、`Event` と `MoneyItem` が共通の `RecurrenceRule` を利用する点。

HouseToDo の `weekly_flexible / monthly_flexible` のように recurrence と期間 scope を1つの型へまとめず、LifeHubでは責務を分離する。

---

# 3. Event

予定の中心モデル。

## 3.1 主なフィールド

```text
Event
- id
- householdId
- createdBy

- category: home | work
- title
- place nullable
- memo nullable

- timingType: scheduled | period
- allDay

- startDate
- startTime nullable
- endDate
- endTime nullable

- recurrenceRuleId nullable

- active
- createdAt
- updatedAt
```

## 3.2 category

```text
home
work
```

HouseToDo の assignedUser / 担当者とは別概念。

- `home`: 家・私生活側の予定
- `work`: 仕事側の予定

共有範囲については別途確定する。

## 3.3 timingType

### scheduled

日時が決まっている通常予定。

例:

- 9/10 15:00 歯医者
- 9/18〜9/20 東京旅行

### period

期間中にやりたいが、実施日時は未定の項目。

例:

- 9/8〜9/12の間にクリーニングを取りに行く
- 9/1〜9/30の間に美容院へ行く

HouseToDo の flexible Task をそのまま持ち込まず、Event 自体の timingType として明示する。

## 3.4 scheduled の日時ルール

### allDay = false

使用:

- startDate
- startTime
- endDate
- endTime

### allDay = true

使用:

- startDate
- endDate

時間は null。

単日終日は `startDate = endDate`。

## 3.5 period の日時ルール

使用:

- startDate
- endDate

時間は持たない。

`allDay` は UI 上不要。内部では true 相当として扱ってよいが、timingType を正とする。

---

# 4. RecurrenceRule

Event と MoneyItem の共通繰り返しモデル。

## 4.1 方針

HouseToDo の recurrence 計算は参考にするが、Task recurrence 型はコピーしない。

LifeHubでは recurrence を「何回発生するか」だけの責務にする。

## 4.2 主なフィールド

```text
RecurrenceRule
- id

- frequency: daily | weekly | monthly
- interval

- weekdays nullable
- dayOfMonth nullable

- startsOn
- endsOn nullable

- createdAt
- updatedAt
```

繰り返しなしの場合は `recurrenceRuleId = null` とする。

`frequency = none` は持たせない。

## 4.3 frequency

### daily

例:

- 毎日
- 2日ごと

`interval = 1 / 2 ...`

### weekly

例:

- 毎週火曜
- 毎週火・木
- 2週間ごとの月曜

`weekdays` を利用する。

### monthly

例:

- 毎月10日
- 毎月31日

`dayOfMonth` を利用する。

短い月で31日等が存在しない場合は、HouseToDo の既存 date utility の考え方を参考に、その月の末日に丸める。

## 4.4 繰り返し期間

### ずっと

```text
startsOn = 開始日
endsOn = null
```

### 指定日まで

```text
startsOn = 開始日
endsOn = 終了日
```

### 開始〜終了

同じく startsOn / endsOn で表現する。

UIでは「ずっと / ○日まで / 期間指定」と見せても、内部表現は startsOn / endsOn に統一する。

---

# 5. Event と RecurrenceRule の関係

Eventは1つの recurrence rule を持てる。

```text
Event
  recurrenceRuleId -> RecurrenceRule.id
```

繰り返しなしなら null。

## 5.1 発生データ

通常の繰り返しEventは、将来分をDBへ大量生成しない。

Event + RecurrenceRule から対象期間の occurrence を計算する。

例:

```text
Event
タイトル: 定例会議
開始時刻: 10:00

RecurrenceRule
frequency: weekly
weekdays: [2]
```

Calendarが9月を要求した場合、9月に該当する火曜日の occurrence を計算して返す。

HouseToDo の projection / date utility の考え方は参考にする。

## 5.2 occurrence key

繰り返し予定の特定1回を一意に識別できるキーを持つ設計を推奨する。

例:

```text
event:{eventId}:{occurrenceDate}
```

将来、1回分だけ編集・除外・通知済み管理等を行うときに利用できる。

単一 occurrence の編集・除外仕様は現時点では未確定。

---

# 6. EventNotification

1予定に複数通知を持たせる。

HouseToDo の単一 `notificationOffsetMinutes` はそのままコピーしない。

## 6.1 モデル

```text
EventNotification
- id
- eventId
- offsetMinutes
- sortOrder
```

例:

```text
1440  -> 1日前
30    -> 30分前
```

予定自身には解決済みの通知 offset を保存する。

NotificationTemplate を利用した場合も、EventNotification へ値を展開して保持する案を基本とする。

これによりテンプレートを後から変更しても、既存予定の通知内容が勝手に変わらない。

---

# 7. NotificationTemplate

設定画面で作る通知プリセット。

```text
NotificationTemplate
- id
- householdId
- name
- targetCategory nullable
- isDefault
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

```text
仕事の標準
- 1440
- 10
```

`targetCategory` は `home / work / null` を想定。

---

# 8. DailyNote

1日全体に紐づく軽いメモ。

```text
DailyNote
- id
- householdId
- userId
- date
- content
- createdAt
- updatedAt
```

原則として `userId + date` につき1件。

Event.memo とは別物。

- Event.memo: 予定固有の情報
- DailyNote: その日全体の振り返り

共有範囲は別途確定する。

---

# 9. MoneyCategory

支出・収入カテゴリ。

```text
MoneyCategory
- id
- householdId
- type: expense | income
- name
- sortOrder
- active
- createdAt
- updatedAt
```

初期カテゴリセットは未確定。

---

# 10. MoneyItem

ズボラ家計簿の定義モデル。

単発・繰り返しの支出/収入を同じモデルで扱う。

```text
MoneyItem
- id
- householdId
- createdBy

- type: expense | income
- title
- categoryId
- plannedAmount

- date
- time nullable

- recurrenceRuleId nullable
- memo nullable

- active
- createdAt
- updatedAt
```

例:

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
date: 初回基準日
recurrenceRule: monthly
```

### 収入

```text
給料
income
plannedAmount: 210000
recurrenceRule: monthly
```

---

# 11. MoneyOccurrenceOverride

繰り返しMoneyItemの「その回だけ違う実績」を保持する。

MoneyItem本体の plannedAmount は将来の基準額として維持する。

```text
MoneyOccurrenceOverride
- id
- moneyItemId
- occurrenceDate

- actualAmount nullable
- status: actual | estimated_actual

- createdAt
- updatedAt
```

## 11.1 actual

ユーザーが実際の金額を入力した状態。

例:

```text
電気代予定 10,000円
9月実績 5,000円
```

MoneyItem.plannedAmount は10,000円のまま。

9月 occurrence の override:

```text
actualAmount = 5000
status = actual
```

10月は再び10,000円予定として計算される。

## 11.2 estimated_actual

月末までactualが入力されなかった場合、plannedAmountをそのまま実績相当として扱う。

例:

```text
plannedAmount = 10000
actualAmount = null
status = estimated_actual
```

表示・集計時には plannedAmount の10,000円を利用する。

内部的にはactualとの違いを保持する。

## 11.3 current month

現在月はDBへestimated_actualを先に作らず、以下の優先順位で表示する。

1. actual overrideがあればactualAmount
2. なければplannedAmount

つまり現在月の合計は「着地見込み」。

## 11.4 past month

月終了後は以下で履歴として扱う。

1. actualがあればactual
2. actualがなければestimated_actualとしてplannedAmount

estimated_actualをDBへ明示的に確定するタイミングは今後決める。

---

# 12. MoneyItem と RecurrenceRule

Eventと同じRecurrenceRuleを使用する。

```text
MoneyItem
  recurrenceRuleId -> RecurrenceRule.id
```

これにより、

- 毎日食費
- 毎週の支出
- 毎月の家賃
- 毎月の給料
- 期間限定の定期支出

を共通ロジックで扱える。

Event固有・Money固有のロジックをRecurrenceRuleへ混ぜない。

---

# 13. 「以前の項目から選ぶ」

HouseToDoのUXを参考にする。

ただしTemplate専用データを必須にはしない。

初期案では、最近登録したEvent / MoneyItemの定義から再利用候補を取得する。

### Eventで再利用するもの

- title
- category
- place
- memo
- allDay
- recurrence設定
- notification設定

日付は新しい登録contextへ合わせる。

### Moneyで再利用するもの

- type
- title
- category
- plannedAmount
- recurrence設定
- memo

日付は新しい登録contextへ合わせる。

必要性が出た場合のみ、将来専用Templateモデルを追加する。

---

# 14. Household / Userとの関係

HouseToDoから以下の基盤を流用する。

- User
- Session
- Household
- HouseholdMember
- timezone
- weekStartsOn

LifeHubの主要データは原則 `householdId` を持つ。

ただし以下の共有範囲は未確定。

- work Eventを家庭メンバーへ見せるか
- DailyNoteを家庭共有するか個人専用にするか
- Moneyを家庭共有するかユーザー単位にもできるようにするか

この3点はUI設計と合わせて今後確定する。

---

# 15. 現時点で作らないもの

初期設計では以下を中心モデルにしない。

- Todo status
- TaskRecord
- start / complete / skip workflow
- Shopping
- HouseToDoのweekly_flexible / monthly_flexible
- 将来 occurrence の事前大量生成
- 厳密な複式簿記
- 資産残高管理

---

# 16. HouseToDoからの参照方針

## そのまま参考・抽出候補

- timezone-safe date key
- weekday calculation
- days in month
- monthly day clamp
- start/end range utility
- occurrence keyの考え方
- repository/service/routeの分離
- validation構成
- form state -> API payload変換

## そのままコピーしない

- TaskModelRecurrenceType
- weekly_flexible
- monthly_flexible
- TaskRecord period scope
- Task status
- Shopping model

---

# 17. 現在の未確定事項

次の設計フェーズで決める。

1. 家 / 仕事 Event の共有範囲
2. DailyNote の共有範囲
3. Money の共有単位
4. recurring Event の1回だけ編集 / 削除する仕様
5. period Event と recurrence を組み合わせる詳細ルール
6. estimated_actual をDBへ確定するタイミング
7. MoneyCategoryの初期セット
8. NotificationTemplate変更時の既存Eventへの影響（現案は影響させない）

未確定項目をHouseToDoの仕様で自動補完しないこと。
