# LifeHub 開発方針

## 1. 目的

LifeHubはChatGPTで仕様を整理し、Codexを中心に実装する。

HouseToDoで有効だった開発フローを引き継ぎつつ、LifeHubでは以下を特に重視する。

- UIをスクリーンショットで確認しながら進める
- 必要なら動画Evidenceも残す
- ユーザーの主な実機確認はスマートフォンで行う
- ある程度まとまった段階でstagingを用意する
- 仕様とコードを常に同期する
- milestoneごとにbranch / PRで区切る
- productionへ不用意に触れない

この文書は実装フェーズの共通ルールとする。

---

## 2. 基本開発フロー

各milestone / まとまった変更は以下の順で進める。

1. `main` を最新化する
2. 最新mainから新しいbranchを作る
3. `.ai/MILESTONE.md` と `.ai/TASKS.md` をCodex自身が作成・更新する
4. 関連仕様書を確認する
5. 実装する
6. 小タスクごとにセルフレビューする
7. lint / typecheck / unit / integration testを実行する
8. GUI変更は390×844でEvidenceを残す
9. 必要なら操作動画を残す
10. 実装によって仕様が変わった場合は同じ作業内でdocsを更新する
11. 必要な段階でstaging migration / deployを行う
12. stagingで実機確認できる状態にする
13. commit / pushする
14. Pull Requestを作成する
15. PRリンク・branch・commit・test・Evidence・staging状態を報告する
16. 自動mergeしない
17. レビュー / 実機確認後に手動mergeする

---

## 3. Branch / Pull Request

### Branch

- 作業開始時に毎回新しいbranchを作る
- latest `main` から切る
- 1つのmilestoneまたは意味のある変更単位でbranchを分ける
- mainへ直接実装しない

### Pull Request

実装完了時は必ずPRを作成する。

PR作成までをCodexの作業範囲とする。

報告内容:

- Branch名
- 最新commit SHA
- Pull Requestリンク
- 変更概要
- 実施したtest
- Evidence
- staging deploy有無
- migration有無
- 未解決事項

PRは自動mergeしない。

---

## 4. 文書更新

**毎回の作業で、コードと仕様書を同期する。**

変更に関係する文書をCodex自身が更新する。

主な文書:

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/SCREEN_SPEC.md`
- `docs/DATA_MODEL.md`
- `docs/API_SPEC.md`
- `docs/EVENT_FORM_SPEC.md`
- `docs/RECURRENCE_AND_OCCURRENCE.md`
- `docs/NOTIFICATION_SPEC.md`
- `docs/MONEY_SPEC.md`
- `docs/BACKUP_AND_RETENTION.md`
- `docs/DESIGN.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/CLOUDFLARE_INFRASTRUCTURE.md`
- `docs/ROADMAP.md`
- `.ai/MILESTONE.md`
- `.ai/TASKS.md`

ルール:

- 実装だけ先行して文書を放置しない
- 仕様と違う実装を見つけた場合、勝手にどちらかを正にせず確認する
- 実装上の理由で仕様変更が必要なら、理由と変更点をPRに書く
- 前Milestoneでレビュー・merge済みの画面は、新機能実装のために再設計しない。既存UIを維持できない理由がある場合は、その理由を報告して確認を得てから変更する
- 完了したTASKは `.ai/TASKS.md` に反映する
- milestone終了時は `.ai/MILESTONE.md` の状態も更新する

---

## 5. UI確認 / Screenshot Evidence

LifeHubはスマートフォンファースト。

基準viewport:

```text
390 × 844
```

GUI変更がある場合、Playwright等を使ってスクリーンショットを残す。

デザインの最上位仕様は `docs/DESIGN.md` とする。
HouseToDoと異なる理由がないUIは、独自のAI的な装飾を足さずHouseToDoのデザイン言語を継承する。

### 必ず見せたいもの

- 変更した画面の通常状態
- empty / loading / errorが関係する場合その状態
- BottomSheet等を追加した場合、開いた状態
- form変更なら主要な分岐状態
- Calendar変更なら予定が少ない状態と多い状態
- 複数日帯なら開始 / 継続 / 週またぎが確認できる状態

### 未完成機能のEvidenceルール

機能が後続Milestoneで未実装でも、**デザインレビュー対象の画面を `準備中` や完全なempty stateだけで済ませない。**

最終UIの構成・密度・階層を判断するため、必要に応じてfixture / dummy dataを入れる。

例:

- Calendar shell: 予定名、金額、複数日帯、`+N` の仮データ
- Daily shell: 終日、期間、時間あり、お金、今日のメモの仮データ
- Money shell: 支出見込み、収入見込み、残りそう、明細の仮データ
- Settings shell: root category rowとdetail画面の仮データ

fixtureは本番データやDB仕様と混同しない構造にし、後続実装で削除・差し替えしやすくする。

「まだAPIがない」ことを理由に、画面デザインを確認できない状態でEvidenceを出さない。

### Safe Area

- iPhoneのstatus bar / notch / Dynamic Islandを考慮する
- `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` 等を適切に利用する
- desktop browser上の390×844 screenshotだけでなく、実機で上端が詰まりすぎない構造にする

### Calendarの特別ルール

1日あたりの最大表示件数など、実際の密度を見て決める仕様は、**最大量のダミーデータを入れたEvidenceを作ってから決定する。**

---

## 6. 動画Evidence

静止画だけで判断しにくい変更は動画を残す。

例:

- BottomSheetの開閉
- swipe
- animation
- Calendar → Add → returnTo
- Dailyの日付移動
- recurrenceの対象範囲選択
- 機種変更フロー
- Push通知からdeep link

動画を常に必須にはしない。

**動きが仕様の一部である場合に必須**とする。

---

## 7. テスト方針

### Codex / CI側

最低限:

- lint
- typecheck
- unit test
- integration test
- build

変更内容に応じて:

- API test
- DB repository/service test
- recurrence projection test
- timezone境界test
- migration test
- Playwright E2E

を追加する。

### 特に重点的にtestする領域

- occurrenceKeyの安定性
- recurrenceの月末 / 週境界
- periodAnchorDate
- 今回のみ / これ以降 / すべて
- Money actual / estimated_actual
- Calendar / Daily / NotificationでProjection結果が一致すること
- migration_locked中の書き込み拒否
- archiveでD1削除前にローカル保存検証が行われること

---

## 8. ユーザー実機確認

ユーザーは主にスマートフォンでテストする。

そのため、ローカル確認だけで完了としない。

### stagingを用意するタイミング

初期の細かいfoundation作業すべてでdeployする必要はない。

以下のように、**実際にスマホで触る価値が出た段階**でstagingを用意する。

例:

- ログインできる
- Bottom Navigationで主要画面を移動できる
- Eventを登録できる
- Calendar / Dailyで表示できる

以降、スマホ操作に関係する大きなmilestoneではstaging確認を基本とする。

---

## 9. Staging

LifeHubはHouseToDoとCloudflareリソースを共有しない。

staging:

- Worker: `lifehub-staging`
- D1: `lifehub-staging`
- staging専用VAPID keys
- staging専用Cron

### staging作業ルール

- migrationは必要なものだけ適用
- migration前に対象environmentを確認
- deploy前後でWorker / bindingを確認する
- staging dataを消す操作は対象を明記する
- stagingで主要導線を確認してからPRをレビュー可能状態にする

---

## 10. Production安全ルール

**明示的な指示がない限りproduction/defaultへ触れない。**

禁止:

- production deploy
- production D1 migration
- production D1 data操作
- production secrets変更
- production Cron変更
- production R2操作
- HouseToDo production/defaultへの操作

`wrangler deploy` のように対象が曖昧な操作は避け、環境名を明示する。

Production作業は将来、独立したrelease milestoneとして扱う。

---

## 11. DB / Migration

DB変更時:

1. DATA_MODEL / API仕様を確認
2. migrationを作る
3. local D1へ適用
4. test
5. staging D1へ適用
6. staging smoke test
7. PRにmigration内容を記載

既存migrationを書き換えて履歴を壊すより、新しいmigrationを追加することを基本とする。

Production migrationは通常PRの作業範囲に含めない。

---

## 12. Cloudflare / 通知

LifeHub専用リソースのみ利用する。

通知変更では:

- VAPID keyをログへ出さない
- Push subscriptionをHouseToDoと共有しない
- timezoneを含めて検証する
- Cron retryによる重複通知をtestする
- 実機Push確認が必要な段階ではstagingで確認する

---

## 13. 認証 / Secret

- password / session token / secret / VAPID private keyをcommitしない
- credential値をログやEvidenceへ出さない
- `.dev.vars.example` 等にはダミー値のみ
- 実在credentialを推測・生成しない
- stagingとproductionのsecretを共有しない

---

## 14. Evidence保存方針

Evidenceは「実装できたと言うため」ではなく、レビューで判断するために残す。

PRから以下が分かる状態を目標にする。

- 何を変えたか
- どう見えるか
- どう操作できるか
- 何をtestしたか
- stagingで何を確認したか

不要になった巨大な古いEvidenceを無制限に増やさない。milestone単位で必要十分なものを残す。

---

## 15. セルフレビュー

各小タスク後に簡易セルフレビューを行う。

確認例:

- 仕様通りか
- HouseToDo固有コードを誤って持ち込んでいないか
- userId ownershipがあるか
- timezoneを無視していないか
- UIがHouseToDoのspacing/radiusから逸脱していないか
- greenをハードコードしていないか
- mobileで操作しにくくないか
- 不要な選択肢を最初から見せていないか
- 未完成機能を `準備中` だけで済ませてデザインレビュー不能にしていないか
- safe-areaを無視していないか
- test不足がないか

---

## 16. 完了条件

milestoneを「完了」と報告する条件:

- 実装済み
- 関連test pass
- lint / typecheck / build pass
- GUI変更ならEvidenceあり
- 必要なら動画あり
- 関連docs更新済み
- `.ai/MILESTONE.md` / `.ai/TASKS.md` 更新済み
- 必要なstaging確認済み
- branch push済み
- PR作成済み
- PRリンクを報告済み
- productionへ触れていない、または明示されたproduction作業だけ実施

---

## 17. Codexの報告テンプレート

実装完了時は最低限以下を報告する。

```text
Branch:
Commit:
PR:

変更概要:
- ...

Test:
- lint ✅
- typecheck ✅
- unit/integration ✅
- build ✅
- E2E ...

Evidence:
- screenshot: ...
- video: ...（必要な場合）

Staging:
- deploy: yes / no
- migration: yes / no
- URL / 対象Worker: ...

Docs updated:
- ...

未解決:
- なし / ...

Production/default:
- 未操作
```

---

## 18. 最重要原則

LifeHubでは「実装速度」より、**仕様・Evidence・staging実機確認・安全なPR運用が揃った状態で進むこと**を優先する。

ユーザーがスマートフォンで確認し、納得してから次へ進められる開発フローを維持する。
