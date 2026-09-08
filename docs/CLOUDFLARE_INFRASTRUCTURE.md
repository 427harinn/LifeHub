# LifeHub Cloudflare インフラ設計

## 1. 方針

LifeHub は HouseToDo とは完全に独立した Cloudflare リソースを使用する。

同じ Cloudflare アカウントを利用してよいが、Worker / D1 / Secrets / Cron / Push 設定を HouseToDo と共有しない。

HouseToDo 側の既存 Worker・D1・R2・Secrets・Cron・production/default 環境へ LifeHub 実装から触れない。

---

## 2. HouseToDo の現状

HouseToDo では現在、少なくとも以下のように環境を分離している。

- Worker: `house-to-do`
- Worker staging: `house-to-do-staging`
- D1: `house-to-do`
- D1 staging: `house-to-do-staging`
- R2: `house-to-do-attachments`
- R2 staging: `house-to-do-attachments-staging`

LifeHub はこれらを参照・再利用しない。

---

## 3. LifeHub のリソース名

### Production

- Worker: `lifehub`
- D1: `lifehub`

### Staging

- Worker: `lifehub-staging`
- D1: `lifehub-staging`

### R2

初期版では画像・添付ファイル要件がないため、R2 は作成しない。

将来必要になった場合のみ:

- `lifehub-attachments`
- `lifehub-attachments-staging`

を新規作成する。

HouseToDo の R2 bucket は利用しない。

---

## 4. Worker 構成

HouseToDo と同じく React/Vite の build artifact と Workers API を1つの Worker から配信する構成を第一候補とする。

想定:

```text
Browser / PWA
      |
      v
LifeHub Worker
  |- static assets
  |- /api/*
  |- scheduled jobs
      |
      +--> LifeHub D1
      +--> Web Push
```

LifeHub の Worker コード・bindings は LifeHub リポジトリ内だけで管理する。

---

## 5. D1

LifeHub 専用 D1 を新規作成する。

HouseToDo の schema / migrations を LifeHub D1 へそのまま適用しない。

Auth など流用するテーブルについても、LifeHub 側の migration として新しく定義する。

環境ごとに完全分離する。

```text
lifehub-staging
lifehub
```

staging migration を先に検証し、production migration は明示的な本番作業時だけ適用する。

---

## 6. Secrets

Secrets は Worker / environment ごとに LifeHub 専用値を設定する。

HouseToDo の secrets をコピー・共有しない。

特に Web Push 用 VAPID key は LifeHub 専用ペアを発行する。

理由:

- HouseToDo と LifeHub の Push subscription を独立させる
- 誤配信を防ぐ
- key rotation をアプリ単位で行える

---

## 7. Web Push

HouseToDo の実装方式は参考にするが、以下は LifeHub 専用とする。

- Service Worker
- Push subscription data
- VAPID public/private key
- notification deep link
- notification scheduler state

HouseToDo の subscription DB を共有しない。

---

## 8. Cron / Scheduled Worker

LifeHub 専用 Worker に Cron Trigger を設定する。

用途:

- 朝のまとめ通知
- 夜のまとめ通知
- 個別 Event notification
- 必要に応じた Money の月次確定処理

### M4 First Staging実績

- Worker: `lifehub-staging`
- D1: `lifehub-staging`
- staging deploy済み、health / login / Event CRUD / Calendar / Daily / DailyNote smoke成功
- M4では既存staging schemaを利用し、新規remote migrationは適用していない
- remote migration操作でCloudflare API `7403` permission errorが発生した。M4 blockerではないが、次回新しいremote migrationを適用する前に権限を解決する
- production/defaultとHouseToDoのWorker / D1 / R2 / Cron / secretsは操作しない

HouseToDo の Cron Trigger とは独立する。

Cron 自体は UTC で動作するため、実際に通知対象かどうかはユーザーの timezone と設定時刻をアプリ側で判定する。

朝・夜の通知時刻:

- default morning: 09:00
- default evening: 21:00
- ユーザー設定で変更可能

---

## 9. Application Settings

LifeHub は個人用アプリなので、Household Settings ではなく User Settings として持つ。

最低限:

```text
UserSettings
- userId
- timezone
- weekStartsOn
- morningSummaryTime (default 09:00)
- eveningSummaryTime (default 21:00)
- periodDeadlineTime (default 21:00)
- createdAt
- updatedAt
```

終日予定の個別通知基準は 09:00 固定とし、朝まとめ通知時刻とは別概念とする。

---

## 10. Environment 方針

LifeHub は最低限以下を持つ。

### local

- `wrangler dev`
- local D1
- production data へ接続しない

### staging

- `lifehub-staging`
- staging D1
- staging VAPID keys
- staging Worker URL

### production

- `lifehub`
- production D1
- production VAPID keys
- production URL / custom domain

---

## 11. デプロイ安全策

HouseToDo 開発で使っている安全方針を LifeHub にも採用する。

- 通常作業は staging まで
- production deploy は通常の Codex 指示へ含めない
- production migration を自動実行しない
- staging と production の DB ID を明示的に分離
- scripts は `deploy:staging` / `deploy:production` のように環境を名前で明示する
- 誤操作防止のため、可能な限り曖昧な plain deploy を開発フローでは使用しない

---

## 12. HouseToDo から流用するもの

参考・流用候補:

- Workers + Vite assets 構成
- D1 repository/service/route 構造
- API error handling
- Cookie session の実装
- Web Push 処理
- scheduled Worker の考え方
- timezone-safe date utility
- staging 運用フロー

流用しないもの:

- HouseToDo の Worker 名 / URL
- HouseToDo D1 ID / database
- HouseToDo R2 bucket
- HouseToDo Push subscription
- HouseToDo VAPID keys
- HouseToDo Cron jobs
- HouseToDo migrations を直接実行すること

---

## 13. 初期実装時に作成する Cloudflare リソース

最初の実装フェーズでは以下だけでよい。

1. LifeHub staging Worker
2. LifeHub staging D1
3. LifeHub staging 用 VAPID keys
4. staging Cron Trigger

production は staging で主要機能が安定してから作成する。

R2 は初期版では不要。

## 14. M4 First Staging運用

M4ではLifeHub専用のstagingだけを対象にする。

- Worker: `lifehub-staging`
- D1: `lifehub-staging`
- migration: M4では既存staging schemaを利用し、新規remote migrationは適用していない
- R2: 作成しない
- production/default: 作成・変更・deployしない

高密度Calendar確認用のfixtureはauthenticated test accountへ手動/APIで投入し、production seedにはしない。staging smokeではhealth、login、Event CRUD、Calendar range、Daily指定日、DailyNote CRUDを確認する。

remote migration操作ではCloudflare API `7403` permission errorが発生した。既存schemaでM4 smokeは成功しているためM4 blockerではないが、次回新しいremote migrationを適用する前に権限問題を解決する。

M5では`0005_m5_recurrence.sql`が新規remote migrationとなるため、7403の再確認が完了するまで`lifehub-staging`へのmigration / deploy / smokeを実行しない。2026-09-08に再確認した結果、Wrangler 4.129.0はOAuth認証で`d1 (write)` scopeを持ち、account `1ea7a50f1aef89d4159a26ca825386af`、D1 `lifehub-staging`、database ID `da75b9df-dcb6-4e80-991e-6310be3c1933`、`wrangler.jsonc`のstaging bindingが整合していた。`npx wrangler d1 migrations list lifehub-staging --env staging --remote`と`DB` binding形式はいずれも成功し、7403は再現しなかった。

7403は過去に発生したが現在は再現せず、OAuth/account認可状態またはCloudflare側一時状態の可能性があるため、解決済みとは断定しない。再発時は`wrangler whoami`、`wrangler d1 list`、database name / bindingのmigration list、config ID照合を同じ順序で行う。今回のstaging検証では`0005_m5_recurrence.sql`適用、staging deploy、health / auth / recurrence create / Calendar / Daily / occurrence edit / occurrence delete smokeが成功し、最終migration listは`No migrations to apply!`となった。production/defaultとHouseToDoは未操作である。
