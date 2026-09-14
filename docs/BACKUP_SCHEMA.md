# LifeHub Backup JSON Schema v1

機種変更・復元の正本は `format: "lifehub-backup"` のJSONだけとする。CSVや通常利用中のmerge importはM13の対象外。Backup `schemaVersion` とM12 IndexedDB archive `schemaVersion` は別のversionである。

```text
LifeHubBackup
├─ format: "lifehub-backup"
├─ schemaVersion: 1
├─ exportedAt / appVersion / user: { id }
├─ cloud: settings, events, recurrenceRules, eventOverrides, eventNotifications,
│        notificationTemplates (offsets含む), notificationDeliveries,
│        dailyNotes, moneyCategories, moneyItems, moneyOverrides, moneySettlements
├─ archive: { schemaVersion: 1, batches, records }
├─ manifest
└─ checksum
```

全collectionはID順にstable sortしてcanonical JSON化する。object keyは再帰的にsortし、SHA-256のpayload checksum（cloud + archive）とfinal checksum（export metadata + manifestを含む）を持つ。`exportedAt`が変わればfinal checksumは変わるが、同じcloud/archive payloadのpayload checksumは一致する。

session / cookie / password / password hash / PBKDF2 credential material / VAPID private key / Cloudflare・Worker secret / OAuth・API token / push subscriptionは含めない。pushは新端末で再subscribeする。

parse、byte size（10 MiB以下）、format/schema、current user ID、checksum、manifest counts、duplicate ID、所有者、Event/recurrence/notification/Money FK、archive metadataを確認する。unknown newer schemaとcross-account backupは拒否する。
