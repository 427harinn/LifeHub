# Milestone 2: Auth / Personal Settings / Navigation Shell

## 現在のMilestone

M2を完了。M1の完了記録は下記に保持する。

## 目的

LifeHubを個人アプリとして利用できる骨格にする。User / Session / Cookie認証、UserSettings、userId ownership、migration_locked guardの土台、Calendar / Daily / Money / Settingsへのnavigation shell、中央`+`の選択UIを実装する。

## 明示的な非対象

- Event / Money / DailyNoteの本機能・CRUD
- recurrence / notification / archive / device migrationの本機能
- Household / HouseholdMember / invite / owner-member role
- staging / production deploy、Cloudflare外部リソース作成
- M3のEvent登録フォーム

## M2完了条件

- login / logout / authenticated user取得 / Cookie sessionがWorkerで動作
- userId ownershipをUserSettings / LifeHubUserStateで確認
- UserSettingsが初回取得時に生成され、指定項目をAPI / frontend stateで扱える
- migration_locked中の通常writeを拒否するguard土台がある
- 5項目のicons-only Bottom Navigationと4画面shellが390×844で確認できる
- 中央`+`から家 / 仕事 / お金のBottomSheet選択UIを開ける
- lint / typecheck / unit / integration / build / Playwright pass
- 指定Evidence、docs、commit、push、main向けPRを作成（自動mergeなし）

## 進捗

- [x] 最新`main`をfetchし、M1と別のM2 branchを作成
- [x] 指定docsとHouseToDo auth実装を確認
- [x] Auth / Session / User / UserSettings / LifeHubUserStateを実装
- [x] Navigation / screen shell / add choiceを実装
- [x] test / Evidence / docs更新
- [x] self-review、commit、push、PR作成

## PR #2 レビュー対応

- [x] 最新の`SCREEN_SPEC.md` / `DEVELOPMENT_POLICY.md` / `DESIGN.md`を確認
- [x] Calendarを42セルの高密度fixture、タブ、検索placeholder、日付BottomSheetへ更新
- [x] safe-area top / bottomを主要shellへ反映
- [x] Settings root → detail shell構造へ更新
- [x] Daily / Money fixtureと390×844 Evidenceを更新
- [x] 同じPR #2のbranchへpush。新しいPRは作成しない

---

# Milestone 1: Application Foundation

## 目的

LifeHubを、HouseToDoのドメインを持ち込まない独立アプリとしてローカルで起動・検証できる状態にする。
React / Vite / TypeScript、Cloudflare Workers + Vite assets、local D1 / `wrangler dev`、品質検証、PWAの最低限の土台、LifeHub用UI foundationを整える。

## 対象範囲

- React / Vite / TypeScript基盤
- Cloudflare Workers + Vite assets構成
- local D1と`wrangler dev`
- lint / typecheck / Vitest / Playwright / build
- PWA / Service Workerの最低限の土台
- LifeHub用ディレクトリ構成と汎用UI foundation
- HouseToDoと同系統のspacing / radius / typography
- LifeHubのオレンジ系color token
- Button / Input / FormRow / BottomSheet / mobile shell
- 390×844での表示確認とscreenshot evidence

## 明示的な非対象

- Auth / Sessionの本実装
- Calendar / Event / Moneyの本実装
- Task / TaskRecord / Shopping / Household / HouseholdMember
- invite、owner/member role、Todo workflow
- weekly_flexible / monthly_flexible
- HouseToDoのgreen theme
- staging / production deploy、migration、既存Cloudflare resourceへの操作

## 完了条件

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- Playwrightで390×844表示確認
- UI screenshot evidenceにオレンジテーマ、mobile shell、Button、Input、FormRow、BottomSheet、共通spacing / radius / typographyを含む
- HouseToDo固有ドメイン、green theme、M2以降の機能が混入していない
- 関連docsの不足・不整合を必要に応じて更新
- commit / push / main向けPR作成（自動mergeなし）

## 進捗

- [x] 最新`main`確認とM1 branch作成
- [x] 指定docs確認。最新mainで存在する関連docsを再確認
- [x] HouseToDoの汎用基盤とCloudflare構成を調査
- [x] LifeHubのアプリ基盤とディレクトリを実装
- [x] UI foundationと390×844 evidence画面を実装
- [x] lint / typecheck / unit / build / Playwrightを実行
- [x] self-reviewとdocs更新
- [x] DESIGN.mdレビュー対応: 装飾的な英語ラベル・card-everything・shadow・FAB風ナビを除去し、HouseToDo系のdensity / hierarchyへ修正
- [x] 390×844のFoundation通常状態 / BottomSheet open状態を再撮影し、Evidenceを置換
- [x] commit / push / PR作成（PR #1 / 自動mergeなし）

## セルフレビュー観点

各小タスク完了時に以下を確認する。

- HouseToDo固有ドメインが混入していないか
- green themeが残っていないか
- mobile-firstになっているか
- 共通UIが今後再利用可能な構造か
- M2以降の機能を先行実装していないか

## デザインレビュー対応（2026-09-07）

- `docs/DESIGN.md`を最上位仕様として、装飾目的の英語見出し・caption、常設説明文、連続した大きなrounded card、decorative shadowを削除。
- hierarchyをspacing / divider / typographyで再構成し、Button / Input / FormRow / BottomSheetは再利用可能なUI基盤として維持。
- Bottom Navigationを白背景・thin top border・no shadow・icons onlyへ修正。selected iconのみLifeHub orange、center `+`は背景なしで少し大きいアイコンとした。
- 390×844の通常状態とBottomSheet open状態を再撮影し、Playwrightで表示仕様を検証。
