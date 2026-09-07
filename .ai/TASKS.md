# Milestone 1 Tasks

## 小タスク

- [x] T1: 最新`main`確認、M1 branch作成、指定docs確認
- [x] T2: HouseToDoから汎用のbuild / test / Worker / UI構造を調査
- [x] T3: React / Vite / TypeScript / ESLint / Vitest / Playwright基盤を作成
- [x] T4: Cloudflare Worker + Vite assets、local D1、`wrangler dev`設定を作成
- [x] T5: PWA manifest / Service Workerの最低限の土台を作成
- [x] T6: LifeHub token、Button、Input、FormRow、BottomSheetを実装
- [x] T7: 390×844 mobile shellとevidence確認画面を実装
- [x] T8: unit / Playwrightを作成・実行し、screenshot evidenceを保存
- [x] T9: 各種self-review、関連docs更新、最終test
- [ ] T10: commit、push、main向けPR作成。自動mergeしない

## 進捗メモ

### T1

- 2026-09-07: `origin/main`をfetchし、`30cdbe0`を確認。
- 2026-09-07: `codex/milestone-1-application-foundation`を作成。
- 2026-09-07: 指定された`DEVELOPMENT_POLICY.md`と`IMPLEMENTATION_PLAN.md`はリポジトリに存在しないことを確認。

### Self-review checklist

- HouseToDo固有ドメイン混入: なし（LifeHub専用Worker / UI / migrationのみ）
- green theme混入: なし（primaryはLifeHub orange token。successは汎用状態色のみ）
- mobile-first: 確認済み（390×844 Playwright + screenshot）
- 共通UIの再利用可能性: 確認済み（`src/components/ui/`へ分離）
- M2以降の先行実装: なし（Auth / Calendar / Event / Money API・画面は未実装）
