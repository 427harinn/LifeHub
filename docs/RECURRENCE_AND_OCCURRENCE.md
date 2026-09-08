# LifeHub 繰り返し・発生回・期間予定設計

## 1. 目的

LifeHubの予定における以下を定義する。

- scheduled Eventの繰り返し
- period Eventの繰り返し
- occurrence識別
- 今回のみ / これ以降 / すべて の編集・削除

LifeHubは完全個人用であり、完了状態は持たない。

---

## 2. 大原則

予定は2軸を分ける。

### Timing

- `scheduled`
- `period`

### Recurrence

DB上のfrequency:

- `daily`
- `weekly`
- `monthly`

繰り返しなしはruleなし。

UI上の「カスタム」はfrequencyではなく、interval / weekdays / dayOfMonth等の詳細設定入口。

---

## 3. scheduled の繰り返し

通常のカレンダーと同様に繰り返せる。

例:

- 毎週火曜10:00 定例会議
- 毎月25日 給料日
- 毎日08:00 薬
- 2週間ごとの月・水

---

## 4. period

実施日時は未定だが、期間のどこかに置いておく予定。

### periodWindowType

- `this_week`
- `this_month`
- `custom_range`

### periodAnchorDate

`this_week / this_month` の対象期間を安定して決める基準日。

例:

```text
periodWindowType = this_week
periodAnchorDate = 2026-09-07
```

`weekStartsOn` に従い、そのanchorが属する週を対象にする。

`this_month` ではanchorが属する月を対象にする。

`createdAt` から対象期間を推測しない。

Calendar / Dailyから追加した場合は選択日をanchorにする。通常の＋追加では登録contextの対象日をanchorにする。

---

## 5. period × recurrence

| period | なし | weekly | monthly | daily / その他 |
|---|---:|---:|---:|---:|
| this_week | ○ | ○ | × | × |
| this_month | ○ | × | ○ | × |
| custom_range | ○ | × | × | × |

### this_week + weekly

anchorを起点に各週1 occurrenceを生成する。

### this_month + monthly

anchorを起点に各月1 occurrenceを生成する。

### custom_range

初期版では繰り返し不可。

無効な組み合わせはUIで隠す。

---

## 6. RecurrenceRule

```text
frequency: daily | weekly | monthly
interval
weekdays?
dayOfMonth?
startsOn
endsOn?
```

UIのカスタム設定例:

```text
2週間ごとの月・水
→ weekly / interval=2 / weekdays=[mon, wed]
```

月31日等は短い月で月末へ丸める。

---

## 7. occurrence

将来分を大量にDB生成しない。

Event + RecurrenceRule + Overrideから要求範囲だけProjectionする。

stable occurrenceKey例:

```text
event:{eventId}:2026-09-15T10:00
event:{eventId}:week:2026-09-14
event:{eventId}:month:2026-09
```

同じ定義を再Projectionしても同じ回には同じkeyが必要。

---

## 8. 今回のみ編集

元定義を変えず `EventOccurrenceOverride(overrideType=modified)` を保存する。

日時・period範囲・deadline等も上書き可能。

例:

- 毎週火曜10:00の9/15だけ11:00
- 毎月「今月中に美容院」の10月だけ10/10〜10/20へ変更

次回以降は元定義へ戻る。

---

## 9. 今回のみ削除

`EventOccurrenceOverride(overrideType=cancelled)` を保存する。

そのoccurrenceだけCalendar / Daily / Notificationから除外する。

これは完了ではなく削除。

---

## 10. これ以降を編集

系列を分割する。

1. 元RecurrenceRuleを対象occurrence直前で終了
2. 対象occurrenceから新Event + RecurrenceRuleを作成
3. 新系列へ変更内容を適用

過去を壊さない。

---

## 11. これ以降を削除

元RecurrenceRuleを対象occurrence直前で終了し、新系列を作らない。

---

## 12. すべて編集 / 削除

すべて編集は元Event / Ruleを変更する。

すべて削除は系列を `active=false + deletedAt` のsoft deleteとする方針。

---

## 13. UI

繰り返し予定のみBottomSheetで対象範囲を選ぶ。

- この予定のみ
- この予定以降
- すべての予定

単発予定では出さない。

scopeの意味は次のとおり。`この予定のみ`は選択したoccurrenceだけ、`この予定以降`は選択したoccurrenceから先（過去occurrenceは変更しない）、`すべての予定`はseries全体である。series全体には過去occurrenceも含まれ、base Event / Ruleを変更した結果、過去を含む未overrideのprojectionも新しい定義に従う。series削除は`active=false + deletedAt`のsoft deleteであり、過去・将来を含むseriesをactive projectionから除外する。

form rowでは`interval`を生値で表示せず、`毎日`、`2日ごと`、`毎週火曜`、`毎週 月・水`、`2週間ごと 月・水`、`毎月25日`のようなsummaryを表示する。weeklyの未指定曜日は`startsOn`の曜日を初期選択し、明示的な曜日0件はvalidation errorとする。終了は`なし / 日付`として表示する。

---

## 14. 共通Projection

Calendar / Daily / Notification / Search日時解決は同じProjectionサービスを利用する。

別々のrecurrence実装を作らない。

HouseToDoから参考にするもの:

- timezone-safe date key
- weekday計算
- weekStartsOn
- month-day clamp
- occurrence keyの考え方

持ち込まないもの:

- weekly_flexible
- monthly_flexible
- TaskRecord
- complete / skip workflow

## 15. M5 scheduled実装

M5では`timingType=scheduled`だけを実装する。`Event + RecurrenceRule + EventOccurrenceOverride`からCalendar / Dailyの要求rangeだけを`EventProjectionService`で生成し、将来occurrenceをDBへ事前生成しない。

`occurrenceKey`は次の形式で、時刻ありは開始時刻、終日は`00:00`を使用する。

```text
event:{eventId}:{startDate}T{startTime}
```

Calendar / Dailyで同じkeyを使い、overrideの対象とUIの行identityを一致させる。日付演算はtimezoneに依存しないdate keyとして行い、API projectionにはUserSettingsのtimezone / weekStartsOnを渡す。

period Event、notification、Money recurrenceはM5の対象外とする。
