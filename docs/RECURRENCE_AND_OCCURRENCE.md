# LifeHub 繰り返し・発生回・期間予定設計

## 1. この文書の目的

LifeHub の予定における以下を明確化する。

- 固定日時予定の繰り返し
- 「期間中にやりたい」の繰り返し
- 今回だけ編集 / 削除
- これ以降を編集 / 削除
- 全件編集 / 削除

LifeHub は完全個人用アプリとし、家庭共有・メンバー共有を前提にしない。

---

## 2. 大原則

予定には以下の2軸を分けて持つ。

### A. Timing（どういう時間の持ち方か）

- `scheduled`: 日時が決まっている予定
- `period`: 期間中にやりたい予定

### B. Recurrence（その予定が繰り返すか）

- なし
- 毎日
- 毎週
- 毎月
- カスタム

Timing と Recurrence を1つの型へまとめない。

---

## 3. scheduled の繰り返し

固定日時予定は通常のカレンダー予定と同じように繰り返せる。

例:

- 毎週火曜 10:00 定例会議
- 毎月25日 給料日
- 毎日 08:00 薬を飲む

したがって `scheduled` だから繰り返し不可、とはしない。

---

## 4. period（期間中にやりたい）

period は「この期間のどこかで行えばよい」予定。

### 4.1 実施時期の種類

初期仕様では以下を扱う。

- `this_week`: 今週中
- `this_month`: 今月中
- `custom_range`: 日付範囲を指定

例:

- 今週中にクリーニングを取りに行く
- 今月中に美容院へ行く
- 9/8〜9/12のどこかで役所へ行く

---

## 5. period と recurrence の組み合わせ

初期仕様では組み合わせを明示的に制限する。

| period実施時期 | 繰り返しなし | 毎週 | 毎月 | その他 |
|---|---:|---:|---:|---:|
| 今週中 | ○ | ○ | × | × |
| 今月中 | ○ | × | ○ | × |
| 日付範囲指定 | ○ | × | × | × |

### 5.1 今週中 + 毎週

毎週1つ、「その週のどこかでやる予定」が発生する。

例:

```text
タイトル: ゴミ置き場の掃除
Timing: period
実施時期: 今週中
繰り返し: 毎週
```

結果:

- 9/7〜9/13 のどこかで1回
- 9/14〜9/20 のどこかで1回
- 9/21〜9/27 のどこかで1回

各週が独立した occurrence になる。

### 5.2 今月中 + 毎月

毎月1つ、「その月のどこかでやる予定」が発生する。

例:

```text
タイトル: 美容院
Timing: period
実施時期: 今月中
繰り返し: 毎月
```

結果:

- 9月中に1回
- 10月中に1回
- 11月中に1回

各月が独立した occurrence になる。

### 5.3 日付範囲指定

任意の開始日〜終了日を指定した period は、初期仕様では繰り返し不可とする。

理由:

- 9/8〜9/12 を毎週繰り返す、の意味がユーザーにとって曖昧
- intervalとrange lengthの関係が複雑になる
- 初期UIを不必要に難しくしない

将来、必要性が出た場合のみ拡張する。

---

## 6. occurrence（繰り返しの1回分）

繰り返し予定は将来分をDBへ大量生成しない。

Event + RecurrenceRule から対象期間の occurrence を計算する。

各 occurrence は安定した識別子を持つ。

例:

### fixed schedule

```text
event:{eventId}:2026-09-15T10:00
```

### weekly period

```text
event:{eventId}:week:2026-09-14
```

### monthly period

```text
event:{eventId}:month:2026-09
```

正確なkey形式は実装時に決めてよいが、一度決めたら安定すること。

---

## 7. 今回だけ編集

繰り返し予定の1 occurrence だけを変更できるようにする。

例:

毎週火曜10:00の予定のうち、9/15だけ11:00へ変更。

元Event / RecurrenceRuleは変更しない。

`EventOccurrenceOverride` を保存する。

```text
EventOccurrenceOverride
- id
- eventId
- occurrenceKey
- originalStartDate
- overrideType: modified | cancelled

- title nullable
- category nullable
- timing fields nullable
- place nullable
- memo nullable
- notification override nullable

- createdAt
- updatedAt
```

overrideに値があるフィールドのみ元Eventを上書きする方式を基本とする。

---

## 8. 今回だけ削除

1 occurrenceだけ消す場合、Event自体は削除しない。

`EventOccurrenceOverride` に

```text
overrideType = cancelled
```

を保存する。

Calendar / Dailyではその occurrence を表示しない。

後続 occurrence はそのまま残る。

---

## 9. これ以降を編集

Google Calendar等と同じく、繰り返し系列をその occurrence の位置で分割する。

例:

毎週火曜10:00を、9/15以降だけ11:00へ変更。

処理:

1. 元EventのRecurrenceRuleを9/15より前で終了させる
2. 9/15を開始点とする新しいEvent + RecurrenceRuleを作る
3. 新しい系列へ変更内容を適用する

これにより過去 occurrence の意味を壊さない。

単一Event内へ「途中から設定変更」の複雑なルールを埋め込まない。

---

## 10. これ以降を削除

対象 occurrence の直前で元RecurrenceRuleを終了させる。

例:

9/15以降を削除

→ 元系列の最終 occurrence は9/15より前になる。

対象日以降に別系列を作らない。

---

## 11. すべて編集

元Event / RecurrenceRuleを更新する。

ただし過去表示については、将来「履歴の不変性」が必要になった場合に別途snapshot方針を検討する。

初期仕様ではCalendarアプリとして必要な編集操作を優先する。

---

## 12. すべて削除

Eventをinactive / deletedとして扱い、系列全体を今後表示しない。

物理削除するかsoft deleteにするかはDB設計時に決めるが、初期方針はsoft delete推奨。

---

## 13. 編集時のUI

繰り返し予定を編集・削除した場合のみBottomSheet等で対象範囲を選ぶ。

### 編集

- この予定のみ
- この予定以降
- すべての予定

### 削除

- この予定のみ
- この予定以降
- すべての予定

単発予定ではこの選択を出さない。

---

## 14. period occurrenceの編集

「今週中 + 毎週」や「今月中 + 毎月」も同じ考え方を使う。

例:

毎月「今月中に美容院」の10月分だけ、10/10〜10/20の期間へ変更する。

→ 10月 occurrence に `EventOccurrenceOverride` を作る。

11月以降は元の「今月中」へ戻る。

「この予定以降」を選んだ場合は系列を分割する。

---

## 15. 初期仕様で禁止する組み合わせ

以下はUI上で作れないようにする。

- custom_range period + recurrence
- 今週中 + monthly recurrence
- 今月中 + weekly recurrence
- period + daily recurrence

ユーザーへエラーを出すより、選択肢自体を適切に絞る。

HouseToDo同様、Progressive Disclosureを優先する。

---

## 16. HouseToDoから参考にする範囲

参考:

- recurrenceの日付計算
- weekStartsOn
- timezone-safe date key
- period projectionの考え方
- occurrence / period keyの考え方

そのまま持ち込まない:

- `weekly_flexible`
- `monthly_flexible`
- TaskRecord
- complete / skip workflow

LifeHubでは `Timing + RecurrenceRule + EventOccurrenceOverride` として分離する。
