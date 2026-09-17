# LifeHub DESIGN.md

> Source baseline: `427harinn/HouseToDo-Mockup/DESIGN.md` on `main`.
>
> LifeHub は HouseToDo のデザイン思想を「参考」にするだけではなく、**HouseToDo DESIGN.md を基本設計としてそのまま継承する**。LifeHub 固有のプロダクト差分だけをこの文書で置き換える。
>
> この文書と `docs/DESIGN_SYSTEM.md` が競合する場合は、この `DESIGN.md` を優先する。

---

## 0. Purpose

### M14 Phase E+F final polish

- Bottom NavigationはCalendar / Daily / Add / Money / Settingsの5つを、repo内のicon-rainbow SVGをCSS maskで表示する。ラベルは追加せず、selectedのみLifeHub orange、unselectedはneutralとする。
- icon-rainbow素材はナビゲーション用途に限定し、アプリのhome iconはLifeHub専用visualとして別管理する。
- Bottom Navigationは既存どおりicons-only、中央の`+`、背景なしを維持する。FAB化やorange circleは行わない。
- Quick Add / popoverの装飾的shadowはborderとsurface contrastへ置き換え、役割のあるoverlay shadowだけを残す。

LifeHub は、予定・お金・日々の記録をひとつの時間軸で扱う完全個人用の生活管理アプリ。

UI は「管理ダッシュボード」ではなく、**日々の暮らしを自然に見渡せる場所**に見えること。

Core priority:

1. **Clean / uncluttered**
2. **Fits naturally into daily life**
3. **Feels reassuring**

情報量は十分に出す。ただし、装飾によって忙しく見せない。

---

# 1. Director

## 1.1 Product feeling

HouseToDo と同じ方向性を継承する。

- clean and uncluttered
- natural in daily life
- reassuring because states are clear
- warm, but not childish
- quiet, but pleasant to interact with

Reference direction も HouseToDo と同じ。

- FamilyBank: life-oriented information organization
- みてね: warmth, friendliness, comfortable whitespace
- TimeTree: calendar and mobile information hierarchy
- iOS system apps: clarity, restraint, familiar interaction

どのサービスもそのままコピーしない。情報階層と操作パターンだけを抽出して LifeHub に合わせる。

## 1.2 Product personality

日常的な日本語を使い、短いラベルを優先する。

例:

- 予定を追加
- 家
- 仕事
- お金
- 通知
- 繰り返し
- 保存
- 今日

長いシステム用語を避ける。

**見出しの上に装飾目的の英語ラベルを置かない。**

例として、以下のような表現は禁止する。

```text
APPLICATION FOUNDATION
LifeHub
```

```text
REUSABLE UI
共通コンポーネント
```

英語は意味上必要な場合だけ使用する。英語を「それっぽく見せる装飾」として使わない。

見出しの下へ、小さなグレーの説明文を常設しない。説明が必要な場合だけ、UIとして意味のある位置に短く置く。

## 1.3 Signature

LifeHub の個性は装飾ではなく、**Calendar を中心とした情報構造と操作**から出す。

Main signature:

> 予定・期間予定・お金を、月カレンダーから自然に俯瞰できる。

Secondary signature:

- 大きく情報量のある月Calendar
- TimeTree型の複数日帯
- Daily timeline
- ズボラ家計簿との統合
- 家 / 仕事を分けつつ、すべてで一緒に見られる

---

# 2. Anti-patterns / Prohibited design

HouseToDo DESIGN.md の禁止事項を**そのまま適用する**。

Do not use:

- strong gradients
- purple/blue AI-SaaS style gradients
- oversized rounded cards
- card-everything layouts
- colored strip on only one edge of a card
- decorative shadows
- unnecessary decorative icons
- oversized headings
- KPI/dashboard-style summary blocks
- excessive animation
- childlike color usage
- excessive whitespace
- cramped information density
- English used only to look stylish
- persistent small gray explanatory text under headings
- `<h1>` followed by a smaller explanatory subtitle by default
- fake “premium” spacing
- nested cards inside cards
- visual decoration that has no information or interaction purpose

Default rule:

> If hierarchy can be expressed with spacing, border, typography, or ordering, do not create a card.

### LifeHub M1 reviewで特に禁止するもの

今回のFoundation画面で見られた以下は、今後の基準UIにしない。

- 大きい角丸カードを画面全体に連続配置する
- カードごとにshadowを付ける
- 英語ラベル + 日本語見出しの二段タイトルを装飾として使う
- 常時表示の小さい説明テキストを多用する
- デザイン確認用画面を「ブランドUI」として作り込む
- 中央の `+` をオレンジ背景の四角/丸いFABにする
- Bottom Navigationのアイコンを小さく見せる

---

# 3. Device assumptions

HouseToDo と同じ。

Priority:

1. smartphone one-handed use
2. short interactions lasting only a few seconds
3. smartphone configuration flows

基準viewportは `390×844`。

Desktop は primary target ではない。壊れないことを優先し、desktop向けに別デザインへ広げない。

---

# 4. Core color system

色以外のデザインルールは HouseToDo と同じ。
LifeHub 固有差分は primary をオレンジへ置き換えること。

| Token | Color | Use |
|---|---|---|
| `--bg` | `#FCFBF7` | Main app background |
| `--surface` | `#FFFFFF` | Sheets, input surfaces, necessary raised surfaces |
| `--primary` | `#F2A766` | Main accent |
| `--primary-strong` | `#D77A35` | Strong accent / pressed / high-contrast primary |
| `--primary-soft` | `#FFF0E3` | Subtle selected background |
| `--text` | `#303531` | Main text |
| `--text-secondary` | `#717772` | Secondary information |
| `--border` | `#E5E7E2` | Divider / input border |
| `--disabled` | `#C8CCC7` | Disabled state |

General ratio:

- mostly cream-white / white
- neutral text / border
- orange is a small accent, not a large surface

**オレンジを画面の大きな塗り面として使わない。**

---

# 5. Calendar colors

LifeHub 固有差分。

Calendarでは色を家 / 仕事のカテゴリ、支出 / 収入の金額、period予定の補助表現に使う。

家はオレンジ、仕事は青とする。単日予定は文字色、複数日予定は帯そのものの色で区別する。
支出は赤、収入は青系とする。period予定は背景帯にせず、期限を示す補助表現で区別する。

色は既存の情報構造を補助するために使い、家 / 仕事の補助文字を常設しない。

繰り返しoccurrenceも通常Eventと同じ見た目で表示する。recurrenceだけを理由に背景・大きなアイコン・装飾を追加しない。

具体tokenは `DESIGN_SYSTEM.md` を参照するが、鮮やかな原色や強い塗り面は避ける。

---

# 6. Typography

HouseToDo と同じ。

Use system fonts.

Suggested sizes:

| Role | Size |
|---|---|
| Screen title | 20px |
| Section heading | 15–16px |
| Event / item name | 16–17px |
| Form label | 14–15px |
| Secondary info | 13–14px |
| Bottom navigation | no visible text label |
| Button text | 15–16px |

Suggested weights:

- normal text: 400
- event / item name: ~500
- screen title: ~600

Avoid bold-heavy layouts.

大きな黒文字 + 小さな英語captionで hierarchy を作らない。

---

# 7. Spacing

HouseToDo と同じ。

Base scale:

`4 / 8 / 12 / 16 / 20 / 24 / 32`

| Use | Value |
|---|---|
| Screen horizontal padding | 16px |
| Section gap | 20–24px |
| List row vertical padding | 12–14px |
| Form field gap | ~16px |
| Small internal gap | 8px |
| Minimum touch target | 44px |

Goal:

> readable, tappable, but not sparse.

---

# 8. Radius

HouseToDo と同じ。

Avoid large “AI card” radii.

| Element | Radius |
|---|---|
| Input / normal button | 8–10px |
| Large action button | 10–12px |
| Small surface | 10–12px |
| Large bottom sheet | ~16px top corners |
| Normal list row | no card radius by default |
| Semantic circle only | fully round |

画面を大きな 14–20px radius のカードで埋めない。

---

# 9. Borders, shadows, surfaces

HouseToDo と同じ。

Use:

- thin dividers
- spacing
- white surfaces only where contrast is actually necessary

Do not use shadows by default.

通常の一覧はカード化せず、dividerとspacingで階層を作る。

BottomSheetはwhite surface + top corner radius。

---

# 10. Buttons

HouseToDo と同じ。

Primary action:

- near-full-width where appropriate
- no gradient
- no heavy shadow
- restrained radius
- `--primary`

Secondary:

- white
- border
- short label

Destructive:

- restrained red

---

# 11. Icons

HouseToDo と同じ。

- simple outline icons
- SF Symbols-like / Lucide-like
- medium stroke
- no mixed icon families
- no decorative icons
- fill only when semantically useful
- accessibility labels remain internally

---

# 12. Bottom Navigation

LifeHub 固有差分は項目だけ。

Order:

1. Calendar
2. Daily
3. Add
4. Money
5. Settings

Visible UIは HouseToDo と同じ。

- icons only
- no visible labels
- white background
- thin top border
- no shadow
- selected icon: `--primary`
- unselected icons: neutral gray
- center `+` is slightly larger than other icons
- **center `+` にオレンジ背景を敷かない**
- **floating oversized FABにしない**
- iconのvisual sizeはHouseToDoと同程度にする
- touch targetは44px以上を確保する

中央 `+` は、白背景のナビ内でアイコン自体を少し大きく見せるだけ。

Tap opens lightweight choice:

- 家
- 仕事
- お金

---

# 13. Interaction consistency

HouseToDo と同じinteraction grammarを使う。

- tap = primary action / useful detail
- secondary actions = swipe or deeper screen where appropriate
- destructive actions = deeper / confirmation
- add = center `+`
- bottom sheets = modal selection/details
- gestures need fallback controls where discovery matters

同じ意味・同じ役割には、既存の色・spacing・size・interactionを再利用する。
新しい見た目は意味が異なる場合だけ導入する。

---

# 14. Calendar

LifeHubの中心画面。

HouseToDo DESIGN.md の「TimeTree-styleで月Calendar自体を画面の大部分にする」思想をさらに強く適用する。

Requirements:

- month calendar should dominate the screen
- six weeks / 42 cellsを基本
- 可能な限り予定情報をセル内に表示
- long titleは `…`
- overflowは日付右上の小型丸バッジ
- 件数バッジは日付数字と同じ高さに置き、予定領域を圧迫しない
- バッジがないセルは固定行を空けず、予定表示へ高さを使う
- CalendarのMoney summaryは通常row allocationの一部として扱い、`すべて`では利用可能rowの最終rowを予約する。Moneyをabsolute overlayとして配置しない
- `家` / `仕事`ではMoneyを表示せず、`お金`ではMoney名称と最終rowの日計を表示する
- multi-day scheduled eventはTimeTree型の横帯
- period eventは対象期間の開始日にだけ表示し、Calendar上で帯にしない
- 今日の強調は日付数字周辺だけを控えめに
- Saturday blue / Sunday redはrestrained shade
- headerはcompact

大きなカードでCalendarを囲わない。

---

# 15. Daily

HouseToDo Homeの「1画面内で自然に情報を流す」考え方を継承する。

上から:

1. 予定タイムライン
   - 終日
   - period
   - 時間あり
2. 今日のお金
3. 今日のメモ

各セクションを大きなrounded cardで分断しない。
spacing / divider / headingで構造化する。

---

# 16. Forms

HouseToDoフォームの方針をそのまま継承する。

- one screen
- Progressive Disclosure
- row -> BottomSheet
- summary in row
- hidden advanced settings
- no wizard unless truly necessary

Form rowはカードではなく、基本は自然なlist / divider構造。

---

# 17. BottomSheet

HouseToDo と同じ。

- white surface
- ~16px top corners
- no decorative shadow-heavy treatment
- content hierarchy by typography / divider / spacing
- drag/close pattern can follow HouseToDo
- large sheets may cover most of screen while leaving context slightly visible

M11検索UIでは、Calendar全体検索を専用sub screen、Event / Moneyの再利用検索をBottomSheetとして分ける。再利用sheetはinput 16px以上、min-height 52px程度のdivider付きflat list、no card、no shadow、tapで選択してcloseとする。入力中もsheetのviewport基準・safe-area・list scrollを維持し、0件は「見つかりませんでした」とだけ表示する。

---

# 18. Evidence / Design review rule

UI実装時は `390×844` Evidenceを必須とする。

Codexは「動いた」だけでは完了扱いにしない。

Evidence reviewでは毎回以下を確認する。

- English decorationが紛れ込んでいないか
- card-everythingになっていないか
- large radius / shadowを乱用していないか
- 小さなgray subtitleを常設していないか
- icon sizeが小さすぎないか
- center `+` がFAB化していないか
- HouseToDoと同じdensity / spacing / hierarchyを維持しているか
- LifeHub固有差分が色・情報構造に限定されているか

デザインに迷った場合は、**新しく考える前に HouseToDo-Mockup の `DESIGN.md` と既存Mockupを確認する。**

---

# 19. LifeHub Money analysis screen

通常のMoney画面は今月の確認・登録・修正に集中し、長期の可視化はMoney配下の独立した`お金の分析`sub screenで扱う。分析画面も通常Moneyと同じscreen header、spacing、summary row、divider、Bottom Navigationを使い、SaaS dashboardや銀行KPI画面へ寄せない。

分析画面は縦1列で、header、年selector、globalな`見込み | 実績`切替、年間summary、`月ごとの支出`line chart、選択月detail、`年間の支出カテゴリ`donutの順とする。sectionを大きなcardで囲まず、chartは背景・shadow・gradientなしの静かなSVGとし、各月の選択領域は44px程度を確保する。実績modeの未来月は0円線を描かず、未確定として線を切る。

年選択は既存Money / Calendarのmonth selectorと同じ左右矢印・横swipe grammarを使う。分析画面でもBottom NavigationのMoneyをselectedに保ち、header backまたはMoney再選択で通常Moneyへ戻る。category色は通常Money donutと同じ`MoneyCategory.colorKey`を使い、分析画面だけの装飾色を追加しない。

---

# 20. Source-of-truth relationship

Design precedence:

1. `docs/DESIGN.md` — Director / anti-patterns / interaction / UI composition
2. `docs/DESIGN_SYSTEM.md` — LifeHub token details
3. `docs/SCREEN_SPEC.md` — screen-specific information and behavior
4. individual implementation decisions

HouseToDo固有のTask / Shopping / Household / completion UIはLifeHubへ持ち込まない。

それ以外の普遍的なDirector / anti-pattern / typography / spacing / radius / surface / button / icon / Bottom Navigationの思想は、**原則 HouseToDo と同じにする。**

---

# 21. Local Archive UI

Settings > データ / バックアップ内のArchiveは、管理ダッシュボードや削除確認画面にしない。flat list、divider、spacing、既存FormRow/Button grammarを使い、端末保存件数・クラウド保持範囲・状態・最終確認を短く表示する。

状態は「未確認 / 候補あり / 保存中 / 確認待ち / アーカイブ完了 / 確認できませんでした」とし、主操作は「アーカイブを確認」とする。「削除」を主ラベルにせず、IndexedDB保存と検証が先に完了する安心感を伝える。390×844でempty、candidate、saving、complete、confirm pending/error、archived rangeを確認する。大きなカード、shadow、gradient、KPI dashboard、常設の英語装飾は追加しない。

JSON Backup rowはM13のJSON export実装まで表示しない。M12のSettings data detailはLocal Archive機能だけを表示する。

## 22. Backup / Migration UI

Settings > データ / バックアップでは、通常の「バックアップ」と「機種変更」を別sectionにする。各sectionは見出し・短い説明・actionのflat compositionとし、大きなcardを横並びにしない。Archive sectionは既存の状態・最終確認・「アーカイブを確認」を維持して下側に置く。

機種変更は短いstep表示（作成 → 保存済みファイル確認 → 開始）とsimple rowsのrestore previewを使う。primary actionはorange、最終確認だけ慎重な文面にし、warning red面やdashboard/KPI化は避ける。migration_locked中はbottom navigationを隠し、専用画面でJSON選択・復元状態・retryを表示する。

## 23. M14 Settings interaction rules

Settingsの画面遷移rowは共通FormRowのchevronを1個だけ使い、summary文字列へ`>`や`›`を重ねない。保存中は対象rowと関連actionをdisabledにし、失敗時は既存Form grammarの控えめなalertとretryを使う。選択式のMoney category colorは既存colorKey paletteのswatchと日本語labelを併記し、selected状態をcheckまたはborderでも示す。新規に追加する入力・操作は既存safe-areaとiPhone向け16px以上のinput grammarを維持する。
