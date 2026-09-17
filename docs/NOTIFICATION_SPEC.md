# LifeHub 通知仕様

## 1. 目的

LifeHubの通知は以下の2系統に分ける。

1. 朝・夜のまとめ通知
2. 予定単体の通知

LifeHubはTodoではなく予定アプリであり、完了 / 未完了 / 対応済み等の状態は持たない。

## M14 Phase E+F readiness

Service Workerの登録入口は`src/lib/service-worker.ts`へ集約し、アプリ起動時に既存registrationの更新確認を行う。install / activate / push / notificationclick listenerとsame-origin deep linkを維持し、通知payloadにiconがない場合はLifeHub app iconを使用する。

通知の実機再確認では、permission → subscribe → timed Event / summary → receive → tap → Calendarの日付または関連Event contextを確認する。自動ブラウザで実機結果を代替せず、未実施項目はRC auditに残す。

---

## 2. 朝・夜のまとめ通知

その時点で「今日意識する予定」をまとめて通知する。

対象:

- 今日の固定日時予定
- 今日の終日予定
- 今日を含む複数日予定
- 今日が対象期間内に入る `this_week`
- 今日が対象期間内に入る `this_month`
- 今日が対象期間内に入る `custom_range`

period Eventは、その日がperiod occurrenceの有効期間内である限り朝・夜のまとめ通知に含める。

期限を過ぎたperiod Eventは過去予定となり、以後のまとめ通知には含めない。

同一タイミングのまとめ通知は1通知にまとめる。

例:

```text
今日の予定
- 10:00 歯医者
- 今週中: クリーニングを取りに行く
- 今月中: 美容院に行く
```

### 既定時刻

- 朝: 09:00
- 夜: 21:00

ユーザーは設定画面から朝・夜を個別にON/OFFし、時刻も変更できる。

---

## 3. period Eventの期限

### this_week

そのoccurrenceの週の最終日をdeadlineDateとする。週境界は `weekStartsOn` に従う。

### this_month

そのoccurrenceの月末をdeadlineDateとする。

### custom_range

`periodEndDate` をdeadlineDateとする。

基準となる週/月は `periodAnchorDate` とRecurrenceRuleからProjectionする。`createdAt` から推測しない。

---

## 4. 単体通知

予定ごとに設定したoffsetを基準日時から引いて発火する。

### 固定日時予定

occurrence開始日時を基準とする。

### 終日予定

対象日09:00を基準とする。この09:00は朝まとめ通知時刻とは連動しない。

### period Event

deadlineDate + deadlineTimeを基準とする。

例:

```text
今週中
締め切り: 日曜21:00
通知: 10分前
→ 日曜20:50
```

---

## 5. deadlineTime

period Eventには単体通知計算用のdeadlineTimeを持てる。

- 通常はUserSettingsの既定値を使う
- 初期値21:00
- 必要な場合のみ変更できる
- UIでは通常隠し、通知詳細等から変更可能にする

---

## 6. 通知offset

1予定に複数持てる。

例:

- 10分前 = 10
- 30分前 = 30
- 1時間前 = 60
- 1日前 = 1440

---

## 7. 通知テンプレート

複数offsetをまとめたプリセット。

例:

```text
標準
- 1日前
- 30分前
```

テンプレート適用時点でEventNotificationへコピーする。テンプレート変更で既存予定は自動変更しない。

---

## 8. 繰り返し予定

各occurrenceに対して同じ基準ルールを使う。

- timeあり scheduled: occurrence開始日時
- all-day scheduled: occurrence対象日09:00
- period: occurrence deadline

`this_week + weekly` は毎週その週のdeadline、`this_month + monthly` は毎月その月末deadlineを基準にする。

朝・夜まとめ通知は、その日が当該period occurrenceの有効期間内であれば含める。

---

## 9. 今回だけ編集との関係

- この予定のみ: EventOccurrenceOverride適用後の日時 / period / deadlineを使う
- この予定以降: 系列分割後の新定義を使う
- すべて: 元Event定義を更新する

今回だけ削除されたoccurrenceは単体通知・まとめ通知とも対象外。

---

## 10. NotificationDelivery

Cron再実行・retryによる重複送信を防ぐ。

Event単体通知は少なくとも `eventNotificationId + occurrenceKey + scheduledFor`、まとめ通知は `userId + notificationType + scheduledFor` で一意性を担保する。

---

## 11. 設定画面

最低限:

```text
通知

朝のまとめ通知
ON
09:00 >

夜のまとめ通知
ON
21:00 >

通知テンプレート >
```

初期値は朝09:00 / 夜21:00。

---

## 12. HouseToDoからの流用

流用・参考:

- Web Push
- Push subscription
- Service Worker
- scheduled Worker / Cron
- timezone-safe scheduling
- deep link
- 朝夜通知設定の考え方

新規設計:

- 1Eventに複数offset
- Event occurrence単位の通知
- period deadline基準通知
- 終日09:00基準
- NotificationTemplate
- NotificationDelivery

HouseToDoの単一 `notificationOffsetMinutes` はコピーしない。

---

## 13. 確定事項

- 完了 / 未完了状態は通知判定に使わない
- period Eventは有効期間内なら朝夜通知へ含める
- 期限後はまとめ通知から外す
- 朝・夜は個別ON/OFF可能
- 朝・夜時刻は個別変更可能
- period既定deadlineTimeは21:00
- 終日Event単体通知基準は09:00固定

---

## 14. M7実装記録

実装は`0008_m7_notifications.sql`でLifeHub専用の`push_subscriptions`、`event_notifications`、`notification_templates` / `notification_template_offsets`、`notification_deliveries`を追加した。Event単体のdedupe keyは`eventNotificationId + occurrenceKey + scheduledFor`、summaryは`userId + notificationType + scheduledFor`とする。

実機Push確認用の一時導線は、LifeHub staging originでのみ表示・実行し、ログイン中userの既存有効subscriptionだけを対象とした。結果表示は`sent` / `failed`のみとし、subscription値やVAPID secretは扱わなかった。Event単体通知、朝summary、夜summaryの実機確認完了に伴い、temporary UI/APIは削除済みである。

Workerは5分Cronで対象時刻近辺を判定し、claim leaseは10分、stale pendingは再claim可能とする。送信はsubscriptionごとに独立して実行し、404/410だけ該当subscriptionをdisableする。成功済み端末へのpartial failure再送はdelivery claimで抑止する。

HouseToDoから実際に確認した具体的ファイルは、Backendの`worker/routes/notifications.ts`、`worker/routes/notification-settings.ts`、`worker/services/push-subscription-service.ts`、`worker/repositories/push-subscription-repository.ts`、`worker/services/web-push-service.ts`、`worker/services/notification-scheduler-service.ts`、`worker/repositories/notification-delivery-repository.ts`、`worker/index.ts`、Frontendの`public/sw.js`、`src/main.tsx`、`src/api/notifications.ts`、`src/lib/capabilities.ts`、`src/lib/vapid.ts`、`src/lib/notification-url.ts`、および指定テスト8件。採用したのはlifecycle / Web Push / lease / timezone / safe URLの考え方だけで、Household / Task完了判定は採用していない。

staging secretは`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_SUBJECT`を使用し、値はGit・docs・log・PRへ保存しない。

`WEB_PUSH_VAPID_PRIVATE_KEY`のcanonical形式は、公式`web-push generate-vapid-keys`が出力するURL-safe base64のP-256 private scalarとする。Workerは既存環境との互換性のためJSON JWKも受理し、base64 private scalarはstagingのpublic keyからJWKの`x` / `y`を組み立ててimportする。LifeHub用`node scripts/generate-vapid-secrets.mjs <repo外出力先> <mailto-or-https-subject>`は値を表示せず、3 secretファイルをrepo外へ生成する。

2026-09-09、stagingのiPhone PWAでpermission → subscription → direct Push → Event単体通知 → 夜summary → 朝summaryの受信を確認した。各通知のtapで設定または対象日のCalendarへ遷移し、朝summaryは9/9 Calendarを開いた。自動ChromiumおよびCodex In-app Browserのpermission deniedは実機確認とは分けて記録する。
## 15. M14 settings readiness

Notification settingsとNotificationTemplate settingsは、初期loading、load error + retry、saving / deleting busyを表示し、通信中の二重submitとtemplate重複作成を防ぐ。画面遷移rowのchevronは共通FormRowに任せ、時刻やtemplate summaryの文字列へ追加の`>` / `›`を含めない。EventFormでは「なし・保存済みtemplate・custom offset」から選択し、保存時はtemplate参照ではなく既存どおりEventNotificationへoffset snapshotを保存するため、template後編集・削除は過去Eventへ波及しない。
