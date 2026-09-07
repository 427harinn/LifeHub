# LifeHub Event登録フォーム仕様

## 1. 目的

LifeHubの家・仕事予定登録フォームは、ユーザーが予定を考える自然な順番に沿って入力できるようにする。

HouseToDoのフォーム思想を継承し、**入力に必要のない項目は最初から提示しない**。

---

## 2. 最重要設計原則

予定を登録するときの思考順をフォーム順にする。

1. 何の予定か
2. 日時が決まっているか、期間中にやりたいか
3. いつか
4. 繰り返すか
5. 通知が必要か
6. 場所やメモを付けるか

不要な入力欄は表示しない。

- scheduledを選ぶまで日時詳細を出さない
- periodでは時間・終日を出さない
- 終日ONなら時間を隠す
- 繰り返しなしなら詳細を隠す
- custom_range periodでは繰り返しUIを出さない
- 通知なしなら通知詳細を出さない
- 場所・メモは未入力時はコンパクトな行にする

基本は1画面で完結し、詳細設定はBottomSheetを使う。

---

## 3. 基本フォーム順

1. 以前の項目から選ぶ
2. タイトル
3. 予定の種類
4. 日時 / 実施時期
5. 繰り返し
6. 通知
7. 場所
8. メモ
9. 登録

家・仕事は同一フォームを使い、カテゴリは入口で固定する。

---

## 4. 初期状態

```text
以前の項目から選ぶ >

タイトル

予定の種類
日時が決まっている >
```

通常のCalendar利用が多いことを想定し `日時が決まっている` を初期値にしてよい。

Calendar / Dailyから特定日を指定して追加した場合は、その日を初期日として引き継ぐ。

M3では`日時が決まっている`を固定表示し、`期間中にやりたい`へ遷移する選択肢は表示しない。繰り返しと通知は`なし`固定とし、未完成の設定画面は開かない。

---

# 5. 予定の種類

BottomSheetで以下から選ぶ。

- 日時が決まっている
- 期間中にやりたい

---

# 6. 日時が決まっている場合

基本:

```text
日付
9月20日 >

終日
OFF

時間
15:00 〜 16:00

繰り返し
なし >
```

## 6.1 日付

最初は単日予定として見せる。

必要なときだけ日付BottomSheet内で終了日を設定する。

```text
開始日 9月18日
終了日 9月20日
```

単日は `startDate = endDate`。

## 6.2 終日

ONなら時間入力を完全に隠す。

OFFなら開始・終了時間を表示する。

終了時刻の初期値は実装時に既存UIとの整合を見て決める。

---

# 7. 期間中にやりたい場合

時間・終日は表示しない。

```text
実施時期
今週中 >

繰り返し
なし >
```

選択肢:

- 今週中
- 今月中
- 日付範囲を指定

## 7.1 今週中

選択時に対象週を確定するため、内部的に `periodAnchorDate` を持つ。

Calendar / Dailyから日付contextがある場合はその日をanchorにする。通常の＋追加なら登録時点の選択日 / 今日をanchorにする。

許可する繰り返し:

- なし
- 毎週

## 7.2 今月中

同様に `periodAnchorDate` から対象月を決める。

許可:

- なし
- 毎月

## 7.3 日付範囲を指定

```text
開始日 9月8日
終了日 9月12日
```

初期版では繰り返し不可。繰り返しrow自体を非表示にする。

---

# 8. 繰り返し

日時・実施時期を決めた後に表示する。

通常は:

```text
繰り返し
なし >
```

## 8.1 scheduled Event

UI候補:

- なし
- 毎日
- 毎週
- 毎月
- カスタム

**カスタムはDB上のfrequencyではない。**

「2週間ごと」「曜日を複数選ぶ」等の詳細設定を開くUI入口であり、保存時は以下へ正規化する。

- daily / weekly / monthly
- interval
- weekdays
- dayOfMonth
- startsOn / endsOn

例:

```text
2週間ごとの月・水
→ frequency=weekly, interval=2, weekdays=[mon, wed]
```

## 8.2 period Event

| 実施時期 | 許可する繰り返し |
|---|---|
| 今週中 | なし / 毎週 |
| 今月中 | なし / 毎月 |
| 日付範囲指定 | なしのみ。row非表示 |

無効な選択肢を表示してエラーにしない。

---

# 9. 通知

繰り返しの後に表示する。

通常:

```text
通知
なし >
```

テンプレート適用時:

```text
通知
1日前・30分前 >
```

BottomSheet:

- 通知なし
- 通知テンプレート
- カスタム

カスタムでは複数offsetを追加できる。

## 9.1 scheduled / 時間あり

occurrence開始日時を基準に通知する。

## 9.2 scheduled / 終日

対象日09:00を基準に通知する。

## 9.3 period

deadlineDate + deadlineTimeを基準にする。

- 今週中: その週の最終日
- 今月中: 月末
- 日付範囲: endDate
- 既定deadlineTime: 21:00

必要な場合のみ通知詳細内などからdeadlineTimeを変更できる。

朝・夜まとめ通知とは別責務。

詳細は `NOTIFICATION_SPEC.md` を正とする。

---

# 10. 場所 / メモ

主要入力ではないため後半に置く。

未入力:

```text
場所
追加 >

メモ
追加 >
```

入力時のみBottomSheetまたは展開UIを開く。

---

# 11. 以前の項目から選ぶ

フォーム最上部に置く。

Eventから再利用候補:

- title
- category
- timingType
- allDay
- 時間帯
- recurrence
- notifications
- place
- memo

日付contextは現在のCalendar / Daily / 新規登録contextを優先し、過去Eventの日付をそのままコピーしない。

period Eventを再利用する場合も、新しいcontextから新しい `periodAnchorDate` を設定する。

---

# 12. 編集画面

新規登録と同じフォーム構造を利用する。

単発予定では通常編集・削除。

繰り返し予定では操作前に対象範囲を選ぶ。

- この予定のみ
- この予定以降
- すべての予定

処理は `RECURRENCE_AND_OCCURRENCE.md` を正とする。

---

# 13. 戻り動作

HouseToDoの `returnTo` を継承する。

- Calendarの選択日から追加 → 登録/戻る後も同じ日
- Dailyから追加 → 同じDaily日付へ戻る
- 登録成功後も元contextを維持

---

# 14. Validation

主なルール:

- title必須
- scheduledでは有効なstart/end必須
- end < startは禁止
- period this_week/this_monthではperiodAnchorDate必須
- custom_rangeではperiodStartDate / periodEndDate必須
- custom_range + recurrenceは禁止
- this_week + monthlyは禁止
- this_month + weeklyは禁止
- period + dailyは禁止
- notification offsetは0以上

UIで防げる無効組み合わせは最初から提示しない。

---

# 15. 実装 / Evidence原則

- HouseToDoのフォーム構造を参考にするがTaskFormをコピーしない
- form state / validation / payload変換をUIから分離する
- 390×844でフォーム全状態を確認する
- scheduled / all-day / multi-day / period / recurrence / notificationをScreenshot Evidenceに含める
- BottomSheet操作や戻り動作など静止画だけで判断しづらい場合は動画も残す
- 仕様変更時はこの文書も同じ作業で更新する
