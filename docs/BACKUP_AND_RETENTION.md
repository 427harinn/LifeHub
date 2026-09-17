# LifeHub バックアップ・データ保持仕様

## 1. 目的

LifeHubは個人用の長期利用アプリであり、予定・お金・日メモを長期間残す。
一方で、Cloudflare D1へ無期限に履歴を蓄積し続けて不要な容量増加・将来的な課金要因を作らないようにする。

そのため、LifeHubでは以下を分離する。

- 最近のデータ: Cloudflare D1
- 古い履歴: 端末IndexedDB
- 機種変更・復元用: JSONバックアップ

## M14 Phase E+F release boundary

Release Candidateのbackup確認はJSON export、archive history、error / retryの回帰に限定する。Phase E+Fではschema migrationやdestructive full migrationを追加・実行せず、stagingのmigration status確認と専用fixture userによる既存回帰だけを許可する。通常のbackup exportは従来どおりD1 / archiveを読み取り、ユーザー状態を変更しない。

---

## 2. 基本方針

- ユーザーが過去データを失わずに使い続けられることを優先する
- 古いデータを単純削除しない
- D1から削除する前にローカルアーカイブ保存成功を必ず確認する
- ローカルアーカイブ後も通常のCalendar / Daily / Moneyから閲覧可能にする
- 機種変更時に、クラウド・ローカル双方を含む完全なJSONを書き出せるようにする
- 機種変更中はアカウントを通常利用できない状態へ切り替え、インポート完了後に再開する

---

## 3. 保存先

### 3.1 D1

最近の予定・お金・メモ・設定等を保持する。

D1は以下に向く。

- 現在〜近い過去のCalendar表示
- 通知計算に必要な予定
- recurrence定義
- 最近のMoney集計
- 最近の検索

### 3.2 IndexedDB

一定期間より古い履歴を端末内に保存する。

対象:

- 過去Event
- Event occurrence override
- 過去Money occurrence / override
- DailyNote
- 過去表示に必要な最低限の関連データ

localStorageではなく、構造化データ・件数増加に向くIndexedDBを利用する。

### 3.3 JSONバックアップ

機種変更・復元時に使う正本。
端末内アーカイブとD1の双方をまとめて1ファイルにする。

---

## 4. クラウド保持期間

初期仕様では **直近1年分をD1に保持**する。

重要:

- recurrenceの親定義など、未来の予定生成に必要なデータは「古い」という理由だけで削除しない
- 現在も続くMoneyItem定義もD1に残す
- 古い履歴だけをIndexedDBへ退避する

---

## 5. アーカイブ対象判定

単純に `createdAt` で判断しない。

### 単発Event

終了日時が保持境界より前で、今後参照すべきクラウド上の関連処理がない場合に候補。

### 終了済みrecurrence系列

recurrence endsOn が保持境界より前で、今後発生しない場合に候補。

### 現在も続くrecurrence

親Event / RecurrenceRuleはD1に残す。
古いoccurrence override等だけをアーカイブ対象にできる。

### Money

過去月のoccurrence / actual / estimated_actualはアーカイブ可能。
現在も続く定期MoneyItem定義はD1へ残す。

### DailyNote

対象日が保持境界より前なら候補。

---

## 6. 自動アーカイブのタイミング

**月1回、または月初のアプリ起動時に、現在日から12か月より古い履歴をまとめてアーカイブ候補にする。**

各予定のちょうど1年後に個別処理する方式、12月31日に年1回だけ処理する方式は採用しない。

例:

2027年10月1日時点では、2026年10月1日より前のアーカイブ可能履歴を対象にする。

ローカルIndexedDBへの保存が必要なので、サーバーCronだけで勝手に削除しない。

---

## 7. アーカイブ処理

安全性を優先し、以下の順序を必須とする。

1. D1からアーカイブ対象を取得
2. IndexedDBへ保存
3. 保存した件数・ID・checksum等を検証
4. ローカル保存成功状態を記録
5. その後にのみD1から対象履歴を削除
6. アーカイブメタデータを更新

途中失敗時はD1削除を実行しない。

「先にDBから削除して後で保存」は禁止する。

---

## 8. 過去データの読み込み

Calendar等が古い期間を表示するとき:

1. 対象期間がD1保持範囲内 → APIから取得
2. ローカルアーカイブ対象 → IndexedDBから取得
3. 境界月など両方にまたがる場合 → merge

UI側では保存先を意識させない。

---

## 9. JSONエクスポート内容

機種変更用JSONには、LifeHubのCalendar / Daily / Moneyを再構築できる情報をすべて含める。

最低限:

- schemaVersion
- exportedAt
- appVersion
- user settings
- Event
- RecurrenceRule
- EventOccurrenceOverride
- EventNotification
- NotificationTemplate / offsets
- DailyNote
- MoneyItem
- Money recurrence / occurrence override
- actual / estimated_actual
- MoneyCategory
- D1に残っている履歴
- IndexedDBへアーカイブ済みの履歴
- アーカイブメタデータ

秘密情報は含めない。

- session token
- password hash
- VAPID private key
- Cloudflare secret

---

## 10. 機種変更モード

通常のバックアップとは別に、設定画面に明確な `機種変更` 導線を持つ。

### 確定フロー

1. `機種変更を始める`
2. 強い確認画面を表示
3. D1 + IndexedDBから完全JSONを生成
4. JSON schema / 件数 / checksumをローカルで検証
5. ユーザーがファイルを保存
6. 保存したJSONを再選択して正常に読み取れることを検証
7. 復元可能な内容であることを確認表示
8. `このバックアップで機種変更を開始` を実行
9. D1の移行対象データを削除
10. アカウントを `migration_locked` 状態へする
11. 新端末で同アカウントへログイン
12. JSONをインポート
13. Calendar / Daily / Moneyの復元確認
14. 復元成功後に `migration_locked` を解除

エクスポートボタンを押しただけではD1を削除しない。
**保存済みJSONの再読込・検証後の最終確認を、D1削除の必須条件とする。**

---

## 11. migration_locked 中の挙動

アカウントが機種変更中の場合:

- Calendar / Daily / Moneyの通常操作は不可
- 新規Event / Money登録不可
- 編集 / 削除不可
- 通知スケジュール対象から除外可能
- 画面は機種変更専用UIへ誘導

可能な操作:

- バックアップJSONのインポート
- 必要なら機種変更キャンセル / 復旧導線

---

## 12. JSONインポート

新端末への復元専用として扱う。
初期仕様では既存データとの一般的なマージ用途には使わない。

前提:

- migration_locked状態
- 新端末側に通常データがない

処理:

1. schemaVersion確認
2. JSON全体validation
3. checksum確認
4. 件数・対象期間確認
5. 最近1年分と将来必要な定義をD1へ復元
6. 1年より古い履歴をIndexedDBへ復元
7. Calendar / Daily / Money再構築検証
8. 復元成功後にmigration lock解除

重複マージを初期仕様の中心にはしない。

---

## 13. CSV

CSVはバックアップの正本にしない。

閲覧・表計算用途として将来的に以下を出力してもよい。

- 予定一覧.csv
- お金一覧.csv

機種変更・復元はJSONを正とする。

---

## 14. 通常バックアップとの違い

- 通常バックアップ: コピーを作るだけ。D1削除・アカウントロックなし
- 機種変更: 完全JSON検証後にD1整理 + migration lock

UI上で明確に分ける。

---

## 15. 削除との違い

- 削除: ユーザーがその予定を不要として消す操作
- アーカイブ: 過去履歴を保持したまま保存先をD1から端末へ移す操作
- 機種変更: 完全バックアップを新端末へ移し、旧クラウド状態を整理する操作

アーカイブされた予定はCalendar上から消えない。

---

## 16. M12 Local Archive 実装固定事項

M12では、機種変更JSONの実装は行わず、端末IndexedDBへのforeground archiveだけを実装する。

保持境界はUserSettingsのtimezoneで現在日を求め、calendar month基準で12か月戻した日付とする。`date < retentionBoundary` がarchive対象であり、境界当日はD1に残す。`createdAt`や単純な365日前では判定しない。

DB名は `lifehub-archive`、schemaVersionは `1`。storesは `archiveBatches`、`archiveRecords`、`archivedSearchIndex` とし、batch transaction、userId scope、同一checksumのidempotent put、read-back検証を行う。保存失敗・read-back失敗・件数 / ID / checksum不一致時はrollbackし、confirmを呼ばない。logoutでは削除しない。

serverはschemaVersion、generatedAt、userId、retentionBoundary、archiveBatchId、表示再構築用snapshotと、D1 delete対象だけを列挙したmanifestを返す。継続中の親定義をsnapshotへ含める場合があってもdelete manifestへ含めない。checksumはWeb Crypto SHA-256で、object keyを再帰的にsortしarray順序を維持するcanonical serializationをclient / Workerで共有する。

処理順は `GET /api/archive/candidates` → IndexedDB保存 → read-back → IDs / 件数 / checksum検証 → local metadata verified / confirm_pending → `POST /api/archive/confirm` → server再検証 → atomic D1 delete → local metadata confirmed と固定する。stale batch、confirm 409/500、confirm後network disconnectでもlocal archiveは保持し、未確認ならD1を削除しない。confirmは同じbatchの再試行を許可する。

単発 / period Eventは実効終了日、終了済みrecurrence系列は`endsOn`、DailyNoteは日付、Moneyは単発・終了済み系列の定義と古いoverride / actual / estimated_actualを対象にする。継続中Event / RecurrenceRule / MoneyItem / Money recurrenceはD1に残し、古いoverride / settlementだけを対象にできる。将来へ移動したoverrideは残す。

Calendar / Daily / Money / Searchはserver projectionとIndexedDB snapshotをstable occurrence identityでmergeし、archive済み履歴を通常画面から消さない。

### M12 authority / projection correction

Archive recordは`archiveBatchId`と`retentionBoundary`を保持する。local projectionは各batchについて`date < retentionBoundary`へrequest rangeをclampし、継続中の親snapshotからboundary日以降のoccurrenceを生成しない。D1 projectionとIndexedDB projectionが同じstable occurrence identityを返した場合は、Calendar Event / MoneyともD1を最終authorityとする。Searchもarchive batchの保持期間だけを対象とし、親snapshotを将来5年へ投影しない。

SettingsのJSON Backup rowはM13まで表示しない。M12で表示するbackup関連UIはLocal Archiveの状態と手動確認導線だけである。

---

## 17. M13 Backup / Device Migration実装固定事項

M13では通常バックアップと機種変更をUI・API・状態遷移で分離する。通常バックアップはD1 + IndexedDB archiveを読み取り、`lifehub-backup` schemaVersion 1 JSONを生成・自己検証して保存するだけであり、D1 delete、archive移動、`migration_locked`、通知停止、User state変更を行わない。

機種変更は、同じ完全JSONを生成して保存した後、ユーザーが保存済みファイルを再選択し、parse / size / schema / checksum / manifest / ID / FK / current user / restore可能性を再検証する。最終確認の `このバックアップで機種変更を開始` 後だけ `/api/migration/start` を呼ぶ。exportしただけではD1を削除しない。

serverは `user_migrations` にmigrationId、checksum、schema、manifest summary、status、cleanup / restore時刻を保存する。startはstate lock・migration metadata・移行対象domain cleanupをD1 batchで行う。users、sessions、lifehub_user_stateは残し、push subscriptionはdevice-specificのためbackupへ含めずcleanupする。cleanup後のcancelは単純unlockせず、backupからのrecovery restoreが必要である。

restoreは初期個人規模のsingle JSON request（client / Workerの10 MiB sanity limit）とする。serverはcategories → recurrence rules → events → templates/offsets → event notifications/overrides → DailyNote → Money items → overrides → settlements → notification deliveriesの順で既存IDを保持して復元する。D1 restore後もlockを維持し、client IndexedDB archive restore、server/client verification、`/api/migration/complete`の順でのみunlockする。失敗・通信断・重複送信では通常利用へ戻さずretryできる。

Backup JSON schemaの詳細は `docs/BACKUP_SCHEMA.md`、APIは `docs/API_SPEC.md`、stateは `docs/DATA_MODEL.md`を参照する。
