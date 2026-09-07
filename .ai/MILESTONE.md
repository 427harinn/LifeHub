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

## PR #2 レビュー対応（連続帯 / fixture密度 / Date Sheet）

- [x] 最新`DESIGN.md` / `SCREEN_SPEC.md`を確認し、複数日予定・period予定をセル外の週帯レイヤーで連続表示
- [x] 同一週内・週またぎ・週またぎと通常予定/金額の同居・`+N`をM2表示専用fixtureで確認
- [x] Calendarセルを日付左上、予定、金額最下部中央へ整理し、金額なしセルは予定領域を拡張
- [x] Date Sheetを縦長化し、収支を1行表示、追加`＋`を詳細ボタンから離して独立配置
- [x] Dailyの時間ありfixtureを6件へ増量し、家=オレンジ、仕事=青のカテゴリトーンを反映
- [x] 390×844の通常 / 複数日帯 / 週またぎ / Date Sheet / Daily / Money / Settings / Add Evidenceを再撮影
- [x] lint / typecheck / unit・integration / build / Playwrightを再実行し、同じPR #2へpush

## PR #2 レビュー対応（Calendar / fixture / separator）

- [x] 最新`DESIGN.md` / `SCREEN_SPEC.md`を再確認し、Calendarの順序をタブ→年月→中央寄せの`今日`→曜日→42セルへ調整
- [x] Calendarセルの日付・金額・予定・`+N`の固定配置、支出/収入色、通常予定の背景なし表示を反映
- [x] 同一週内・週またぎの複数日帯、期間帯、`+N`のM2表示専用fixtureを追加（Worker / D1へ保存しない）
- [x] Date Sheetの大きな追加テキスト導線を小型オレンジ丸`＋`へ変更し、既存の詳細導線を維持
- [x] Dailyの区切り線を項目間だけに整理し、個人用文言を`家の予定`へ修正
- [x] 390×844 Evidence、lint / typecheck / unit・integration / build / Playwrightを再実行
- [x] 同じPR #2のbranchへpush。mergeと新規PR作成は行わない

## PR #2 レビュー対応（帯色 / 件数バッジ / 検索Sheet）

- [x] `DESIGN.md` / `SCREEN_SPEC.md`を最優先で再確認し、複数日帯を家=オレンジ・仕事=青の連続帯へ調整。開始端・終了端のみ角丸、レーン間に隙間を設定
- [x] Calendarの`+N`を日付右上の小型件数丸バッジへ変更し、period予定は最終日の期限表示だけに整理
- [x] Calendarの単日予定とDailyを家=オレンジ・仕事=青の文字色で統一し、Dailyのカテゴリ文字ラベルを削除
- [x] 検索アイコンから入力欄・結果一覧付きの大きなBottomSheetを開き、結果タップから該当日Sheetへつながるplaceholder導線を追加
- [x] Date Sheetの収支1行・お金一覧・収支合計・独立した小型`＋`を維持し、390×844 Evidenceを再撮影
- [x] lint / typecheck / unit・integration / build / Playwrightを再実行し、同じPR #2へpush。mergeと新規PR作成は行わない

## PR #2 レビュー対応（タブ状態 / period開始日 / 1日詳細簡略化）

- [x] 最新の`DESIGN.md` / `SCREEN_SPEC.md`を確認し、Calendarの件数バッジを日付数字より少し下へ配置。バッジなしセルに固定行を確保しない仕様を明文化
- [x] period予定をCalendarの対象期間開始日にだけ表示し、Calendar上の帯を廃止。Daily / Date Sheetでは期間内の予定を確認できる構造を維持
- [x] Calendarから開く1日詳細のMoney表示を個別明細なしの収支合計1行へ簡略化し、家=オレンジ・仕事=青の予定色を反映
- [x] Dailyのすべて / 家 / 仕事 / お金、Calendarのすべて / 家 / 仕事 / お金をfixtureで切り替え、390×844 Evidenceを追加
- [x] `docs/SCREEN_SPEC.md`と関連する`docs/DESIGN.md`の旧ルールを更新し、lint / typecheck / unit・integration / build / Playwrightを再実行

## PR #2 最終レビュー対応（件数バッジ位置）

- [x] Calendarの日付右上件数バッジを日付数字と同じ高さへ戻し、absolute配置とバッジなしセルの可変予定領域を維持
- [x] `DESIGN.md` / `SCREEN_SPEC.md`へ日付・バッジ・予定・金額の配置ルールを明記
- [x] 390×844 Calendar Evidenceを再撮影し、lint / typecheck / unit・integration / build / Playwrightを再実行して同じPR #2へpush

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
# Milestone 3: Single Scheduled Event

## 現在のMilestone

M3完了。対象は`timingType=scheduled`の家 / 仕事Eventのみとし、recurrence / period / notification / Money / Search / stagingは対象外とする。M1 / M2の完了記録は上記に保持する。

## 目的

認証ユーザーが自分の家・仕事の通常予定を登録、確認、編集、soft deleteできる状態にする。Calendar / Dailyから日付contextを引き継ぎ、登録後も元の画面と日付へ戻る。

## 完了条件

- [x] scheduled Event migration / repository / service / route
- [x] userId ownershipをcreate / list / get / update / delete / recent全てで確認
- [x] title / date / time / allDay / multi-day validation
- [x] home / work EventForm、progressive disclosure、recent definitions
- [x] Calendar / Dailyの実Event表示、detail / edit / delete confirm
- [x] Calendar / Daily / center `+` のreturnTo
- [x] 390×844 EvidenceとreturnTo動画
- [x] lint / typecheck / unit / integration / build / Playwright
- [x] docs / commit / push / main向けPR（自動mergeなし）

## 明示的な非対象

- recurrence本実装、period Event、Event通知本実装
- Money登録、Search本実装
- staging resource作成、staging deploy、production/default、HouseToDo環境

## 進捗

- [x] 最新`main`からM2とは別のbranchを作成し、指定docsを確認
- [x] Event schema / repository / service / CRUD routeを実装
- [x] scheduled Event form / detail / edit / soft deleteを実装
- [x] Calendar / Dailyの実Event表示とreturnToを実装
- [x] test / Evidence / docs更新
- [x] self-review、commit、push、PR作成

---
