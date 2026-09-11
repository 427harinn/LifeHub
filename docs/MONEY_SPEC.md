# LifeHub お金仕様

## 1. 目的

LifeHubのお金機能は、厳密な家計簿ではなく、**今月だいたいいくら使いそうか / 残りそうかを簡単に把握するためのズボラ家計簿**とする。

細かい入力を強制しない。
予定額を先に置き、実際の金額が分かったものだけ後から置き換えられることを中心にする。

M9ではplannedAmountを基準に、occurrence overrideとsettlementを合成するMoneyProjectionを実装する。actualAmountはbase MoneyItemへ持たせず、MoneyOccurrenceSettlementへ保存する。

---

## 2. 基本概念

お金は以下の2種類。

- 支出
- 収入

1件のMoneyItemは、単発または繰り返しで発生する。

例:

- 家賃 70,000円 毎月
- 電気代 10,000円 毎月予定
- 給料 210,000円 毎月
- 美容院 8,000円 単発

---

## 3. 予定額と実績額

MoneyItemには基準となる `plannedAmount` を持つ。

実際の金額が分かった回だけ、occurrence単位で `actualAmount` を入力する。

例:

```text
電気代
予定 10,000円
```

9月の請求が5,200円なら:

```text
9月
実績 5,200円
```

基準予定額10,000円は変更しない。
10月は再び10,000円見込みとして表示する。

---

## 4. 今月の考え方

最終像では「確定済み実績 + 未確定予定」を混ぜて、着地見込みを表示する。M9ではactualを優先し、未入力回はoverride適用後plannedAmountで集計する。

### 支出見込み

```text
M8: plannedAmount
将来: actualがある回 → actualAmount、actualがない回 → plannedAmount
```

### 収入見込み

支出と収入は同じMoneyProjectionの決定ロジックを使い、actual導入後も画面ごとに判定を複製しない。

### 残りそう

```text
収入見込み - 支出見込み
```

これを最も目立つ数字の1つにする。

---

## 5. 月末のみなし実績

月が終了した時点でactual未入力のMoney occurrenceは、plannedAmountを `estimated_actual` として**DBへ確定保存**する。

後から実額が分かった場合は、estimated_actualをactualへ置き換えられる。

通常UIでは `estimated_actual` を強く意識させず、必要な詳細画面で `予定額のまま` などと表示する。

---

## 6. 登録フォーム

基本順序:

1. 支出 / 収入
2. タイトル
3. 金額
4. カテゴリ
5. 日付
6. 繰り返し
7. メモ
8. 登録

M8のMoneyFormは時間を扱わない。MoneyItemの`time`列を残す場合も、M8で作成するMoneyは常にnullとする。

最上部に「以前の項目から選ぶ >」を置く。

M11では「以前の項目から選ぶ」を検索可能なBottomSheetへ拡張する。未入力時は直近8件、2文字以上の入力時はserver側でtitle / category name / memoを検索し、金額自体は検索対象にしない。候補選択時は既存のMoney recent copy semantics（recurrence、settlement mode、date、actual / plannedのルール）を維持する。

---

## 7. 支出 / 収入

フォーム最初に2択で選ぶ。

- 支出
- 収入

初期値は支出。
金額入力自体は常に正数。

表示時:

- 支出 `-1,500円`
- 収入 `+210,000円`

---

## 8. カテゴリ

### 支出 初期カテゴリ

- 食費
- 日用品
- 固定費
- 交通
- 医療
- 娯楽
- その他

### 収入 初期カテゴリ

- 給料
- 臨時収入
- その他

カテゴリには色を持たせ、グラフ・一覧で共通利用する。
設定画面から追加・編集できるようにする。

---

## 9. 繰り返し

Eventと同じ共通RecurrenceRuleを利用する。

主な用途:

- 毎月の家賃
- 毎月の給料
- 毎月の電気代予定
- 毎週の定期支出

Eventと共通のRecurrenceRuleを再利用し、なし / daily / weekly / monthly / interval / weekdays / dayOfMonth / startsOn / endsOnをprojectionする。毎月31日は短月の月末へclampし、occurrenceKeyは`money:<moneyItemId>:<YYYY-MM-DD>`の安定した値を使う。M9ではoccurrence / following / seriesをEventと同じscope grammarで扱う。

---

## 10. 繰り返しMoneyの編集

Eventと同じ考え方を利用する。

- M9: 今回のみ / これ以降 / すべて

今回のみのtitle / type / category / plannedAmount / date / memo変更はMoneyOccurrenceOverrideへ保存する。削除はcancelled overrideとして保存する。

これ以降の予定額変更は元seriesを対象直前で終了し、対象occurrence日開始の新MoneyItem + RecurrenceRuleへ分割する。過去のactual / estimated_actualは旧seriesに保持する。

---

## 11. 実績額の入力UI

登録時にplannedとactualを同時に入力させない。

Money詳細または月一覧から `実際の金額を入力` を行う。

例:

```text
電気代
5,200円
予定 10,000円
```

actualを消した場合:

- 今月中ならplannedAmountへ戻す
- 過去月なら必要に応じてestimated_actualへ戻す

MoneyProjectionの表示状態は通常UIでは`実績`、`予定`、`予定額のまま`とする。金額決定はCalendar / Daily / Moneyで共通化する。

---

## 12. お金画面: 今月

最上部に以下を表示する。

```text
支出見込み   128,500円
収入見込み   210,000円
残りそう      81,500円
```

その直下に、補助情報として簡潔に:

```text
確定済み  74,300円
予定      54,200円
```

程度を表示する。

主役はあくまで `支出見込み / 収入見込み / 残りそう` であり、actual / estimated_actualといった内部用語は通常画面に出さない。

その下に:

1. 支出カテゴリ構成
2. カテゴリ別金額
3. 今月のお金一覧

を配置する。

---

## 13. グラフ

### 今月

支出のカテゴリ構成はドーナツグラフを第一候補とする。

カテゴリ色は `MoneyCategory.colorKey` をdonut segment、legend、Settingsカテゴリ一覧で共通利用する。既存の未設定カテゴリは固定カテゴリ名または安定したID/名前fallbackで補完し、支出集計や月移動に影響させない。

### 月ごと

月別の支出 / 収入 / 残額推移は棒グラフを基本候補とする。

過度に多種類のグラフを入れない。

### M10 お金の分析画面

通常のMoney画面は「今月のお金を見る / 登録・修正する」役割を維持し、長期の可視化はMoney配下の独立sub screen `/money/analysis`で扱う。分析画面は現在年を初期表示し、年selector、画面全体へ効く`見込み | 実績`切替、年間summary、1月〜12月の支出line chart、選択月detail、年間カテゴリ別支出donutを縦1列で表示する。

年集計は`GET /api/money/year-summary?year=YYYY`を1回だけ呼び、`MoneyProjection`を1年rangeへ展開して12か月へ集計する。見込みはeffectiveAmount（planned / actual / estimated_actualを含む）、実績はactual / estimated_actualのみとする。実績の未来月は0円として扱わず、未確定値として線を描かない。カテゴリは`MoneyCategory.colorKey`と既存fallbackを通常Money donutと共有する。

M10ではAI分析、budget、saving goal、複雑な前年比・financial KPI、複数グラフを並べたdashboardは扱わない。通常Money画面の既存month UI・一覧・当月donutは変更しない。

---

## 14. 今月一覧

日付順でMoney occurrenceを表示する。

例:

```text
9/01  家賃       -70,000
9/10  給料      +210,000
9/15  電気代      -5,200
9/20  美容院      -8,000
```

個別行では大きく金額を出し、状態は小さく `実績` / `予定` 程度で示す。

例:

```text
電気代                    5,200円
固定費                       実績
```

```text
美容院                    8,000円
娯楽                         予定
```

---

## 15. Calendarとの連携

Calendarでは金額情報を日セル内の予定より上に置く。

### すべてタブ

その日の収入・支出を合算した**収支差額1つ**だけを表示する。

例:

```text
+210,000
```

または

```text
-6,500
```

その下から予定を表示する。

### お金タブ

個別Money occurrenceをコンパクトに表示する。

```text
-1,500
-5,000
+2,999
```

予定 / actual / estimated_actualの優先順位はMoney画面と共通ロジックを使う。

---

## 16. Dailyとの連携

Dailyでは予定タイムラインの下に今日のお金を表示する。

お金タブではその日の明細を表示する。

```text
食費      -1,500円
電気代    -5,200円
副収入    +2,999円
```

`すべて` タブではタイムラインへMoneyを混ぜず、簡単な合計カードとして扱う。

---

## 17. 削除

単発Moneyは通常どおり削除できる。

繰り返しMoneyは:

- 今回のみ削除
- これ以降削除
- すべて削除

を選択する。

---

## 18. バックアップ・アーカイブ

Money履歴も `BACKUP_AND_RETENTION.md` の対象。

- 1年より古いMoney occurrence / actual / estimated_actualはIndexedDBへ移動可能
- 現在も続くMoneyItem / RecurrenceRuleはD1に残す
- JSONエクスポートにはクラウド・ローカル双方のお金履歴を含める

長期グラフを表示するときはD1とIndexedDBのデータを統合して集計する。

---

## 19. 初期版でやらないこと

- 銀行口座連携
- クレジットカード連携
- レシートOCR
- 複式簿記
- 資産管理
- 予算を細かく強制する機能
- 共有家計簿

LifeHubでは「ざっくり把握できる」ことを優先する。
