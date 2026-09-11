# Milestone 12: Local Archive

## 現在のMilestone

M12実装完了（commit / push / PR作成前）。`origin/main` の `88c28dae0d6674255b208b5a116c130aed06c50d` から `codex/m12-local-archive` を作成した。`docs/BACKUP_AND_RETENTION.md` を正本とし、user timezone基準で12か月より古い履歴をIndexedDBへ保存・検証した後にのみstaging D1から厳密な対象を削除する。activeなEvent / RecurrenceRule / MoneyItem / Money recurrenceは定義年齢だけでは削除しない。production/default・HouseToDoは操作せず、auto-mergeしない。

## 完了条件

- [x] versioned IndexedDB `lifehub-archive` とArchiveMetadata、user scope、idempotent batch保存を実装
- [x] user timezoneのcalendar-month boundaryとEvent / period / recurrence / Money settlement / DailyNoteのcandidate判定を実装
- [x] `/api/archive/candidates` と`/api/archive/confirm` を実装し、batch ownership / checksum / manifest / count / stale snapshotを検証
- [x] IndexedDB保存、read-back、ID / 件数 / checksum検証に失敗した場合はconfirm / D1 DELETEを実行しない
- [x] confirm成功後だけD1のarchive対象をatomicに削除し、active parentとfuture projection定義を残す
- [x] Calendar / Daily / Money / Calendar SearchへIndexedDB archiveを統合し、boundary monthをdedupe merge
- [x] Settings > データ / バックアップにArchive状態と手動確認導線を追加
- [x] failure / recurrence parent / boundary / timezone / retry / E2E / 390×844 Evidenceを追加
- [x] docs、unit / integration / E2E、staging deploy / smokeを完了する。commit / push / PRは最終工程

## M12検証記録（2026-09-11）

- local: migration `0012_m12_archive.sql`適用、unit 115件、lint（既存warning 13件のみ）、typecheck、buildを通過。
- staging: `lifehub-staging` のみへmigration / deploy。health HTTP 200、migration listは`No migrations to apply!`。Worker version `9a10d859-3949-431f-9835-9b21c5964cc9`。
- staging E2E: archive前D1候補、local保存後のIndexedDB、confirm後のeligible D1削除、active recurrence parent保持、Search表示をassertし1件pass。
- Evidence: `artifacts/evidence/m12/archive-complete-390x844.png`、`artifacts/evidence/m12/archive-search-390x844.png`。
- Cloudflare API 7403は今回発生なし。production/default・HouseToDoは未操作。auto-mergeなし。

## 実装境界

- archive DB名は `lifehub-archive`、IndexedDB schemaVersionはM12で固定値を持たせ、record storeは将来分割可能なgeneric archive recordsとする。
- checksumはWeb Crypto SHA-256。object keyを再帰的にsortするcanonical serializationをclient/serverで共有する。
- Archive bundleは表示再構築用snapshotとD1 delete manifestを分離し、serverはclient申告だけを信用しない。
- `date < retentionBoundary` をarchive対象とし、boundary当日はD1に残す。boundaryはUTC日付ではなくUserSettings timezoneの現在日付からcalendar monthで12か月戻す。
- active recurrence parent / MoneyItem / RecurrenceRuleは保持し、古いoverride / settlementだけを移せる。終了済み系列は表示再構築に必要な定義一式をlocalへ保存してから整理する。
- M13のJSON export / import / migration_locked / 機種変更flowは実装しない。

## STOP条件

- `IndexedDB保存失敗・read-back不一致・件数不一致・ID不一致・checksum不一致・confirm 409/500` のいずれでもD1削除しない。
- Cloudflare API `7403` がstaging migrationで発生した場合はその場で停止し、別DB・別環境のworkaroundを使わない。
- production/default、HouseToDo、server Cronによる勝手なarchive削除には触れない。auto-mergeしない。

---

# Milestone 11: Search

## 現在のMilestone

M11実装完了。最新origin/main（006f815）からcodex/m11-searchを作成した。対象はCalendar全体のEvent検索と、家 / 仕事EventForm・MoneyFormの「以前の項目から選ぶ」server検索。Calendar検索は専用sub screen、再利用検索はHouseToDoのBottomSheet grammarをLifeHubのorange / DESIGN.mdへ合わせて実装した。production/default・HouseToDoは操作していない。

## 完了条件

- [x] Calendar Searchでtitle / place / memoを2文字以上・trim・case-insensitive・debounce検索し、past / futureのEvent occurrenceを最大50件表示
- [x] recurring / period / cancelled / overrideを既存projectionで解決し、結果tapで該当month・selected date・Date Sheetへ戻る
- [x] Event reuseはhome / workカテゴリを跨がず、未入力は直近8件、入力はserver検索で古い候補も取得する
- [x] Money reuseは未入力直近8件、title / category name（必要に応じmemo）のserver検索を追加し、既存copy / recurrence / settlement semanticsを維持する
- [x] 共通ReuseSearchSheet、keyboard / safe-area / scroll / click-through regressionを確認する
- [x] unit / component / E2E、390×844 Evidence、staging smoke、docs更新を完了する
- [ ] branch push・PR作成まで行い、auto-mergeせずSTOP

## 実装境界

- Calendar検索対象はuser所有のEventのみ。MoneyはCalendar検索対象外。
- Search resultはsource: serverを持つ将来拡張可能なinterfaceとし、occurrence単位で返す。
- Calendar検索は専用APIでD1から取得し、frontendで全Eventをfilterしない。
- 再利用検索は未入力時limit=8、入力時limit=50。1文字は検索しない。
- 新規migrationは原則追加しない。Cloudflare API 7403が出た場合は停止する。

## M11検証記録（2026-09-11）

- HouseToDo参照: `src/App.tsx`のTaskForm（`reuseQuery` / `filteredRecent` / `selectReuse` / reuse BottomSheet）と`ShoppingReusePanel`、`src/api/tasks.ts`の`listRecentTaskDefinitions(limit=8)`、`src/api/shopping.ts`の`listRecentShoppingItems(limit=8)`、`src/styles.css`の`.m2-task-form__reuse-trigger` / `.m2-task-sheet__reuse` / `.m2-task-sheet__list` / `.shopping-m4-reuse-trigger` / `.shopping-m4-reuse-sheet` / `.shopping-m4-reuse-list`を実読した。HouseToDoは未変更。
- local: typecheck / lint（既存warning 13件のみ）/ unit 109件 / build / M11 Playwright 2件を通過。Evidenceは`artifacts/evidence/m11/`、interaction videoは`artifacts/playwright/m11-search/test-results/`。
- staging: `lifehub-staging`へdeploy成功、health HTTP 200、M11 Playwright 2件pass。Worker version `d147d8e1-7a83-45f9-ab2c-27f4530bb52f`。
- Cloudflare API 7403は今回発生なし。新規migrationなし。production/default・HouseToDoは未操作。auto-mergeなし。

---

# Milestone 10: Money Visualization

## 現在のMilestone

M10実装完了。PR #11 merge済みの最新`origin/main`（`f59717d7e9ca0cd5d927c121a224a6a0efe66b75`）から`codex/m10-money-analysis`を作成した。通常Money画面は維持し、Money配下の独立した`お金の分析`画面、年集計API、年間推移・選択月detail・年間カテゴリdonutを追加した。M9で確定したMoneyProjection / settlementを唯一の金額計算正本とし、production/default・HouseToDoには触れていない。

## 完了条件

- [x] Money headerに分析入口を追加し、Money配下のsub screenとして戻り導線・Bottom Navigation selected状態を維持
- [x] `/api/money/year-summary`で1年12か月を一度にprojectionし、forecast / actual / category集計を返す
- [x] 年選択、global見込み / 実績toggle、summary、12か月line chart、月detail、年間カテゴリdonut、empty stateを実装
- [x] recurrence / override / cancelled / following split / settlement / historical anchorを既存projection経由で反映
- [x] unit / component / E2E、390×844 Evidence、staging smoke、docs更新を完了
- [x] branch push・PR作成まで行い、auto-mergeせずSTOP

## 実装境界

- 通常Money画面のmonth切替、summary、一覧、既存donut、見込み / 実績toggleは作り直さない。
- 年集計は`MoneyService.projectYear()`が1回のrange projectionから12か月へ集計する。実績はactual / estimated_actualのみ、planned-onlyは除外する。
- 実績modeの未来月は0円の線を描かず、未確定として値を`null`にする。
- graphは依存を増やさずSVGで描き、月ごとの44px相当hit areaを持たせる。カード・shadow・gradient・large orange surfaceは使わない。

## M10検証記録（2026-09-11）

- local: typecheck / lint（既存warningのみ）/ unit 104件 / build / M10 Playwright 390×844を通過。Evidenceは`artifacts/evidence/m10/`、操作videoは`artifacts/playwright/m10-money-analysis/test-results/`に保存した。
- staging: `lifehub-staging`へdeploy成功。Worker version `fc22ee5e-046e-450c-b8b1-30e7ba9506a3`、health HTTP 200、remote migration `No migrations to apply!`、M10 staging Playwright smoke 1件pass。
- Cloudflare API 7403は今回発生なし。migration追加なし。production/default・HouseToDoは未操作。auto-mergeなし。

---

# Milestone 9: Money occurrence override / actual / estimated_actual / series split / 月末確定

## 現在のMilestone

M9実装中。ベースはPR #9 merge済み最新`origin/main` (`c63041cab6c62ab5e741926d8016c4454dc2500e`)、branchは`codex/m9-money-occurrence`。Moneyのoccurrence単位planned override、occurrence/following/series scope、actual、過去月のestimated_actual固定、Calendar / Daily / Money共通projectionを対象とする。M10 Visualizationは対象外。

## 進捗

- [x] 最新origin/main取得、PR #9 merge済みSHA確認、新規branch作成
- [x] Event recurrence / scope grammarとM8 Money recurrence / projectionを監査
- [x] `0011_m9_money_occurrence.sql`、MoneyOccurrenceOverride / Settlement repositoryを追加
- [x] occurrence / following split / series scope APIとactual APIを実装
- [x] 共通MoneyProjectionへoverride・settlement・display stateを統合
- [x] Money一覧の実績入力、Eventと同じscope BottomSheet、Calendar / Daily接続を実装
- [x] 月末estimated_actual serviceを既存scheduled handlerへ`waitUntil`接続
- [x] unit / typecheck / lint / build / local migrationを実行
- [x] M9 E2E / 390×844 Evidence、staging migration / deploy / smoke（Worker version `bc31a798-3275-4515-bae1-08bd89ccd02a`）
- [x] Money UI polish（Daily/EventForm grammar、inline detail、状態icon、month swipe、カテゴリ別支出donut）を実装
- [x] UI polishのunit / E2E / 390×844 Evidence、staging再deploy / smoke、PR #10追加commit（auto-mergeなし）

## 実装境界

- Settlementは`actual`と`estimated_actual`を同一occurrenceでupsertし、actual取消時は当時保存したestimated値へ戻せる。base plannedAmountは変更しない。
- 過去月はactual、次にestimated_actualを優先し、未settleの既存データだけ安全なplanned fallbackを使う。現在月・未来はactualがなければoverride適用後plannedを使う。
- followingは元RecurrenceRuleを対象直前で終了し、対象日開始の新MoneyItem + RecurrenceRuleへ分割する。対象以降のoverride / settlement参照も新seriesへ移す。
- Money画面は従来の3行見込みsummaryを主役にし、予定は空丸、actual / estimated_actualはチェック丸で示す。内部語`actual` / `estimated_actual`は通常UIに出さない。カテゴリ別支出donutはM9 UI polishの先行範囲で、M10の残りは未着手。

## STOP条件

- stagingのみへmigration / deployする。Cloudflare API 7403が出た場合は直ちに停止する。
- production/default、HouseToDoは操作・変更しない。M10 Visualizationへ進まない。auto-mergeは実行しない。

## 検証記録（2026-09-10）

- localは全unit 84件、typecheck / lint / build、M8 Money回帰E2E、M9 UI E2E、Event scope API回帰を通過。最終UIではMoney rowのtap / swipe排他、通常高action、共通primary、FormRow choice sheetを確認した。Evidenceは`artifacts/evidence/m9/`、videoはPlaywright artifactへ保存した。
- stagingは`lifehub-staging`のみを対象に再deploy（Worker version `a0a7128a-f27a-4aec-bdf2-bfb9e818570f`）。追加migrationはなく、migration listは`No migrations to apply!`、health HTTP 200、最終M9 UI E2E、M8 Money回帰を通過した。実Push通知のみブラウザ権限拒否で未完了。
- Cloudflare API 7403は今回再発しなかった。production/default、HouseToDoの操作はない。

---

# EventForm UX follow-up: timed start default

## 現在のMilestone

M7 merge済み最新`main`から、時間あり予定の開始時刻変更に対する小規模UX改善を実装する。M8 Moneyには進まない。

## 対象と方針

- 新規のscheduled / 終日OFFで、終了未編集の間だけ開始時刻に終了時刻を1時間追従させる。
- 編集Eventとrecent Event適用後は、既存・コピー済みの終了時刻を明示値として尊重する。
- allDay、日付自動変更、M7 notification、Money、EventFormのUI/DOM/CSSは変更しない。
- 同日validationを維持し、23時台の自動計算は`23:59`に留める。

## 進捗

- [x] M7 merge済み最新`origin/main`を取得し、新規branchを作成
- [x] `.ai/MILESTONE.md` / `.ai/TASKS.md`へ記録
- [x] EventForm state / handlerを最小変更
- [x] unit / component testを追加
- [x] test / typecheck / lint / build、self-review
- [x] PR #8のGitHub API mergeabilityと最新`origin/main`との差分を確認（conflictなし）
- [x] staging deploy（Worker version `da117618-539d-41f8-95ca-64c1ed105c74`）と390×844確認
- [x] Evidence `start-follow-end-390x844.png` / `manual-end-kept-390x844.png` / `late-start-390x844.png`を保存
- [x] commit / push / PR作成（auto-mergeなし）

## STOP条件

- staging deployは`lifehub-staging`だけで行い、DB migrationは実行しない。
- production/default、HouseToDo、M8 Moneyは操作・変更しない。

---

# Milestone 8: Money MVP

## 現在のMilestone

M8実装中。ベースはPR #8 merge済み `origin/main` (`6d22c3315d9672c9dec2c91d58674604d3640e13`)、branchは `codex/m8-money-mvp`。対象はuserId所有の単発・繰り返しexpense/income、plannedAmount、MoneyCategory、月見込み、Calendar/Daily連携までとする。

## 完了条件

- [x] `0009_m8_money.sql`、MoneyCategory / MoneyItemのrepository / service / route
- [x] 既存user・新規userの初期カテゴリensure、カテゴリCRUD、soft delete
- [x] Money CRUD、recent definitions、月summary、daily net、ownership / validation / migration_locked
- [x] MoneyForm、Money画面、Calendar/Daily/Date Sheetの実データ接続、Settingsカテゴリ管理
- [x] 既存EventのRecurrenceRule / projection engineを再利用したMoney recurrence、系列全体編集・削除
- [x] M3-M7回帰、390×844 Evidence、staging migration / deploy / smoke
- [x] docs更新、commit / push / PR作成（auto-mergeなし）

## 明示的な非対象

- Money occurrence override / settlement / occurrence単位編集
- actualAmount / estimated_actual / 月末確定
- series scope、グラフ、予算、通知、銀行連携、OCR、archive / IndexedDB、M9以降
- Calendar / Dailyの再設計、EventFormへのMoney統合、production/default、HouseToDo

## 進捗

- [x] 最新origin/main取得、PR #8 merge済みSHA確認、新規branch作成
- [x] 指定docsと既存Money fixture / Calendar / Daily実装を監査
- [x] DB / repository / service / API
- [x] Money UI / entry point / Calendar / Daily / Settings adapter
- [x] tests / Evidence / staging smoke
- [x] self-review、docs同期、commit / push / PR作成

## M8 implementation note（2026-09-09）

- `0009_m8_money.sql`で`money_categories` / `money_items`を追加し、`0010_m8_money_recurrence.sql`でrecurrence index/metaを追加。MoneyItemは正数plannedAmount、type符号、soft delete、userId ownershipとし、既存`recurrence_rules`を参照する。新しいrecurrence engineやoccurrence保存テーブルは追加していない。
- 初期カテゴリはregister時とカテゴリ初回取得時にuser単位で`INSERT OR IGNORE` ensure。既存user・新規userの重複生成を防ぎ、カテゴリ削除は`active=false`。
- `/api/money`、`/api/money/month`、`/api/money/recent-definitions`、`/api/money-categories`一式を実装。共有Money projectionをCalendar / Date Sheet / Daily / Money画面で利用した。
- MoneyFormはexpense/income、numeric正数、category/date/recurrenceのFormRow + BottomSheet、メモのprogressive disclosure、recent定義、編集・削除に対応し、時間入力は持たない。Settingsのお金カテゴリとMoney月一覧は共通swipe actionでedit/inactiveをrevealする。
- local migration、recurrence unit/component tests、typecheck、lint、build、M8 Playwright E2Eを完了。Evidenceは`artifacts/evidence/m8/`に保存。
- M8時点のstaging記録。M9では`0011_m9_money_occurrence.sql`をstagingへ適用し、再deploy・smokeを行う。production/defaultとHouseToDoは操作しない。auto-mergeは実行しない。
- M8時点ではproduction/defaultとHouseToDoは操作していない。M9の作業でも同じ境界を維持する。


# Milestone 7: Notification

## 現在のMilestone

M7 Notification実装・staging実機検証完了。M6 merge済み`main`から作成した`codex/m7-notification`で、LifeHub個人用のWeb Push、Event単体通知、朝夜まとめ、テンプレート、delivery、deep linkを対象とした。M8 Moneyには進まない。

## 実装方針

- Household / Task / TaskRecord / complete / skip semanticsは持ち込まない
- M5/M6の`EventProjectionService`を通知の唯一のoccurrence sourceとし、occurrenceを事前保存しない
- `userId`所有の複数端末subscriptionを許可し、endpoint単位でupsertする
- EventNotificationは複数minute offset。Template変更は既存Eventへ遡及しない
- all-dayは09:00固定、periodはprojection後のdeadline、朝夜summaryはUserSettings時刻で判定する
- `migration_locked` userはsummary / Event単体通知を除外する

## M7進捗

- [x] 最新`origin/main`確認、M6 branchを再利用しない新規branch作成
- [x] 指定LifeHub docsとHouseToDo実コード・テストを監査
- [x] `0008_m7_notifications.sql`、PushSubscription、EventNotification、Template、Deliveryを実装
- [x] VAPID / Web Push、Service Worker、PWA capability、Settings、EventForm、deep linkを実装
- [x] scheduler / 5分Cron、lease / stale claim / retry / partial subscription failureを実装
- [x] unit / typecheck / lint / build / local migrationを実行
- [x] 390×844 Evidence、staging migration / deploy / smoke
- [x] staging iPhone PWAでpermission / subscription / direct Push / Event単体 / 夜summary / 朝summaryの受信、本文、tap、Calendar deep linkを確認（自動ブラウザとCodex In-app Browserのpermission deniedは別記録）
- [x] docs同期、self-review、commit / push / PR作成（auto-mergeなし）

## HouseToDo implementation note

実際に確認したファイル: `worker/routes/notifications.ts`, `worker/routes/notification-settings.ts`, `worker/services/push-subscription-service.ts`, `worker/repositories/push-subscription-repository.ts`, `worker/services/web-push-service.ts`, `worker/services/notification-scheduler-service.ts`, `worker/repositories/notification-delivery-repository.ts`, `worker/index.ts`, `public/sw.js`, `src/main.tsx`, `src/api/notifications.ts`, `src/lib/capabilities.ts`, `src/lib/vapid.ts`, `src/lib/notification-url.ts`および指定された8件のテスト。subscription lifecycle、Web Push暗号化、claim lease、timezone、safe same-origin URL、permission user actionのみを考え方として採用し、Household / Task完了判定は採用していない。

## 実機確認記録（2026-09-09）

- 対象は`https://lifehub-staging.427harinn.workers.dev`のiPhone PWAのみ。direct Push、Event単体通知、夜summary、朝summaryを受信した。
- Event単体通知は本文一致、tap、対象Event / 日付Calendarへのdeep linkを確認した。
- 夜summaryは`evening_summary`、朝summaryは`morning_summary`としてstaging deliveryを確認し、各slotは1件のみで重複しなかった。朝summaryはscheduled予定とperiod予定を含む本文を確認し、9/9 Calendarへ遷移した。
- summary本文にTodo完了を前提にする文言はなく、0件送信なしはunit testで確認した。

## STOP条件

- staging対象は`lifehub-staging` / `https://lifehub-staging.427harinn.workers.dev`だけ
- `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`不足時は値を表示・保存せず、secret設定を依頼して停止
- OAuth期限切れまたはCloudflare API 7403再発時は停止して再認証・権限確認を依頼
- production/defaultおよびHouseToDoのWorker / D1 / secrets / Cronは操作しない

---

# Milestone 5: Scheduled Recurrence Engine

## 現在のMilestone

M6実装中・PR #6作成前。対象はperiod Eventのみ。M7 notification / Money recurrenceは対象外。

## Milestone 6: Period Event

- `timingType=period`、`this_week` / `this_month` / `custom_range`を実装
- `periodAnchorDate`をcontext日として保存し、`weekStartsOn`に従って週を決定。custom rangeはanchorを保存しない
- this_week + weekly、this_month + monthlyだけをperiod recurrenceとして許可し、M5と同じprojection / scope / overrideを再利用
- Calendarはperiodを帯にせず、週開始日 / 月初 / custom range開始日にだけ表示。Daily / Date Sheetは期間内の日に表示
- periodは完了状態を持たず、home=オレンジ、work=青を使用する

## 目的

`Event + RecurrenceRule + EventOccurrenceOverride`から要求rangeだけを共通projectionし、Calendar / Dailyで同じoccurrenceを表示・編集できる状態にする。

## 実装内容

- daily / weekly / monthly、interval、weekdays、dayOfMonth、startsOn / endsOn
- UI上の「カスタム」詳細設定とprogressive disclosure
- stable occurrenceKey（`event:{eventId}:{date}T{time}`）
- 月末clamp、week boundary、timezone-safe date projection
- occurrence / following / seriesの編集・削除scope
- 今回のみmodified / cancelled override、series split、series soft delete
- M4 Calendar adaptive row、Daily inline expand、swipe edit、day swipe、Date Sheet、BottomSheet drag-down closeを維持

## Evidence

- `artifacts/evidence/m5/recurrence-{none,options,daily,weekly,monthly}-390x844.png`
- `artifacts/evidence/m5/recurrence-custom-weekdays-interval2-endsOn-390x844.png`
- `artifacts/evidence/m5/recurrence-end-none-390x844.png`
- `artifacts/evidence/m5/recurrence-form-summary-390x844.png`
- `artifacts/evidence/m5/{calendar,daily}-recurring-event-390x844.png`
- `artifacts/evidence/m5/{scope-selection,occurrence-modified,occurrence-cancelled,following-series}-390x844.png`
- `artifacts/evidence/m5/recurrence-registration-calendar-daily.webm`
- `artifacts/evidence/m5/swipe-scope-occurrence-edit.webm`

## 進捗

- [x] 最新`origin/main`をfetchし、M4を再利用しない`codex/m5-scheduled-recurrence-engine`を作成
- [x] 指定docsと7403 permission error記録を確認
- [x] RecurrenceRule / EventOccurrenceOverride migration、repository、validationを実装
- [x] 共通projectionとstable occurrenceKeyを実装
- [x] occurrence / following / seriesのAPI操作とownershipを実装
- [x] M4 UIを維持したrecurrence form / scope BottomSheetを実装
- [x] recurrence UI review対応: `[数値] 単位`表示、weekly開始曜日の自動選択、人間向けsummary、終了なし / 終了日、scope補助文、曜日0件validationを追加
- [x] unit / build / local migration / M5 Playwrightを実行
- [x] 7403再確認後のstaging migration / deploy / recurrence smoke
- [x] self-review、docs同期、commit / push / PR #5更新（自動mergeなし）

## M5 UI review update（2026-09-08）

- recurrence form rowは`カスタム`や生の`間隔 2`を表示せず、`2週間ごと 月・水`などのsummaryを表示する。
- weeklyはscheduled Eventの開始日の曜日を初期選択し、終了は`なし`または日付rowで設定する。
- scope sheetは3択の簡潔な1行表示を維持し、scopeの意味はdocs / API / testで定義する。
- 390×844 Evidenceはrecurrence summary、終了なし / 終了日、開始曜日、同一seriesのCalendar複数occurrenceを含める。

## STOP条件

M4で記録したCloudflare API `7403`は、2026-09-08の再実行では再現しなかった。WranglerはOAuth認証で、`d1 (write)` scope、account、`lifehub-staging` D1、database ID `da75b9df-dcb6-4e80-991e-6310be3c1933`の整合を確認した。`npx wrangler d1 migrations list lifehub-staging --env staging --remote`とbinding名`DB`の同コマンドはいずれも成功した。

7403は過去に発生したが現在は再現せず、OAuth/account認可状態またはCloudflare側一時状態の可能性がある。解決済みとは断定せず、今後再発時は`wrangler whoami`、`wrangler d1 list`、staging database name / bindingのmigration list、config ID照合の順に同じ切り分けを行う。今回の検証では`0005_m5_recurrence.sql`のstaging適用、staging deploy、health / auth / recurrence create / Calendar / Daily / occurrence edit / occurrence delete smokeが成功し、最終migration listは`No migrations to apply!`となった。production/defaultとHouseToDoは未操作。

---

# Milestone 4: Calendar + Daily MVP / First Staging

## 現在のMilestone

M4実装・local検証・390×844 Evidence・LifeHub staging deploy / smokeを完了。PR #4のmerge前最終状態として、Calendarは固定maxを採用せず、実測セル高から`availableRows`を算出するadaptive row allocationを正とする。

## 目的

M3 merge済みのCalendar / Daily UIを変更せず、共通Event range projection、Calendar / Dailyの日付連動、DailyNote CRUD、First Stagingを追加する。

PR #4 UI修正では、既存のCalendar / Dailyの色・構造を維持したまま、Calendarの罫線・帯・単日行の重なり、hidden件数、390×844の密度、月スワイプ、Event formのrow hit area、iPhone入力ズームを調整した。

## 実装内容

- `/api/calendar` は42セルに必要な6週グリッド範囲だけを取得
- `/api/daily` は指定日だけを取得し、Calendar / Dailyで同じ `EventProjectionService` を利用
- ownership付きscheduled Event projection、soft-deleted Event除外、複数日帯 / 週またぎ / 複数lane
- Date Sheetから選択日を維持したDaily遷移
- Dailyの前日 / 次日 / 今日、選択日表示、既存tap展開 / swipe編集を維持
- DailyNoteのget / upsert / empty-delete / delete、本文タップ編集
- M4高密度fixtureはE2E authenticated accountへ投入し、production seedにはしない
- Calendarは端末ごとの実測セル高から`availableRows`を算出し、超過Event / Money明細をhidden件数へ送る。固定max 2 / 3 / 4は採用しない
- `すべて`ではMoney summaryがある日の最終rowをMoney専用に予約し、Eventは残りrowへ配置する。Money summaryはhidden countに含めない
- `家` / `仕事`ではMoneyを表示せず、Money用row予約もMoney由来hidden countも行わない
- `お金`ではMoney名称を表示し、最終rowに日計を固定する
- multi-day帯、single-day Event、Moneyのrow競合を解消し、帯は罫線より上のlayer、開始 / 終了端のみ短縮・角丸とする
- Calendar month swipe、Date Sheet day swipe / inline expand / swipe edit / 小型quick-add、Daily day swipe、period row interaction、outside tap close、BottomSheet drag-down close、iPhone input zoom preventionを完了
- HouseToDoのaxis判定付き月スワイプとrow hit area方針をLifeHubへ適用

## Evidence

- `artifacts/evidence/m4/calendar-low-390x844.png`
- `artifacts/evidence/m4/calendar-high-390x844.png`
- `artifacts/evidence/m4/calendar-max-{2,3,4}-390x844.png`
- `artifacts/evidence/m4/calendar-money-390x844.png`
- `artifacts/evidence/m4/date-sheet-home-390x844.png`
- `artifacts/evidence/m4/date-sheet-work-390x844.png`
- `artifacts/evidence/m4/date-sheet-money-390x844.png`
- `artifacts/evidence/m4/date-sheet-390x844.png`
- `artifacts/evidence/m4/daily-normal-390x844.png`
- `artifacts/evidence/m4/daily-expanded-390x844.png`
- `artifacts/evidence/m4/daily-period-week-390x844.png`
- `artifacts/evidence/m4/daily-period-month-390x844.png`
- `artifacts/evidence/m4/daily-work-tab-390x844.png`
- `artifacts/evidence/m4/daily-swipe-edit-390x844.png`
- `artifacts/evidence/m4/daily-note-edit-390x844.png`
- `artifacts/evidence/m4/form-tap-targets-zoom-prevention-390x844.png`
- `artifacts/evidence/m4/calendar-month-swipe-{before,after}-390x844.png`
- `artifacts/evidence/m4/calendar-date-sheet-to-daily-note.webm`
- `artifacts/evidence/m4/returnTo-calendar-daily-add.webm`
- `artifacts/evidence/m4/calendar-date-sheet-daily-interactions.webm`
- `artifacts/evidence/m4/calendar-date-sheet-daily-swipe.webm`
- `artifacts/evidence/m4/date-sheet-quick-add-and-bottom-sheet.webm`
- `artifacts/evidence/m4/bottom-sheet-drag-close.webm`

## M4完了時点の判断

- Calendarは固定の最大表示件数を持たない。safe-areaやbrowser UIを含む端末ごとの実測セル高から`availableRows`を求める。
- `availableRows = 3`でEvent 4件 + Money summaryの場合はEvent 2件、最終rowにMoney summary、hidden Event 2件となる。Event 0件でも空rowを保ち、Money summaryを最終rowに置く。
- 390×844のmax 2 / 3 / 4候補比較は履歴Evidenceとして保持するが、固定maxを決めるためのOpen decisionではない。
- M4でscheduled Event projectionとDailyNote migration / API / UIは実装済み。period / recurrence / notification / Money / Searchの本実装は後続Milestoneで行い、M4 UIのperiod / Moneyの一部はfixture / placeholderである。
- staging remote migrationの実行時にCloudflare API `7403` permission errorが発生した。新規remote migrationはなく既存staging schemaでsmokeが成功しているためM4 blockerではない。次回migration適用前に権限を解決する。

## 進捗

- [x] 最新`main`からM3を再利用しないM4 branchを作成
- [x] 指定docsを確認
- [x] Event range projection / Calendar / Daily APIを実装
- [x] DailyNote migration / API / UIを実装
- [x] Calendar → Daily、前日 / 次日 / 今日、returnToを実装
- [x] unit / integration / build / local migration / M4 Playwrightを実行
- [x] 390×844 Evidenceと操作動画を作成
- [x] LifeHub staging resource確認 / 作成 / deploy / smoke（既存staging schemaで確認）
- [x] adaptive row allocation / multi-day・single-day・Money row競合 / Money最下段固定 / tab別Money表示 / hidden countを確定
- [x] Date Sheet day swipe / inline expand / swipe edit / quick-add small popup、Daily day swipe、period row interaction、outside tap close、BottomSheet drag-down closeを確認
- [x] iPhone input zoom preventionと390×844 Evidenceを確認
- [x] commit / push / main向けPR作成（自動mergeしない）

---

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

## PR #3 UI regression correction

- [x] HouseToDo `origin/main`のHome / Shopping行操作を確認し、Daily Eventへinline展開・左swipe編集を適用
- [x] M2 merged時点のCalendar / Dailyの情報階層、タブ、セル、色、fixture sectionを維持
- [x] Daily通常操作からEvent detail pageへの遷移を削除し、編集画面から削除できる深い導線を追加
- [x] Daily / Calendar回帰、tap展開・再tap・他行切替・swipe reveal・edit遷移のEvidenceと動画を更新
- [x] base commit `2130b034e2a00fbb2e6716f796980a39cd19b1ed`との差分を確認し、Calendar M2 DOM / CSS / densityをadapter接続へ戻した
- [x] DailyのM2 section order / transparent row / dividerを維持し、値のみのinline detailとHouseToDo式の排他interactionを確認
- [x] EventForm / Event editでBottom Navigationを非表示にし、Calendar / Daily回帰assertionと操作動画を更新

---
