# Milestone 4 Tasks

## 小タスク

- [x] T1: 最新`main`から`codex/m4-calendar-daily-staging`を作成し、M3 branchを再利用しない
- [x] T2: 指定docsとM3 merge済みCalendar / Daily UIを確認
- [x] T3: Calendar 6週range / Daily指定日を共有するEvent projection serviceを実装
- [x] T4: `/api/calendar` / `/api/daily` とactive・deleted・ownership条件を実装
- [x] T5: DailyNote migration / get / create-update / delete / empty handlingを実装
- [x] T6: Calendar月切替、今日、Date Sheet → Daily、Calendar / Daily returnToを実装
- [x] T7: Daily前日 / 次日 / 今日、指定日表示、実Event反映を実装
- [x] T8: 既存Daily tap展開 / 再tap閉じ / swipe edit / direct editを回帰確認
- [x] T9: low / high / adaptive row / Money tab / multi-day / Date Sheet / Daily / DailyNote Evidenceを作成。max 2・3・4は履歴比較として保持
- [x] T10: Calendar → Daily / Add returnTo / Daily Add returnTo / swipe edit動画を作成
- [x] T11: projection / DailyNote unit・API・Playwright回帰を追加・実行
- [x] T12: `lifehub-staging` / `lifehub-staging`確認・必要時作成、staging deploy（既存schemaで確認）
- [x] T13: staging health / login / Event CRUD / Calendar / Daily / DailyNote smoke
- [x] T14: self-review、docs同期、commit / push、main向けPR作成。自動mergeしない

## PR #4 UI修正

- [x] Calendarのstacking orderとmulti-day / single-day領域を分離
- [x] adaptive `availableRows`のvisible / hidden計算、Money summary最終row予約、Money明細hidden countを回帰
- [x] 390×844の縦余白・日付数字・3件目標を調整
- [x] Event formの予定種類 / 繰り返し / 通知rowとsheet開閉を修正
- [x] 16px入力、HouseToDo式の軸判定付き月スワイプを追加
- [x] 実機相当EvidenceとM2/M3/M4回帰を更新

## M4セルフレビュー観点

- Calendar / Dailyが同一Event projection serviceを使う
- Calendarはmonth全件ではなく42セルに必要なrangeだけ取得する
- Dailyは指定日rangeだけ取得する
- userId ownershipとsoft-deleted Event除外がある
- M3のCalendar / Daily DOM・CSS・操作grammarを再設計していない
- Calendarは固定maxを採用せず、実測セル高から`availableRows`を算出する
- `all`はMoney summary最終row予約、`home` / `work`はMoney予約なし、`money`はMoney名称 + 最終row日計
- multi-day / single-day / Money row競合、Date Sheet / Dailyのday swipe、inline expand / swipe edit、quick-add popup、outside tap close、BottomSheet drag-down closeを完了
- DailyNoteは`userId + date`一意で、空保存と削除を安全に扱う
- Money fixture / Search placeholderを本実装と混同していない
- staging / production / HouseToDoの対象を取り違えない

## M4完了時点の文書同期

- 390×844だけで固定2 / 3 / 4件を決める方式は、iPhone Safariのsafe-area / browser UI差で崩れるため不採用とした。
- 現在は実測セル高から`availableRows`を求め、超過Event / Money明細だけをhidden countへ送る。
- staging remote migrationではCloudflare API `7403` permission errorが発生したが、今回新規migrationはなく既存schemaのsmokeは成功しているためM4 blockerではない。

---

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
- [x] T27: Calendar件数バッジを日付数字と同じ高さへ戻し、Evidenceと全テストを再実行

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
# Milestone 3 Tasks

## 小タスク

- [x] T1: 最新`main`から`codex/m3-single-scheduled-event`を作成し、指定docsを確認
- [x] T2: M3 Event schema、scheduled制約、userId ownershipを設計
- [x] T3: `0003_m3_events.sql`、Event type / repository / validation serviceを実装
- [x] T4: Event create / list / get / recent / update / soft delete routeを認証付きで実装
- [x] T5: home / work EventForm、日時BottomSheet、all-day、multi-day、place / memo展開を実装
- [x] T6: Calendar / Dailyの実Event表示、Date Sheet、detail / edit / delete confirmを実装
- [x] T7: recent definitionsとCalendar / Daily / center `+` のreturnToを実装
- [x] T8: unit / integration / Playwrightとownership / validation確認
- [x] T9: 390×844 Evidence、returnTo動画、self-review
- [x] T10: docs更新、local migration確認、commit / push / PR作成。自動mergeしない

## PR #3 UI regression correction

- [x] T11: HouseToDo最新mainのHome / Shopping interaction grammarを確認
- [x] T12: M2 Calendar / Daily UIを維持し、実Event表示だけを統合
- [x] T13: Daily Eventのinline展開、再tap閉じ、他行切替、左swipe編集を実装
- [x] T14: 編集画面の深い削除導線、390×844 screenshot / video、回帰Playwrightを追加
- [x] T15: docs更新、self-review、同じPR #3へpush。新規PR・mergeは行わない
- [x] T16: M2 base commitとのCalendar / Daily diffを確認し、Calendar表示DOMへ実Event projectionを接続
- [x] T17: Daily inline detailをvalues-onlyへ整理し、HouseToDoのopenRowAction / toggleTaskDetail排他とHomeSwipeRowのgesture grammarを反映
- [x] T18: M2 Calendar / Daily structure regression、EventForm bottom navigation非表示、place / memo screenshotとswipe動画を更新

## M3セルフレビュー観点

- userId ownershipが一覧・詳細・更新・削除・recent queryにある
- 他ユーザーのEventは404で取得・編集・削除できない
- allDayならtimeはnull、時間ありなら両時刻必須
- scheduled以外、period / recurrence / notificationを先行実装していない
- fixtureは実Event表示に混在せず、DBへ保存しない
- formを大きなcardで囲わず、HouseToDo系のrow / divider / sheetを維持
- 完了ボタン、checkbox、pass等のTodo UIを持ち込んでいない

---
