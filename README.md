# LifeHub

生活の予定・お金・日々の記録をひとつの時間軸で扱う、スマートフォン向け完全個人用アプリ。

## コンセプト

LifeHubはTodoアプリではなく、予定を中心に生活全体を見渡すためのアプリです。

- 家の予定と仕事の予定を分けて管理し、必要に応じてまとめて表示する
- 月カレンダーを中心画面にする
- 月カレンダーと1日単位のデイリー表示を行き来する
- 「日付は決まっていないが、この期間中にやりたい」予定も扱う
- 完了 / 未完了というTodo状態は持たない
- 予定と同じ時間軸に、ざっくりした家計簿を重ねる
- 予定メモと1日メモを残し、結果として軽いライフログになる
- 古い履歴はD1へ無期限に残さず、IndexedDBへアーカイブする
- JSONバックアップ / 機種変更復元を正式機能として持つ

## HouseToDoとの関係

LifeHubは `427harinn/HouseToDo` を参考にする独立プロダクトです。

積極的に流用・参考にするもの:

- React / Vite / TypeScript
- Cloudflare Workers / D1
- Auth / Session
- timezone / weekStartsOn utilities
- UI foundation / BottomSheet / mobile layout
- spacing / radius / typography
- Progressive Disclosure
- returnTo
- 「以前の項目から選ぶ」UX
- recurrence / notificationの汎用的な考え方

持ち込まないもの:

- Household / HouseholdMember / invite
- Task / TaskRecord
- 完了 / skip workflow
- Shopping
- weekly_flexible / monthly_flexible

LifeHubのUIはHouseToDoと同じ形・密度を継承し、メインカラーをグリーンではなくオレンジ系へ変更します。

## Cloudflare

HouseToDoとは完全に別リソースを利用します。

初期staging:

- Worker: `lifehub-staging`
- D1: `lifehub-staging`
- LifeHub専用VAPID keys / Cron

production/defaultは明示的なリリース作業まで触れません。

## 現在の段階

**設計Phase 0は完了し、実装開始可能な状態です。**

以降は `docs/IMPLEMENTATION_PLAN.md` のMilestone順に、branchを切ってCodexで実装・test・Evidence・docs更新・staging確認・PR作成まで行います。

詳細な開発ルールは `docs/DEVELOPMENT_POLICY.md` を正とします。

## ドキュメント

- [プロダクト仕様](docs/PRODUCT_SPEC.md)
- [画面仕様](docs/SCREEN_SPEC.md)
- [Eventフォーム仕様](docs/EVENT_FORM_SPEC.md)
- [データモデル](docs/DATA_MODEL.md)
- [繰り返し / Occurrence](docs/RECURRENCE_AND_OCCURRENCE.md)
- [通知仕様](docs/NOTIFICATION_SPEC.md)
- [お金仕様](docs/MONEY_SPEC.md)
- [API仕様](docs/API_SPEC.md)
- [デザインシステム](docs/DESIGN_SYSTEM.md)
- [バックアップ / データ保持](docs/BACKUP_AND_RETENTION.md)
- [Cloudflareインフラ](docs/CLOUDFLARE_INFRASTRUCTURE.md)
- [HouseToDo流用設計](docs/REUSE_FROM_HOUSETODO.md)
- [ロードマップ](docs/ROADMAP.md)
- [実装計画](docs/IMPLEMENTATION_PLAN.md)
- [開発方針](docs/DEVELOPMENT_POLICY.md)

> 仕様変更はコードだけで行わず、関連ドキュメントも同じ作業内で更新します。
