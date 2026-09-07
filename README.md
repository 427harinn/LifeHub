# LifeHub

生活の予定・お金・日々の記録をひとつの時間軸で扱う、スマートフォン向け生活管理アプリ。

## コンセプト

LifeHub は Todo アプリではなく、予定を中心に生活全体を見渡すためのアプリです。

- 家の予定と仕事の予定を分けて管理し、必要に応じてまとめて表示する
- 月カレンダーと1日単位のデイリー表示を行き来する
- 「日付は決まっていないが、この期間中にやりたい」項目も扱う
- 予定と同じ時間軸に、ざっくりした家計簿を重ねる
- 予定メモと1日メモを残し、結果として軽いライフログになる

## HouseToDo との関係

LifeHub は既存の `427harinn/HouseToDo` を参考にする独立プロダクトです。

HouseToDo の以下は積極的に流用・参考にします。

- React / Vite / TypeScript のフロントエンド構成
- Cloudflare Workers / D1 を中心としたバックエンド構成
- 認証 / Session / Household / timezone
- UI foundation / BottomSheet / スマートフォン向けレイアウト
- 登録フォームの progressive disclosure
- 「以前の項目から選ぶ」UI
- 日付・繰り返し・通知まわりの既存実装

一方、HouseToDo の Task / Shopping を中心としたドメインモデルはそのまま持ち込みません。

詳しくは [docs/REUSE_FROM_HOUSETODO.md](docs/REUSE_FROM_HOUSETODO.md) を参照してください。

## 現在の段階

現在は **設計フェーズ** です。

実装を始める前に以下を固めます。

1. プロダクト仕様
2. 画面仕様
3. HouseToDo からの流用範囲
4. データモデル
5. 通知・繰り返しモデル
6. MVPロードマップ

## ドキュメント

- [プロダクト仕様](docs/PRODUCT_SPEC.md)
- [画面仕様](docs/SCREEN_SPEC.md)
- [HouseToDo流用設計](docs/REUSE_FROM_HOUSETODO.md)
- [ロードマップ](docs/ROADMAP.md)

> 設計内容は実装前の検討に応じて更新します。未確定事項は各ドキュメント内で明示します。
