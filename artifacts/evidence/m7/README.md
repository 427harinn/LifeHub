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

実Push確認記録:

- Playwright headless / headful Chromium: `pushManager.subscribe()` が `permission denied`
- Codex In-app Browser: 通知ON操作後に「通知の許可が必要です」
- したがって、このEvidenceは実機Push受信・通知tapの成功証跡ではない。iPhone PWAまたは通知許可可能な実機で、permission → subscription → test Push → tap → Daily/Event遷移を追加確認する。
