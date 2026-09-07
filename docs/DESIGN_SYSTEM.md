# LifeHub デザインシステム

## 1. 方針

LifeHubはHouseToDoと同じUIデザイン言語を継承する。

変更しないもの:

- 角丸
- 余白
- フォント
- 文字サイズの基本階層
- ボタン高さ
- フォーム行の密度
- BottomSheetの形状
- Bottom Navigationの構造
- safe-area対応
- 基本的な影
- スマートフォンファーストのレイアウト

変更するもの:

- primary color
- Calendar予定種別色
- LifeHub固有のMoney色

HouseToDoの兄弟アプリとして、形は近く、色で明確にLifeHubと分かることを目標にする。

---

## 2. HouseToDoから継承する基礎トークン

```css
--color-bg: #fcfbf7;
--color-surface: #ffffff;
--color-text: #303531;
--color-text-secondary: #717772;
--color-border: #e5e7e2;
--color-disabled: #c8ccc7;

--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

--radius-input: 8px;
--radius-action: 10px;
--radius-sheet: 16px;
--radius-sm: 8px;
--radius-md: 14px;
--radius-lg: 20px;

font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

これらは原則そのまま利用する。

---

## 3. LifeHub カラーテーマ

テーマは **ベージュ + やわらかいオレンジ**。

```css
--color-primary: #f2a766;
--color-primary-strong: #d77a35;
--color-primary-soft: #fff0e3;
```

用途:

- active navigation
- FAB / ＋追加
- 選択状態
- 主要ボタン
- リンク / 小さなアクセント

テーマ色を画面へ直接ハードコードせずtoken参照する。

---

## 4. Calendar予定色

Calendarでは **家 / 仕事ではなく、予定の性質を主軸に色分けする**。

3種類:

1. 単発の通常予定
2. 繰り返し予定
3. period予定（今週中 / 今月中 / custom range）

初期token案:

```css
--color-event-single: #e99a58;
--color-event-single-soft: #fff0e3;

--color-event-recurring: #c98555;
--color-event-recurring-soft: #f8e7da;

--color-event-period: #d8a04f;
--color-event-period-soft: #f8edd8;
```

実装時は390×844のCalendarへ多数の予定を表示して、帯同士の判別性・文字の可読性をEvidenceで確認する。必要なら同系統のオレンジ/テラコッタ/ゴールド内で調整してよい。

原色や強すぎる彩度は避ける。

---

## 5. 家 / 仕事の表現

家 / 仕事は予定種別の色分けと競合させない。

色を全面的に塗り分けるのではなく、必要に応じて以下の補助表現を使う。

- 小さな `家` / `仕事` ラベル
- アイコン
- 文字横の小マーカー
- 詳細画面でのカテゴリ表示

Calendar上では「単発 / 繰り返し / period」が一目で分かることを優先する。

色だけに意味を依存しない。

---

## 6. 複数日 / period帯

通常の複数日予定は、その予定が単発か繰り返しかに応じた色を使う。

period Eventは `--color-event-period` 系を使い、TimeTreeのように複数日にまたがる連続帯として描画する。

帯の開始・継続・終了は形でも分かるようにし、色だけに依存しない。

---

## 7. Money色

MoneyはCalendar予定種別色とは別に、落ち着いたゴールド系を利用する。

```css
--color-money: #b88b3e;
--color-money-soft: #f8f0df;
```

支出 / 収入の判別は `- / +` を必ず表示し、色だけで意味を伝えない。

---

## 8. 状態色

```css
--color-danger: #d65f5f;
--color-warning: #d79238;
--color-success: #4fa77b;
```

`success` は保存成功・接続成功等にのみ使用し、予定完了の意味には使わない。

LifeHubには完了状態が存在しない。

---

## 9. 角丸 / 余白 / Typography

HouseToDoと同一。

- spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32px
- radius: 8 / 10 / 14 / 16 / 20px系
- font: system UI

独自体系を増やさない。

---

## 10. コンポーネント方針

HouseToDoから以下を直接流用・抽出候補とする。

- Button
- Input
- Form row
- BottomSheet
- Bottom Navigation
- Toggle
- Selection row
- List row
- Dialog / confirm UI
- Loading / empty / error state

構造・サイズ・motionは極力変更しない。

---

## 11. 実装原則

1. HouseToDoの角丸・余白・Typographyを基準にする
2. HouseToDoのgreen値をコピーしない
3. LifeHub色はtoken化する
4. Calendarは単発 / 繰り返し / periodを主色分けする
5. 家 / 仕事は補助表現とする
6. 色だけで状態・意味を伝えない
7. UI変更時は390×844 screenshot evidenceを必須とする
8. motion / swipe / sheet遷移等、静止画で判断しにくい場合は動画Evidenceも残す
9. 新規コンポーネント作成前にHouseToDoの流用可能UIを確認する

---

## 12. デザインイメージ

HouseToDo:

> ベージュ + グリーン / 家事 / ナチュラル

LifeHub:

> ベージュ + オレンジ / 手帳 / 暮らし / 時間 / あたたかさ
