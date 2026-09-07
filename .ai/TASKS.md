# Milestone 2 Tasks

## 小タスク

- [x] T1: 最新`main`をfetchし、M1と別のM2 branchを作成
- [x] T2: 指定docsとHouseToDoの安全な認証方式を確認
- [x] T3: User / Session / Cookie auth / auth middleware / APIを実装
- [x] T4: UserSettings / LifeHubUserState / migration_locked guard / ownershipを実装
- [x] T5: Auth UI、session restore、logout、route shellを実装
- [x] T6: Bottom Navigation、Calendar / Daily / Money / Settings shell、中央`+`選択UIを実装
- [x] T7: unit / integration / Playwrightを追加・実行
- [x] T8: 390×844 Evidenceと必要なdocsを更新
- [x] T9: self-review、commit、push、main向けPR作成。自動mergeしない
- [x] T10: PR #2へ反映された最新版docsを確認
- [x] T11: Calendar / Daily / Money / Settings shellをfixture中心へ更新
- [x] T12: safe-area、Calendar date sheet、Settings detail、Evidence、Playwrightを更新
- [x] T13: 最新`DESIGN.md` / `SCREEN_SPEC.md`に合わせてCalendar header / safe-area / cell alignmentを再調整
- [x] T14: 複数日帯・期間帯・`+N` fixture、Date Sheetの小型`＋`、Daily separator、個人用文言を更新
- [x] T15: 390×844 Evidenceを再撮影し、lint / typecheck / unit・integration / build / Playwrightを再実行してPR #2へpush
- [x] T16: 複数日予定を週帯レイヤー化し、同一週内 / 週またぎの連続表示と通常予定・金額の同居を追加
- [x] T17: Date Sheetを縦長化し、収支1行化、独立した追加`＋`配置、Daily時間fixture6件とカテゴリ色を反映
- [x] T18: 390×844 Evidenceを再撮影し、lint / typecheck / unit・integration / build / Playwrightを再実行
- [x] T19: Calendarのカテゴリ色付き連続帯、端部角丸、レーン間隔、件数丸バッジ、period最終日表示を実装
- [x] T20: Calendar検索BottomSheet、検索結果から該当日へのplaceholder導線、Date Sheetのお金一覧・収支合計を実装
- [x] T21: Dailyのカテゴリ文字ラベルを削除し、家=オレンジ・仕事=青の色表現へ統一
- [x] T22: 390×844 Evidenceを再撮影し、lint / typecheck / unit・integration / build / Playwrightを再実行して同じPR #2へpush
- [x] T23: Calendar件数バッジの位置と可変表示領域、period開始日表示を更新
- [x] T24: Calendar Date SheetのMoneyを収支合計1行へ簡略化し、家 / 仕事のカテゴリ色を反映
- [x] T25: Calendar / Dailyの全タブfixture表示と390×844 Evidenceを追加
- [x] T26: `SCREEN_SPEC.md` / `DESIGN.md`を最新レビュー仕様へ更新し、全テストを再実行

## M2セルフレビュー観点

- userId ownershipが全Auth / Settings / UserState queryにある
- Household / invite / owner-member role / switchingを持ち込んでいない
- migration_locked中の通常write guardがWorker側にある
- English decoration、card-everything、decorative shadow、FAB化を復活させていない
- Bottom NavigationがCalendar / Daily / + / Money / Settingsの順で、icons only、44px touch target
- M3のEvent登録機能へ踏み込んでいない

---

# Milestone 1 Tasks

## 小タスク

- [x] T1: 最新`main`確認、M1 branch作成、指定docs確認
- [x] T2: HouseToDoから汎用のbuild / test / Worker / UI構造を調査
- [x] T3: React / Vite / TypeScript / ESLint / Vitest / Playwright基盤を作成
- [x] T4: Cloudflare Worker + Vite assets、local D1、`wrangler dev`設定を作成
- [x] T5: PWA manifest / Service Workerの最低限の土台を作成
- [x] T6: LifeHub token、Button、Input、FormRow、BottomSheetを実装
- [x] T7: 390×844 mobile shellとevidence確認画面を実装
- [x] T8: unit / Playwrightを作成・実行し、screenshot evidenceを保存
- [x] T9: 各種self-review、関連docs更新、最終test
- [x] T10: commit、push、main向けPR作成。自動mergeしない（PR #1）
- [x] T11: PR #1デザインレビュー対応（`docs/DESIGN.md`準拠のUI foundation再調整、Evidence置換、テスト再実行）

## 進捗メモ

### T1

- 2026-09-07: `origin/main`をfetchし、`30cdbe0`を確認。
- 2026-09-07: `codex/milestone-1-application-foundation`を作成。
- 2026-09-07: 指定された`DEVELOPMENT_POLICY.md`と`IMPLEMENTATION_PLAN.md`はリポジトリに存在しないことを確認。

### Self-review checklist

- HouseToDo固有ドメイン混入: なし（LifeHub専用Worker / UI / migrationのみ）
- green theme混入: なし（primaryはLifeHub orange token。successは汎用状態色のみ）
- mobile-first: 確認済み（390×844 Playwright + screenshot）
- 共通UIの再利用可能性: 確認済み（`src/components/ui/`へ分離）
- M2以降の先行実装: なし（Auth / Calendar / Event / Money API・画面は未実装）

### T11: PR #1デザインレビュー対応

- 2026-09-07: 英語の装飾見出し / caption、card-everything、decorative shadow、常設small gray説明文を削除。
- 2026-09-07: Bottom NavigationをHouseToDo同様のicons-only構造へ修正し、白背景・thin top border・no shadow・orange selected iconを確認。
- 2026-09-07: `foundation-390x844.png` / `bottom-sheet-390x844.png`を再撮影。
- 2026-09-07: lint / typecheck / unit / build / Playwrightを再実行。

#### T11セルフレビュー

- HouseToDo固有ドメイン混入: なし
- green theme混入: なし（orange token経由。successは状態表示用の汎用色）
- mobile-first: 確認済み（390×844 Playwright + screenshot）
- 共通UIの再利用可能性: 確認済み（`src/components/ui/`のButton / Input / FormRow / BottomSheet / MobileShell / NavIcon）
- M2以降の先行実装: なし
