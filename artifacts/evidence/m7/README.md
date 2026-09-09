# M7 Notification Evidence

対象: `https://lifehub-staging.427harinn.workers.dev` / viewport `390x844`

成功した確認:

- Settings通知section: この端末OFF、朝ON 09:00、夜ON 21:00、period期限21:00
- NotificationTemplate一覧・編集済み表示
- EventFormの通知なし / 複数offset / template適用
- VAPID public-key取得、invalid Push subscription拒否
- Event APIのnotifications `[1440, 30]` create / get

画像:

- `settings-notification-off-390x844.png`
- `notification-template-list-390x844.png`
- `notification-template-edited-390x844.png`
- `event-form-notification-multiple-390x844.png`
- `event-form-notification-template-applied-390x844.png`

実Push確認記録（2026-09-09）:

- 対象: LifeHub stagingのiPhone PWA。permission許可後、既存subscriptionが登録されている状態で確認した。
- direct Push: 受信とtapを確認し、LifeHub Settingsへ遷移した。
- Event単体通知: scheduler経由で受信し、本文が対象Eventと一致。tapで対象日Calendar / Eventを開いた。
- 夜summary: `evening_summary`、朝summary: `morning_summary`をstaging deliveryで確認。各slotは1件のみで、`status=sent`、duplicateなし。
- summary本文: 今日のscheduled予定と有効期間内のperiod予定を含み、Todo完了を前提にする文言なし。朝summaryのtapで9/9 Calendarを開いた。
- 0件時に送信しないことはscheduler unit testで確認した。
- 自動Chromium / Codex In-app Browserの`permission denied`は、実機確認とは別の環境差として保持する。

temporary direct Push UI/APIは、実機確認完了後に削除した。機密値、subscription endpoint全文、認証値はEvidenceに保存していない。
