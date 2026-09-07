# LifeHub デザインシステム

## 1. 方針

LifeHub は HouseToDo と同じUIデザイン言語を継承する。

ただし、HouseToDoとの差別化のため、**色だけをLifeHub用へ変更**する。

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
- primary strong
- primary soft
- LifeHub固有の予定カテゴリ色
- period Event用の帯色

HouseToDoのUIをコピーするのではなく、**同じデザインシステムの兄弟アプリとして色だけLifeHubへ置き換える**ことを基本とする。

---

## 2. HouseToDoから継承する基礎トークン

HouseToDoの現行CSSを基準とする。

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

LifeHubではこれらを原則そのまま利用する。

---

## 3. LifeHub カラーテーマ

テーマは **ベージュ + やわらかいオレンジ**。

HouseToDoのナチュラルさは残しつつ、緑ではなく暖色系へ変更する。

### 3.1 基本色

```css
--color-bg: #fcfbf7;
--color-surface: #ffffff;

--color-primary: #f2a766;
--color-primary-strong: #d77a35;
--color-primary-soft: #fff0e3;

--color-text: #303531;
--color-text-secondary: #717772;
--color-border: #e5e7e2;
--color-disabled: #c8ccc7;
```

### 3.2 色の役割

`primary`
- 選択状態
- 小さなアクセント
- アイコン
- active navigation
- 軽い強調

`primary-strong`
- 主要ボタン
- FAB / ＋追加
- 強いリンク
- selected stateの文字

`primary-soft`
- 選択背景
- chip背景
- 軽い強調背景
- swipe action等の背景

背景・surface・文字・borderはHouseToDoと同じ値を利用し、色テーマだけで差別化する。

---

## 4. 予定カテゴリ色

LifeHubでは予定の意味を色だけに依存させない。
ラベル・アイコン・位置関係と組み合わせる。

初期案:

```css
--color-event-home: #e99a58;
--color-event-home-soft: #fff0e3;

--color-event-work: #7897b2;
--color-event-work-soft: #edf3f7;

--color-money: #c79a45;
--color-money-soft: #f8f0df;
```

- 家: LifeHubのメインテーマに近いオレンジ
- 仕事: 暖色と競合しない、くすんだブルー
- お金: ベージュ系デザインに馴染む落ち着いたゴールド

鮮やかすぎる色は避ける。

---

## 5. period Eventの色

`今週中`、`今月中`、任意の日付範囲などの「期間中にやりたい」Eventは、通常予定と視覚的に区別する。

通常の日時予定:
- 比較的はっきりしたカテゴリ色

period Event:
- 同じカテゴリ系統の淡い色
- カレンダー上では複数日にまたがる帯として表示
- 必要に応じて枠線や薄いパターンを追加し、通常の複数日予定との違いを出す

例:

```css
--color-period-home: #f8d7b8;
--color-period-work: #dce7ee;
```

色だけで「完了/未完了」の意味は持たせない。
LifeHubには完了状態そのものが存在しない。

---

## 6. 状態色

danger / warningなどの意味色はHouseToDoを基本的に継承する。

```css
--color-danger: #d65f5f;
--color-warning: #d79238;
--color-success: #4fa77b;
```

ただし `success` を予定完了の意味には使用しない。
フォーム保存成功、接続成功等の一般的な成功状態だけに使用する。

---

## 7. 角丸

HouseToDoと同一。

```css
--radius-input: 8px;
--radius-action: 10px;
--radius-sheet: 16px;
--radius-sm: 8px;
--radius-md: 14px;
--radius-lg: 20px;
```

LifeHub独自の角丸体系を増やさない。

---

## 8. 余白

HouseToDoと同一。

4px基準のspacing systemを使用する。

```css
4 / 8 / 12 / 16 / 20 / 24 / 32px
```

画面ごとに独自の余白値を乱立させない。

---

## 9. Typography

HouseToDoと同一。

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

既存HouseToDoの見出し・本文・補助テキストのサイズとweightを原則そのまま利用する。

LifeHub専用フォントは導入しない。

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

LifeHubへ持ち込む際はHouseToDo固有のgreen値をハードコードせず、LifeHub側のcolor tokenへ置き換える。

---

## 11. 実装原則

CodexはLifeHubのUI実装時に以下を守る。

1. HouseToDoの角丸・余白・Typographyを基準にする
2. HouseToDoの緑色をそのままコピーしない
3. 色は必ずLifeHub tokenを参照する
4. `#f2a766` 等のテーマ色を各画面へ直接ハードコードしない
5. Eventカテゴリ色もtoken化する
6. HouseToDoと見た目が似ること自体は問題ではない
7. ただしアプリを並べたとき、primary colorによってLifeHubだと判別できる状態にする
8. 新しいコンポーネントを作る前にHouseToDoに流用可能なUIがないか確認する

---

## 12. デザインイメージ

HouseToDo:

> ベージュ + グリーン / 家事 / 植物 / ナチュラル

LifeHub:

> ベージュ + オレンジ / 手帳 / 暮らし / 時間 / あたたかさ

2アプリは別テーマだが、同じ作者・同じプロダクトファミリーだと感じられることを目標にする。
