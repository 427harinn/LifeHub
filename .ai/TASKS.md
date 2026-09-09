# Milestone 7 Tasks

## 小タスク

- [x] T1: M6 merge済み最新`main`を確認し、M6 branchを再利用しない`codex/m7-notification`を作成
- [x] T2: LifeHub指定docsとHouseToDo指定実コード・テストを実読し、再利用境界を整理
- [x] T3: `0008_m7_notifications.sql`とuserId所有のPushSubscription / EventNotification / Template / Deliveryを追加
- [x] T4: LifeHub専用VAPID設定、Web Push、404/410単体disable、複数端末、unsubscribeを実装
- [x] T5: PWA Service Worker、capability、user action permission、subscription登録を実装
- [x] T6: Event create/updateへの複数offset統合、Template CRUDとEventForm適用を実装
- [x] T7: all-day 09:00、scheduled、period deadline、timezone/DST、M5/M6 projection準拠のschedulerを実装
- [x] T8: 朝夜summary、migration_locked除外、5分Cron、delivery claim / retry / dedupeを実装
- [x] T9: Settings通知section、時刻設定、Template管理、same-origin deep linkを実装
- [x] T10: unit / integration / typecheck / lint / build / local migrationを実行
- [x] T11: 390×844 EvidenceとM7 UI / scheduler Evidenceを作成。自動ブラウザのpermission deniedとは別にstaging実機記録を追加
- [x] T12: OAuth / account / D1 / secrets確認後、staging migration / deploy / smokeを実行
- [x] T13: staging iPhone PWAでpermission → subscription → direct Push → Event単体 / 朝summary / 夜summary受信 → tap → Calendar/Event遷移を記録
- [x] T14: regression、docs同期、self-review、commit / push、PR作成。auto-mergeしない

## M7セルフレビュー

- Todo完了・未完了・skip判定を通知条件に使っていない
- occurrenceを事前生成せず、M5/M6 `EventProjectionService`だけを使っている
- summaryは0件なら送らず、3件程度 + `ほかN件`で詰め込みすぎない
- all-day 09:00と朝summary時刻を連動させていない
- partial subscription failureで成功端末へ再送せず、404/410は該当端末だけdisableする
- deep linkはsame-origin pathだけで、recurring occurrenceKey/date contextを保持する
- 実機確認はstagingのみで行い、朝夜summaryのslot重複なし、scheduled / period本文、Todo完了前提でない文言、9/9 Calendar遷移を確認した
- 実機確認完了後、staging限定temporary test Push UI/APIを削除した
- production/default / HouseToDo / M8 Moneyには触れていない

## HouseToDo確認ファイル

Backend: `worker/routes/notifications.ts`, `worker/routes/notification-settings.ts`, `worker/services/push-subscription-service.ts`, `worker/repositories/push-subscription-repository.ts`, `worker/services/web-push-service.ts`, `worker/services/notification-scheduler-service.ts`, `worker/repositories/notification-delivery-repository.ts`, `worker/index.ts`。Frontend: `public/sw.js`, `src/main.tsx`, `src/api/notifications.ts`, `src/lib/capabilities.ts`, `src/lib/vapid.ts`, `src/lib/notification-url.ts`。Tests: `worker/notifications.test.ts`, `worker/services/web-push-service.test.ts`, `worker/services/notification-scheduler-service.test.ts`, `worker/repositories/notification-delivery-repository.test.ts`, `worker/scheduled.test.ts`, `src/lib/capabilities.test.ts`, `src/lib/vapid.test.ts`, `src/lib/notification-url.test.ts`。

---

# Milestone 5 Tasks

## 小タスク

- [x] T1: 最新`main`からM4を再利用しないM5 branchを作成し、指定docsを確認
- [x] T2: M4のCloudflare API `7403` permission error記録とstaging対象を確認
- [x] T3: RecurrenceRule / EventOccurrenceOverride migration、type、repository、validationを実装
- [x] T4: daily / weekly / monthly projection、interval、weekdays、month clamp、startsOn / endsOn、stable keyを実装
- [x] T5: Calendar / Dailyを共通projectionへ接続し、M4 UI interactionを維持
- [x] T6: EventFormのなし / 毎日 / 毎週 / 毎月 / カスタムとinterval / weekdays / endsOnを実装
- [x] T7: occurrence / following / seriesの編集・削除、override、series split、soft delete、ownershipを実装
- [x] T8: recurrence unit、scope、projection parity、timezone/date boundary、ownership testを追加
- [x] T9: 390×844 Evidenceとrecurrence登録 / scope操作動画を作成
- [x] T10: local migration、lint / typecheck / unit / build / Playwrightを実行
- [x] T11: `npx wrangler d1 migrations list DB --env staging --remote`で過去の7403発生箇所を確認。再実行では再現しなかった
- [x] T11a: recurrence UI review対応（human summary、interval単位表示、weekly開始曜日、終了row、scope補助文、曜日0件validation、Evidence更新）
- [x] T12: `0005_m5_recurrence.sql`の`lifehub-staging` migration / deploy / recurrence smokeを実行。最終migration listは`No migrations to apply!`
- [x] T13: self-review、docs同期、同じPR #5へcommit / push。自動mergeしない

## M5セルフレビュー観点

- Calendar / Dailyは同じEventProjectionServiceを利用している
- recurrence occurrenceを大量生成せず、要求rangeだけprojectionしている
- occurrenceKeyは再projectionしても同じで、Calendar / Dailyの表示・編集keyに利用している
- monthly day 31は短い月末へclampする
- overrideはuserId + eventId + occurrenceKey ownershipを満たし、cancelledは完了扱いにしない
- followingは元Ruleを対象直前で終了し、新系列を対象occurrenceから開始する
- series deleteはactive=false + deletedAt、過去occurrenceを壊さない
- M4 Calendar adaptive row、Money最下段、Date Sheet、Daily inline、swipe、day swipe、BottomSheet drag closeを置換していない
- period / notification / Money recurrenceを実装していない
- production/default / HouseToDoには触れていない

## M5 staging / 7403 final record

- WranglerはOAuth認証、`d1 (write)` scopeあり。account / `lifehub-staging` / database ID `da75b9df-dcb6-4e80-991e-6310be3c1933`の整合を確認した。
- 7403は過去に発生したが現在は再現せず。OAuth/account認可状態またはCloudflare側一時状態の可能性があるため、解決済みとは断定せず、再発時は同じ切り分けを行う。
- stagingでmigration、deploy、health / auth / recurrence create / Calendar / Daily / occurrence edit / occurrence delete smokeに成功した。
- production/default / HouseToDoは未操作。

---

# Milestone 6 Tasks

## 小タスク

- [x] 最新`main`から`codex/m6-period-event`を作成し、M5 branchを再利用しない
- [x] 指定docsを確認し、M6のperiod表示仕様を同期
- [x] Event schema / migration `0006_m6_period_events.sql`、period validation、ownershipを実装
- [x] M5共通projectionへperiod window / weekly / monthly projection、stable key、overrideを追加
- [x] EventFormの予定種別 / 実施時期 / period recurrence分岐を実装
- [x] Calendar / Daily / Date Sheetへperiod projectionを接続し、既存interaction grammarを維持
- [x] period projection / key / validation / override回帰テストを追加
- [ ] 390×844 Evidence / staging migration / deploy / period smoke / PR作成（OAuth token期限切れのためstagingはSTOP）

## M6セルフレビュー

- Calendar period帯・period専用色を追加していない
- Calendarはperiod開始日、Daily / Date Sheetは期間内の日を表示する
- custom_rangeではrecurrence rowを表示せず、無効なrecurrence選択肢を出さない
- periodにcomplete / checkbox / skip / pass / completion historyを追加していない
- M4のCalendar adaptive row、Money最終row、Date Sheet、Daily inline、swipe、day swipe、BottomSheet drag closeを置換していない
- production/default / HouseToDoには触れていない
- M6 remote確認では`whoami`がOAuth token期限切れでrefreshできず、D1 list / migration listも認証要求で停止。7403は再現していないため、OAuth再認証後に同じ切り分けを行う

---

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
