# オフライン閲覧（読み取り専用）Tasks（2026-11-26）

- [x] O1: 現状調査（スナップショットはIndexedDBにあり、不足はアプリシェルのキャッシュと認証ゲートと判明）
- [x] O2: `public/sw.js` にアプリシェルキャッシュとオフライン・フォールバックを実装（Push維持、`/api/*` バイパス）
- [x] O3: `src/lib/offline-session.ts`（最終認証ユーザー＋スナップショットコンテキスト）とオフライン復元・バナー・編集無効化・`online` 復帰を実装
- [x] O4: unit test追加（SW / offline-session / Appオフライン復元）と lint / typecheck / build / 全218 tests を確認
- [x] O5: ローカル実サーバー + Chromium でオフライン再読み込みの実挙動と390×844 Evidenceを確認
- [x] O6: docs（PRODUCT_SPEC §17）と .ai 記録を同期
- [x] O7: push / PR #36 作成後STOP（auto-mergeしない）
- [x] O8: オフライン編集の可否調査（条件付き可能。outbox・冪等キー・仮ID remap が必須、繰り返し分割と通知は初回対象外）

---

# Milestone 14 Phase E+F Tasks

## App icon follow-up

- [x] A1: calendar + money bag SVGと192 / 512 / maskable / apple-touch-iconを更新
- [x] A2: manifest / HTML / favicon参照を確認
- [x] A3: typecheck / lint / build / staging icon smokeを実行し、新規PR作成後STOP

## 開始記録

- [x] T1: Phase C+D HEAD `6ba09c7fecac08d9c0fcf30de9529ae0fdf43912`を保持した`codex/m14-release-readiness-ef`を作成
- [x] T2: local `origin/main` `45b7c62a6c86c8f29bb8a12625624ad770ae3d8c`、C+D base、production禁止条件を記録
- [x] T3: icon-rainbow source / selected icon / local asset pathを記録

## Phase E: visual / PWA / Service Worker

- [x] T4: Bottom Navigation 5 iconをlocal SVG + CSS maskへ差し替え、label / FAB / orange circleを追加しない
- [x] T5: LifeHub app icon、manifest、apple-touch-icon、maskable entryを整備
- [x] T6: Service Worker registrationを一箇所へ集約し、update / install / activate / pushを回帰
- [x] T7: decorative shadowをcleanupし、lint / typecheck / buildをwarning 0で確認

## Phase F: measurement / RC audit

- [x] T8: local performance route sampleとbuild bundle gzipを記録
- [x] T9: staging health / migration state / Worker versionを記録
- [x] T10: staging総合smokeを実行し、test countsを記録
- [ ] T11: iPhone PWA install、Push receive / tap、deep linkの実機Evidenceを確認
- [x] T12: offline / degraded network、P0 / P1 / P2、release blocker 0を最終監査（offline / degradedは既存error / retry unit・M14 A+B E2Eで回帰）
- [x] T13: README / implementation / design / policy / notification / backup docsとEvidenceを同期
- [x] T14: review-fix commit / push / PR #18更新後STOP、auto-mergeしない

## PR #18 User review fixes

- [x] R1: app icon 3候補を比較し、Candidate Bを採用。SVG / 192 / 512 / maskable / apple-touch-iconとmanifest / HTML参照を更新
- [x] R2: Accountのパスワード変更を通常画面から分離し、Settings historyに沿うsub pageへ接続
- [x] R3: 通知設定をsection化し、通知テンプレートをEventFormのoffset snapshot選択へ接続
- [x] R4: Money Categoryを15色固定paletteへ拡張し、current color row + accessible BottomSheetへ変更
- [x] R5: stagingでのレビューfix smokeを記録。iPhone実機gateは未実施manual gateとして残す

## 開始記録

- [x] T1: 最新 `origin/main`（`45b7c62a6c86c8f29bb8a12625624ad770ae3d8c`）とPhase A+B merge済みmainを確認
- [x] T2: `codex/m14-release-readiness-cd` を最新mainから新規作成
- [x] T3: `.ai/MILESTONE.md` / `.ai/TASKS.md` にbase SHA・実装境界・STOP条件を記録

## Phase C: mobile / accessibility

- [x] T4: 共通Input / FormRow / form layoutでEventForm、MoneyForm、password、Settings、date/time/number/textarea、2カラムrowのoverflowを解消
- [x] T5: 375×812 / 390×844 / 393×852のoverflow・16px input・Event time rowをassert
- [x] T6: BottomSheetのinitial focus、focus trap、Shift+Tab、Escape、focus restore、background inertを実装・テスト
- [x] T7: reuse / recurrence / notification / category / timezone / weekStartsOn / scope / delete / date sheetのkeyboard・mobile状態を回帰
- [x] T8: 44px tap targetを追加し、Calendar密度・availableRows・Money reserved rowを壊さないことを確認

## Phase D: alternatives / navigation

- [x] T9: Daily / Money / Date SheetのSwipe編集を残し、inline detail内にkeyboard到達可能な編集代替を追加
- [x] T10: Settings detailを `/settings/:detail` とhistoryに同期し、back / forward / reloadを回帰
- [x] T11: Daily dateを `?date=YYYY-MM-DD` とhistoryに同期し、direct URL / reload / back / forwardを回帰
- [x] T12: Calendar selected date、Search jump、Event/Money add-edit-saveのreturnToとBottom Nav hide/showを回帰

## 検証・Evidence・staging

- [x] T13: unit / component、typecheck、lint、build、local E2Eを実行
- [x] T14: `artifacts/evidence/m14/phase-cd/` に最低限の画像とinteraction videoを保存
- [x] T15: staging target / Worker / migrationを確認し、必要な場合のみstaging deploy・smoke・E2Eを実行。7403時STOP
- [x] T16: docs、self-review、commit、push、PR作成。auto-mergeしない

## 今回の非対象

icon-rainbow、Bottom Navigation icon差し替え、manifest/PWA icon、Service Worker二重登録、shadow cleanup、performance計測、Push最終実機、Release final audit、production/default・HouseToDo。

---

# Milestone 14 Phase A+B Tasks

## 開始記録

- [x] T1: `origin/main`をfetchし、PR #15 merge済みmain（`482d73447d131e292799a561912579521b02a105`）を確認
- [x] T2: `codex/m14-release-readiness-ab`を最新mainから作成
- [x] T3: M14監査結果と指定docsを確認し、Phase A+Bの実装境界を固定

## Phase A

- [x] T4: `dailyFixture.period`等の本番描画とM4段階文言を除去し、Daily / Date Sheet emptyを実データのみへ変更
- [x] T5: 新規アカウントEvent 0 / period 0 / Money 0のunit・component・390×844 E2Eを追加
- [x] T6: Calendar / Daily / Money / Money Analysisのloading・empty・error・retry stateを共通方針で実装
- [x] T7: API error時の表示、前回データ保持方針、再試行、Abort / request sequenceをテスト
- [x] T8: delayed responseとlatest navigationのstale response E2Eを追加（rapid month/date/yearの操作全面は後続補強）
- [x] T9: Search period（this_week / this_month / custom_range / occurrence / display anchor）仕様を確定し、実装またはfixtureを修正
- [x] T10: Calendar Money allocation、planned / actual / estimated_actual、row orderの仕様とE2Eを整合
- [x] T11: Migration status / restore failureのalert・retry・再選択・lock維持を実装
- [x] T12: M13 normal backup / lock / cleanup後cancel不可 / restore retry / verify / complete回帰を実行

## Phase B

- [x] T13: Account password change UI、PBKDF2検証、validation、busy、success/error、session safetyを実装
- [x] T14: password wrong / mismatch / valid update / old login fail / new login success / ownership testを追加
- [x] T15: Notification Settings / Templateのchevron二重表示を監査し、共通rowへ統一
- [x] T16: Notification / Template / Money Categoryのloading・retry・save/delete busy・double submit防止を実装
- [x] T17: Calendar timezone / weekStartsOn selection UIとUserSettings保存を実装
- [x] T18: weekStartsOn変更後のCalendar / period / recurrence / Daily / Date Sheet反映testを追加
- [x] T19: Money Category colorKey swatch UI、selected indication、日本語label、保存状態を実装
- [x] T20: custom category colorのSettings dot / donut / legend一致と既存category回帰を追加
- [x] T21: MoneyFormのinput / status accessible nameを一意化しAccessibility Tree testを追加

## 検証・Evidence・docs

- [x] T22: Phase A+B関連test、lint、typecheck、buildを実行
- [x] T23: 390×844 Evidenceを`artifacts/evidence/m14/phase-ab/`へ保存（必要なSheet / migration操作動画を含む）
- [x] T24: staging target / Worker / D1 / migration必要性を確認し、必要な場合のみstaging smokeを実行。7403発生時はSTOP
- [x] T25: `docs/IMPLEMENTATION_PLAN.md`、`docs/API_SPEC.md`、必要な仕様docs、`.ai/MILESTONE.md`、`.ai/TASKS.md`を同期
- [ ] T26: self-review、commit、push、PR作成。auto-mergeしない

## 今回の非対象（後半Phase）

Bottom Navigation icon差し替え、icon-rainbow、PWA manifest/icon polish、BottomSheet全面accessibility、Swipe keyboard代替、44px全面調整、EventForm/MoneyForm overflow、Settings/Daily URL history、Service Worker二重登録、shadow cleanup、performance計測。

---

# Milestone 13 Tasks

## 小タスク

- [x] T1: latest `origin/main` SHA確認、`codex/m13-backup-device-migration`作成、指定docsとM12実装を監査
- [x] T2: M13 export format、secret exclusion、manifest、checksum、state machine、restore authorityを設計
- [x] T3: shared backup types、canonical serialization、checksum、validation、archive conversionを実装
- [x] T4: cloud export APIとdomain全件snapshot（push/session/credentialを除外）を実装
- [x] T5: normal backup client service、JSON self-validation、download、read-only testを実装
- [x] T6: `user_migrations` migration、start/status/restore/verify/complete/cancel APIを実装
- [x] T7: migration start transaction、D1 cleanup、ID保持restore、idempotency、ownershipを実装
- [x] T8: migration_locked server guard、notification scheduler exclusion、recovery stateを実装
- [x] T9: Settings > データ / バックアップの通常backup・機種変更・Archive UIをDESIGN.md準拠で実装
- [x] T10: new-device migration screen、file reselect validation、preview、restore、IndexedDB restore、unlock UIを実装
- [x] T11: validation / failure / retry / route / repository / restore verification testsを追加
- [x] T12: local migration、lint / typecheck / unit / build、390×844 Evidenceを実行
- [x] T13: staging targetを再確認し、staging migration / deploy / health / smokeを実行。7403発生時はSTOP
- [x] T14: staging専用userでold/new browser context destructive E2E、Calendar / Daily / Money / Search / archive一致を確認
- [x] T15: docs同期、self-review、commit / push / PR作成。auto-mergeしない
- [x] 最終修正1: `cleanupCompleted` をstatus APIから受け取り、cleanup後のcancel非表示と復旧案内を390×844で確認
- [x] 最終修正2: staging large fixture（JSON 1,102,390 bytes、D1 restore 1,028 statements）でexport / validate / start / restore / verify / complete / read-backを確認

## M13セルフレビュー観点

- 通常backupと機種変更をUI・API・状態遷移で明確に分離し、通常backupは完全read-only
- JSONはcloud + IndexedDB archiveの完全payloadで、CSV / arbitrary merge importを作っていない
- checksumはM12 canonicalizationを再利用し、collection order・manifest count・byte sizeを検証できる
- password/session/cookie/VAPID private key/secret/OAuth/API/PBKDF2/push subscriptionをexportしない
- saved-file reselect後のvalidationなしにはstart APIを呼ばない。cross-user / unknown schema / duplicate / broken FKを拒否する
- lock transaction成立前にD1 cleanupしない。users / sessions / user stateを残し、cleanup scopeをdomain dataに限定する
- migration_locked中はEvent / Money / Daily / settings writeとnotification schedulerをserverで拒否・除外する
- restoreはID保持・relation順・同一migration/checksum再送のidempotencyを守り、partial failure後もunlockしない
- server restore、IndexedDB restore、server/client verification完了前にcompleteしない。D1削除後cancelはrestore recoveryなしでunlockしない
- 390×844でcard乱用・大きなwarning面・dashboard化を避け、primaryはorange、final confirmationのみ慎重な表現にする
- staging test userのみを破壊的に扱い、production/default・HouseToDo・auto-mergeは未操作

---

# Milestone 12 Tasks

## 小タスク

- [x] T1: latest `origin/main` SHA確認、新規branch作成、指定docs・既存Event / Money / Daily / Search / Settings / D1 schema監査
- [x] T2: M12境界、archive payload、IndexedDB、checksum、confirm safety、M13境界を`.ai`へ記録
- [x] T3: shared archive types、retention boundary、canonical serialization、SHA-256、manifestを実装
- [x] T4: `0012_m12_archive.sql` とserver candidate / confirm service・routeを実装
- [x] T5: Event / recurrence / period / override / DailyNote / Money / settlement candidate判定とactive parent保護を実装
- [x] T6: versioned IndexedDB storage、transaction rollback、read-back、duplicate batch safety、user scopeを実装
- [x] T7: Calendar / Daily / Money / Searchのlocal archive adapterとserver/local dedupe mergeを実装
- [x] T8: Settings Archive UI（empty / candidate / saving / verified / confirm pending / complete / error）をDESIGN.md準拠で実装
- [x] T9: unit / repository-service integration / failure / boundary / timezone / recurrence parent / retry testを追加
- [x] T10: local migration、lint / typecheck / unit / build / E2E、390×844 Evidenceを実行
- [x] T11: staging target / database ID / environmentを再確認し、migration / deploy / health / smokeを実行する。7403発生時はSTOP
- [x] T12: E2Eでarchive前D1、local保存後D1残存、confirm後対象のみ削除、active parent / future projection / UI表示をassert
- [x] T13: docs同期、self-review、commit `c9f3a06`、push、main向けPR #14作成。auto-mergeしない

## M12セルフレビュー観点

- `docs/BACKUP_AND_RETENTION.md`に反してcreatedAtだけで判定していない
- boundaryは`date < boundary`、user timezone、calendar month基準であり、boundary日を削除しない
- local保存→read-back→ID / count / checksum→verified metadata→confirm→server recheck→atomic D1 deleteの順序を守っている
- candidate payloadは自己完結し、表示snapshotとdelete manifestを分離している
- active Event / recurrence parent / future occurrence生成に必要なrule / active MoneyItem / active Money recurrenceを削除しない
- M9 historical settlement anchor semanticsを壊さず、過去planned変更でarchive済み金額が変わらない
- userId scope、duplicate batch、retry、confirm idempotency、stale batch拒否を確認している
- Calendar / Daily / Money / Searchは既存UIを置換せず、server + IndexedDBをstable identityでmergeしている
- Settingsはdashboard化せず、怖いDELETE表現を主操作にしない。390×844で状態別Evidenceを残す
- stagingのみを操作し、production/default・HouseToDo・server Cron delete・auto-mergeを行っていない

## PR #14 review correction

- [x] ArchiveRecordへbatch boundaryを保持し、local Event / Money / Search projectionを`date < retentionBoundary`へ制限
- [x] archive期間（`date < retentionBoundary`）はlocalをauthority、boundary以降とboundary重複はserver / D1をauthorityとしてmerge
- [x] active親snapshotのcurrent / future漏出、old/current title、Money planned amount、Search 5年projectionの回帰testを追加
- [x] 未実装JSON Backup rowをSettingsから除去し、Evidenceを更新
- [x] staging再deploy / staging E2E：Worker version `2e3bb591-4f54-48dc-a5f1-36918f4d14a8`、health HTTP 200、1件pass。7403再発なし

---

# Milestone 11 Tasks

## 小タスク

- [x] T1: 最新origin/mainからcodex/m11-searchを作成し、DESIGN.md・既存Calendar / EventForm / MoneyForm / occurrence architectureとHouseToDo参照実装を確認
- [x] T2: Calendar Search result interface、D1 search query、occurrence / period anchor resolution、ownership / limit / deterministic orderを実装
- [x] T3: /api/events/search、Event reuse search、Money reuse searchとclient APIを実装
- [x] T4: Calendar専用Search sub screen、debounce、0件、result tap → month / date / Date Sheet jumpを実装
- [x] T5: 共通ReuseSearchSheetを追加し、home / work EventFormとMoneyFormへカテゴリscope付きで接続
- [x] T6: click-through、1文字 no search、title / place / memo / category、copy / recurrence regression testを追加
- [x] T7: 390×844 EvidenceとCalendar / Event reuse / Money reuse interaction videoを作成
- [x] T8: docs更新、lint / typecheck / unit / build / E2E、staging deploy / health / smokeを実行する。7403発生時はSTOP
- [ ] T9: self-review、commit、push、main向けPR作成。auto-mergeしない

## M11セルフレビュー観点

- Calendar検索と再利用検索を同じ画面へ混ぜていない
- title / place / memo、category scope、user ownership、limit、trim、case-insensitive、2文字条件を満たす
- recurrence / period / cancelled / overrideは既存projection / copy semanticsを壊していない
- BottomSheetはportal、input 16px以上、safe-area、スクロール、backdrop、closeを維持している
- flat list / divider / no card / no shadow / orange accentでDESIGN.mdに沿っている
- production/default・HouseToDo未操作、auto-mergeなし

---

# Milestone 10 Tasks

## 小タスク

- [x] T1: 最新origin/main（PR #11 merge済み）から`codex/m10-money-analysis`を作成し、指定docs・既存Money UI・projectionを監査
- [x] T2: M10の画面構成・year aggregation・forecast / actual / future month仕様を`.ai/MILESTONE.md`へ記録
- [x] T3: MoneyService year projectionと`/api/money/year-summary`を実装する
- [x] T4: Money画面headerの分析入口と`/money/analysis` sub screen navigationを実装する
- [x] T5: 年selector、global toggle、summary、SVG line chart、月detail、年間category donut、empty stateを実装する
- [x] T6: projection / aggregation / boundary / actual / category / future month unit testとcomponent / E2Eを追加する
- [x] T7: 390×844 Evidence（通常Money、分析、toggle、year swipe、point tap、past/future、empty、back、bottom nav）を作成する
- [x] T8: lint / typecheck / unit / build / E2E、staging deploy / health / smokeを実行する。7403発生時はSTOP
- [x] T9: DESIGN.md self-review、関連docs同期、commit / push / PR作成。auto-mergeしない

## M10セルフレビュー観点

- 通常Money画面へ分析graphを追加していない
- `お金の分析`は独立bottom-nav destinationではなく、Money selectedのsub screenである
- `docs/DESIGN.md`のclean / reassuring / cardを乱用しない / dashboard化しない方針を守る
- 年集計はMoneyProjectionを再利用し、chart専用の別recurrence計算を持たない
- 実績modeでplanned-onlyと未来0円線を表示しない
- category colorKeyは通常Money donutと同じfallback規則を使う
- 390×844で情報量、tap target、scroll、Bottom Navigation、back navigationを確認する
- production/default・HouseToDoへ操作しない

---

# Milestone 9 Tasks

## 小タスク

- [x] T1: PR #9 merge済み最新`origin/main`から`codex/m9-money-occurrence`を作成
- [x] T2: EventのRecurrenceRule / scope BottomSheet / following splitとM8 Money projectionを監査
- [x] T3: `0011_m9_money_occurrence.sql`、override / settlement repositoryを実装
- [x] T4: occurrence / following / seriesのMoney PATCH / DELETEとownership / migration_lockedを実装
- [x] T5: actual PUT / DELETE、positive integer validation、cancelled不可、estimated置換を実装
- [x] T6: 共通MoneyProjectionのeffective amount / display stateをCalendar / Daily / Moneyへ接続
- [x] T7: 月末estimated_actual serviceをtimezone基準でidempotent scheduled処理へ接続
- [x] T8: Money一覧の実績入力とscope interactionを実装
- [x] T9: unit / typecheck / lint / build / local migrationを実行
- [x] T10: M9 E2E、390×844 screenshots / videos、staging migration / deploy / smoke（Worker version `bc31a798-3275-4515-bae1-08bd89ccd02a`）
- [x] T11: self-review、docs同期、commit / push / PR作成。auto-mergeなし
- [x] T12: Money UI polish（header / summary / shared month swipe / row icon / inline detail / actual flow / Form mode / Calendar title / Daily row / expense donut）
- [x] T13: UI polish regression、Evidence、staging再deploy / smoke、PR #10追加commit / push。auto-mergeなし
- [x] T14: 最終UI調整（Money row tap / swipe排他、通常高action、共通primary、FormRow choice sheet）、M8/M9 regression、staging確認、PR #10へpush

## M9セルフレビュー

- occurrenceを事前生成せず、既存RecurrenceRule projectionを範囲内で合成している
- Override（予定定義の変更）とSettlement（実績の確定）を別table・別repositoryで扱っている
- base plannedAmountをactualで上書きせず、series編集でも過去settlementを変更しない
- Calendar / Daily / Moneyは同じMoney projectionのeffective amountを利用している
- userId ownership、cancelled occurrence、invalid occurrenceKey、migration_locked writeをroute/serviceで検証している
- production/default、HouseToDo、M10 Visualizationの残りには触れない（M9 UI polishとして当月expense donutのみ先行）

## 現在のstaging Cron（2026-10-01）

- Notification Scheduler: 5分ごと（`*/5 * * * *`）
- MoneySettlement: 1日1回、UTC 15:02 / JST 00:02（`2 15 * * *`）
- handlerはCronごとに片方だけを実行し、未知のCronは無視する。

---

# EventForm UX follow-up tasks

## 小タスク

- [x] 最新`origin/main`から`codex/eventform-time-default`を作成
- [x] 開始時刻変更時の1時間終了時刻デフォルトと23時台の同日内処理を実装
- [x] 終了手動編集、編集Event、recent Event、allDay、複数日予定の扱いを確認
- [x] unit / component testを追加
- [x] typecheck / lint / build / 全体testとself-reviewを実行
- [x] commit / push / PR作成。auto-merge、production/default、HouseToDo、M8移行はしない
- [x] PR #8の`mergeable: false`を再確認し、最新`origin/main`とのconflictなしを記録
- [x] `lifehub-staging`へdeploy（DB migrationなし）し、390×844相当のEventForm確認を実行
- [x] `artifacts/evidence/eventform-time/`へ指定Evidenceと23時台Evidenceを保存

## 対象外

- M7 notification周りの変更
- Money、production/default、HouseToDo

---

# Milestone 8 Tasks

## 小タスク

- [x] T1: PR #8 merge済み最新mainから `codex/m8-money-mvp` を作成し、M8境界を確認
- [x] T2: MONEY / DATA_MODEL / API / SCREEN / DESIGN / POLICYと既存fixture・adapterを監査
- [x] T3: `0009_m8_money.sql`、MoneyCategory / MoneyItem type・repository・serviceを実装
- [x] T3a: 既存EventのRecurrenceRule / projection engineを再利用したMoney recurrenceと`0010_m8_money_recurrence.sql`を実装
- [x] T4: 初期カテゴリensure、カテゴリCRUD、Money CRUD / recent / month / daily summary routeを実装
- [x] T5: API / repository / summary / migration_locked / ownership / validation testを追加
- [x] T6: MoneyFormとrecent definitions、entry context、progressive disclosureを実装
- [x] T7: Money画面のmonth navigation / summary / list / edit / deleteを実装
- [x] T8: Calendar / Date Sheet / Dailyへ共有Money projectionをadapter接続。既存layout / interactionは維持
- [x] T9: Settings > お金カテゴリの一覧 / add / edit / inactiveを実装
- [x] T10: UI / component / E2E、M3-M7 regression、390×844 Evidenceを実行・保存
- [x] T11: staging auth / D1 / migration / deploy / health / smoke / mobile確認（7403時はSTOP）
- [x] T12: self-review、docs implementation note更新、commit / push / PR作成。auto-mergeなし

## M8 implementation note

- 既存mainのCalendar adaptive rows、Money summary予約row、hidden count、Date Sheet / Daily interactionを維持したまま、fixtureを共有projectionへ置換した。
- M8時点ではplannedAmountのみを集計していた。M9でactual / estimated_actual / occurrence override / settlement / series splitを追加し、graph / budget / notificationは引き続き後続対象とする。
- MoneyFormの時間入力は削除し、SettingsカテゴリとMoney月一覧は共通swipe actionで操作する。stagingでは`0010_m8_money_recurrence.sql`適用後に再deploy・390×844 smokeを行う。

## M8セルフレビュー観点

- MoneyItemはEventと別modelで、recurrenceは既存RecurrenceRuleへの参照と共有projectionのみ。actual / estimated_actualを実装していない
- 金額は正数保存、符号はtype、soft delete、全queryにuserId ownershipがある
- Calendar / Daily / Moneyは同じMoney projectionを利用している
- Calendar adaptive rows・summary最終row・hidden count、Date Sheet、Daily swipe / inlineを置換していない
- 家計カテゴリはuser単位で初期ensureし、参照中カテゴリをhard deleteしていない
- progressive disclosure、390×844、既存Design tokenを維持し、カード過多・英語装飾を追加していない
- stagingのみを操作し、production/default / HouseToDoは未操作。M9へ進まない


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
